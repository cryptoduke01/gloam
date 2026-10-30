/**
 * A wallet's token history on Robinhood Chain, read in the visitor's browser
 * from the chain's public RPC. Never on the server, on purpose:
 *
 * - One wallet takes a few hundred log queries. The public RPC answers
 *   eth_getLogs over 10M blocks only for one token and one address at a time (a
 *   list of tokens gets 100k blocks, no token at all gets 30k), answers 429 to
 *   bursts, and stops accepting connections from an IP that keeps pushing. The
 *   server shares its IPs with the relay and /stats, so a busy day on this page
 *   must never be able to cut those off. A browser spends its own IP's allowance.
 * - The wallet goes to the chain's RPC and nowhere else: no Gloam server sees
 *   this read, and nothing of it is stored outside this tab's memory.
 *
 * A complete read takes a few minutes at a pace the RPC accepts, so it goes
 * token by token and hands back what it knows as it goes: the tokens this wallet
 * holds first, then the two that most moves go through, then the rest of the
 * list. The page says the figures can still change until the last token is read.
 *
 * Inbound first for each token: a wallet can only send what it has received, so
 * outbound is read only for a token that came in, and only from when it did.
 */
import { createPublicClient, formatUnits, parseAbiItem, type Address, type PublicClient } from "viem";
import { getLogsSafe, isRateLimit } from "@/lib/logRange";
import { getNetwork } from "@/lib/networks";
import { readTransport } from "@/lib/readTransport";
import { nodeFailed } from "@/lib/rpcList";
import { holdableTokens } from "@/lib/vaultAssets";
import { factsFrom, spansFrom, type XrayFacts, type XrayToken, type XrayTransfer } from "./history";

const TRANSFER = parseAbiItem("event Transfer(address indexed from, address indexed to, uint256 value)");

/**
 * One query at a time, with a short gap. Measured on the public RPC: one at a
 * time drew about 1 refusal in 70, two at once about 1 in 6, and each refusal
 * costs seconds, so two at once was the slower of the two.
 */
const GAP_MS = 250;
const IN_FLIGHT = 1;
/** How long everything waits after the node refuses, doubling up to the most, and how many refusals one query takes. */
const COOL_OFF_MS = 4_000;
const MAX_COOL_OFF_MS = 20_000;
const MAX_WAITS = 6;
/** More transfers than this is an exchange, a pool or a bot, not a wallet to total up in a browser tab. */
const MAX_TRANSFERS = 20_000;
/** A finished read is kept this long, in this tab's memory only. */
const FRESH_MS = 5 * 60_000;
/** Read straight after what the wallet holds: stablecoin and ETH sides of nearly every move here. */
const FIRST_IDS = ["usdg", "weth"];

/**
 * The block of each late token's first mint, checked on chain 2026-10-30: no
 * Transfer of it exists before this block, so nothing earlier is read. Every
 * other listed token was live within the chain's first million blocks.
 */
const FIRST_BLOCK: Readonly<Record<string, bigint>> = {
  "0xdcd885f5c60b3ad49f6d58718696417314e8724d": 39_918_259n, // GLOAM
  "0x9f4ba41f91a59a34e17ee8c9eb3a51363b11abd5": 64_691_488n, // GRIFT
  "0xce24439f2d9c6a2289f741120fe202248b666666": 56_765_550n, // U
  "0xcec185eb182c47d1ba1efc84e6959e18cd620be4": 36_577_714n, // cbBTC
  "0x39dbed3a2bd333467115de45665cc57f813c4571": 8_963_150n, // PONS
  "0x05a3d1cd21d0c88145e82600e62e7e496e0f222b": 35_463_882n, // AMC
  "0xccee82fe024c36fa15e1005ede3e9e4787e23d09": 35_477_382n, // HIMS
  "0xc9a981fee1f9dec688bb123ccdecc63d0debfc4e": 35_481_093n, // GLD
};

export type XrayHistory = Omit<XrayFacts, "firstBlock" | "lastBlock" | "firstFunder"> & {
  /** ms */
  firstSeen: number | null;
  lastSeen: number | null;
  firstFunder?: { address: string; amount: string; symbol: string };
};

export type XrayHistoryResult = { status: "read"; history: XrayHistory } | { status: "too_big" };

/** Where the read has got to: `tokens` of `of` fully read, and what has been found so far. */
export type XrayProgress = { tokens: number; of: number; history: XrayHistory | null };

class TooBig extends Error {}

/**
 * At most IN_FLIGHT queries, started GAP_MS or more apart. When the node refuses,
 * everything waits, longer each time it happens in a row, and the query goes
 * again. In a browser a 429 does not even look like one: the reply's CORS
 * header is doubled, so it arrives as a failed fetch. So any failure of the node
 * counts, and only what the node says about the query itself (a range too wide)
 * goes back to the caller.
 */
function pacer(signal?: AbortSignal) {
  let next = 0;
  let holdUntil = 0;
  let strikes = 0;
  let active = 0;
  const parked: (() => void)[] = [];
  const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

  return async function paced<T>(call: () => Promise<T>): Promise<T> {
    while (active >= IN_FLIGHT) await new Promise<void>((r) => parked.push(r));
    active++;
    try {
      for (let waits = 0; ; waits++) {
        let at = Math.max(Date.now(), next, holdUntil);
        next = at + GAP_MS;
        // a refusal while waiting pushes this start back too
        while (Date.now() < at) {
          signal?.throwIfAborted();
          await wait(at - Date.now());
          at = Math.max(at, holdUntil);
        }
        signal?.throwIfAborted();
        try {
          const answer = await call();
          strikes = 0;
          return answer;
        } catch (e) {
          if (waits >= MAX_WAITS || !(nodeFailed(e) || isRateLimit(e))) throw e;
          holdUntil = Date.now() + Math.min(COOL_OFF_MS * 2 ** strikes, MAX_COOL_OFF_MS);
          strikes++;
        }
      }
    } finally {
      active--;
      parked.shift()?.();
    }
  };
}

/** The tokens in the order they are read: what is held, then FIRST_IDS, then the list. */
function readingOrder(heldIds: readonly string[]): XrayToken[] {
  const rank = (id: string) => {
    const held = heldIds.indexOf(id);
    if (held >= 0) return held;
    const first = FIRST_IDS.indexOf(id);
    return first >= 0 ? heldIds.length + first : Number.MAX_SAFE_INTEGER;
  };
  return holdableTokens(getNetwork("robinhood-mainnet").chainId)
    .map((t, i) => ({ t, i }))
    .sort((a, b) => rank(a.t.id) - rank(b.t.id) || a.i - b.i)
    .map(({ t }) => ({ address: t.address.toLowerCase(), symbol: t.symbol, decimals: t.decimals, stock: t.kind === "stock" }));
}

async function read(
  wallet: Address,
  marks: Readonly<Record<string, number>>,
  heldIds: readonly string[],
  onProgress: (p: XrayProgress) => void,
  signal?: AbortSignal
): Promise<XrayHistoryResult> {
  const n = getNetwork("robinhood-mainnet");
  // retries live in the pacer, so a retry is never a burst
  const client = createPublicClient({ chain: n.chain, transport: readTransport(n, { timeout: 20_000, retryCount: 0 }) }) as PublicClient;
  const paced = pacer(signal);
  const me = wallet.toLowerCase();
  const tokens = readingOrder(heldIds);
  const byAddress = new Map(tokens.map((t) => [t.address, t]));
  const rows: XrayTransfer[] = [];

  const readSide = async (token: XrayToken, side: "from" | "to", from: bigint, to: bigint) => {
    const logs = await getLogsSafe(
      (a, b) =>
        paced(() =>
          client.getLogs({
            address: token.address as Address,
            event: TRANSFER,
            args: side === "from" ? { from: wallet } : { to: wallet },
            fromBlock: a,
            toBlock: b,
          })
        ),
      from,
      to
    );
    for (const l of logs) {
      const { from: src, to: dst, value } = l.args;
      if (!src || !dst || value == null || l.blockNumber == null || !l.transactionHash) continue;
      rows.push({
        token: token.address,
        from: src.toLowerCase(),
        to: dst.toLowerCase(),
        value,
        block: l.blockNumber,
        tx: l.transactionHash,
        logIndex: l.logIndex ?? 0,
      });
    }
    if (rows.length > MAX_TRANSFERS) throw new TooBig();
  };

  const stamps = new Map<bigint, Promise<number>>();
  const stamp = (block: bigint | null): Promise<number | null> => {
    if (block == null) return Promise.resolve(null);
    let known = stamps.get(block);
    if (!known) {
      known = paced(() => client.getBlock({ blockNumber: block })).then((b) => Number(b.timestamp) * 1000);
      stamps.set(block, known);
    }
    return known;
  };

  /** What the rows read so far show. */
  const history = async (): Promise<XrayHistory> => {
    const facts = factsFrom(me, rows, byAddress, (r) => {
      const amount = formatUnits(r.value, byAddress.get(r.token)!.decimals);
      const mark = marks[r.token];
      return { amount, usd: mark != null ? Number(amount) * mark : null };
    });
    const [firstSeen, lastSeen] = await Promise.all([stamp(facts.firstBlock), stamp(facts.lastBlock)]);
    const { firstBlock: _first, lastBlock: _last, firstFunder, ...rest } = facts;
    void _first;
    void _last;
    return {
      ...rest,
      firstSeen,
      lastSeen,
      ...(firstFunder ? { firstFunder: { address: firstFunder.address, amount: firstFunder.amount, symbol: firstFunder.symbol } } : {}),
    };
  };

  try {
    const latest = await paced(() => client.getBlockNumber());
    let finished = 0;
    const show = async () => onProgress({ tokens: finished, of: tokens.length, history: rows.length ? await history() : null });
    /** Newest span first: recent moves are on the page within seconds, and older ones fill in behind them. */
    const readSpans = async (t: XrayToken, side: "from" | "to", from: bigint) => {
      for (const [a, b] of spansFrom(from, latest).reverse()) {
        const before = rows.length;
        await readSide(t, side, a, b);
        if (rows.length > before) await show();
      }
    };

    await show();
    for (const t of tokens) {
      await readSpans(t, "to", FIRST_BLOCK[t.address] ?? 0n);
      let first: bigint | undefined;
      for (const r of rows) {
        if (r.token === t.address && r.to === me && (first === undefined || r.block < first)) first = r.block;
      }
      if (first !== undefined) await readSpans(t, "from", first);
      finished++;
      await show();
    }
    return { status: "read", history: await history() };
  } catch (e) {
    if (e instanceof TooBig) return { status: "too_big" };
    throw e;
  }
}

const held = new Map<string, { at: number; result: XrayHistoryResult }>();

/**
 * The wallet's history. `marks` values its transfers at today's prices, and
 * `heldIds` are the listed tokens it holds now, read first. Reading it again
 * within a few minutes in this tab costs nothing.
 */
export async function readWalletHistory(
  wallet: Address,
  marks: Readonly<Record<string, number>>,
  heldIds: readonly string[],
  onProgress: (p: XrayProgress) => void,
  signal?: AbortSignal
): Promise<XrayHistoryResult> {
  const hit = held.get(wallet);
  if (hit && Date.now() - hit.at < FRESH_MS) return hit.result;
  const result = await read(wallet, marks, heldIds, onProgress, signal);
  held.set(wallet, { at: Date.now(), result });
  return result;
}
