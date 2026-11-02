/**
 * Who pays the network fee when a Gloam wallet (lib/embeddedWallet) sends a
 * transaction. A new Gloam wallet holds no gas, so this matters on its very
 * first step.
 *
 * Most of what a new wallet does first needs no gas from it at all:
 *  - claiming a payment link, and receiving a private payment: the Gloam relay
 *    sends the claim (lib/claimSweep), so the wallet never pays
 *  - paying privately, cashing out, payroll and private swaps: the relay sends
 *  - bringing money over from Solana or another wallet straight into the
 *    private balance: that wallet pays on its own chain and Relay makes the
 *    deposit (lib/bridgePrivate)
 *  - backing up the private balance and making proofs: signatures, no sends
 *
 * The wallet pays only when it sends from its own public balance: adding money
 * privately (approve and deposit), a public send, paying a bridge order from
 * this wallet on another chain, and setting a fee token on Tempo. For those:
 *  - Tempo has no gas coin. Fees come out of a USD stablecoin the wallet holds,
 *    and the wallet's fee token is set first when it needs one (lib/feeSponsor),
 *    the same as for a browser wallet. Nothing is sponsored there.
 *  - Elsewhere the wallet pays from its own ETH when it holds enough. When it
 *    doesn't, and the chain is in NEXT_PUBLIC_TURNKEY_SPONSOR_CHAINS, Turnkey's
 *    gas station sends it and Gloam's Turnkey account pays the fee. That needs
 *    Gas Sponsorship on in the Turnkey dashboard, with its spend limits.
 *  - Otherwise nothing is sent, and the wallet says how to get money in
 *    without gas.
 *
 * Sponsoring only when the wallet can't pay keeps the cost to Gloam down: a
 * wallet that brought ETH over pays its own way.
 */

/**
 * Chains Turnkey's gas station sponsors (docs.turnkey.com/features/transaction-management,
 * read 2 November 2026). Gloam's four mainnets and their testnets are all here, with
 * the bridge's other EVM chains Turnkey covers.
 */
export const TURNKEY_SPONSORABLE: ReadonlySet<number> = new Set([
  // mainnets
  1, 10, 56, 137, 143, 4217, 4663, 5042, 8453, 42161,
  // testnets
  97, 10143, 42431, 46630, 80002, 84532, 421614, 5042002, 11155111, 11155420,
]);

/** Tempo mainnet and Moderato: fees in a USD stablecoin, never sponsored here. */
export const TEMPO_FEE_CHAIN_IDS: ReadonlySet<number> = new Set([4217, 42431]);

/**
 * The chains whose sends Gloam lets Turnkey sponsor, from NEXT_PUBLIC_TURNKEY_SPONSOR_CHAINS:
 * a comma-separated list of chain ids, or "all" for every chain in TURNKEY_SPONSORABLE.
 * Unset, empty or "off" sponsors nothing. Ids Turnkey can't sponsor are dropped, and
 * so is Tempo, which pays its own fees in stablecoins.
 */
export function sponsorChainsFrom(raw: string | undefined | null): ReadonlySet<number> {
  const v = raw?.trim().toLowerCase() ?? "";
  if (!v || v === "off" || v === "none" || v === "false" || v === "0") return new Set();
  const wanted = v === "all" ? [...TURNKEY_SPONSORABLE] : v.split(/[\s,]+/).map((x) => (/^\d{1,10}$/.test(x) ? Number(x) : NaN));
  return new Set(wanted.filter((id) => TURNKEY_SPONSORABLE.has(id) && !TEMPO_FEE_CHAIN_IDS.has(id)));
}

export const SPONSOR_CHAINS: ReadonlySet<number> = sponsorChainsFrom(process.env.NEXT_PUBLIC_TURNKEY_SPONSOR_CHAINS);

/** OP Stack chains add a data fee for Ethereum on top of gas times price. */
const OP_STACK = new Set([10, 130, 480, 8453, 57073, 84532, 11155420]);
/** Room for that data fee: 0.00002 ETH, far above what one deposit has cost on Base. */
const L1_FEE_ROOM = 20_000_000_000_000n;

/**
 * What a send may cost in the chain's gas coin: the gas at the highest fee per gas
 * it can pay, a fifth more for a price that moves before it lands, and room for the
 * data fee on OP Stack chains.
 */
export function gasBudget(chainId: number, gas: bigint, maxFeePerGas: bigint): bigint {
  const base = (gas * maxFeePerGas * 12n) / 10n;
  return OP_STACK.has(chainId) ? base + L1_FEE_ROOM : base;
}

export type GasRoute =
  /** The wallet pays from its own balance (ETH, or a stablecoin on Tempo). */
  | { kind: "self" }
  /** Tempo: the fee comes out of a stablecoin; the fee token is set first when needed. */
  | { kind: "stablecoin" }
  /** Turnkey's gas station sends it and Gloam's account pays the fee. */
  | { kind: "sponsored" }
  /** Nothing can pay: "no-gas" for the fee, "no-funds" for the value itself. */
  | { kind: "none"; why: "no-gas" | "no-funds" };

export type GasRouteInput = {
  chainId: number;
  /** The wallet's balance of the chain's gas coin, or null when it couldn't be read. */
  balance: bigint | null;
  /** The value the transaction carries (native ETH sent with it). */
  value: bigint;
  /** gasBudget for this send, or null when it couldn't be estimated. */
  cost: bigint | null;
  sponsorChains: ReadonlySet<number>;
};

export function pickGasRoute(p: GasRouteInput): GasRoute {
  if (TEMPO_FEE_CHAIN_IDS.has(p.chainId)) return { kind: "stablecoin" };
  // Sponsorship pays the fee, never the value: that has to be in the wallet.
  if (p.balance !== null && p.balance < p.value) return { kind: "none", why: "no-funds" };
  if (p.balance !== null && p.cost !== null && p.balance - p.value >= p.cost) return { kind: "self" };
  if (p.sponsorChains.has(p.chainId)) return { kind: "sponsored" };
  // Couldn't tell: let the send try, and the chain answer.
  if (p.balance === null || p.cost === null) return { kind: "self" };
  return { kind: "none", why: "no-gas" };
}

/**
 * What the wallet says when nothing can pay. Short enough for the app's error
 * lines, which cut a message at 180 characters.
 */
export function noGasText(why: "no-gas" | "no-funds", chainName: string, coin: string): string {
  if (why === "no-funds") return `This wallet doesn't hold enough ${coin} on ${chainName} for this, so nothing was sent.`;
  return `No ${coin} in this wallet for the network fee on ${chainName}, so nothing was sent. Send it a little ${coin}, or add money with a claim link or the bridge.`;
}

/** Turnkey refused to sponsor it, before anything went out. */
export function sponsorRefusedText(coin: string): string {
  return `Network fees for this wallet aren't covered right now, so nothing was sent. Send it a little ${coin}, or add money with a claim link or the bridge.`;
}

/** Turnkey took it, and no transaction hash came back in time. It may still land. */
export const SPONSOR_SLOW_TEXT =
  "The network fee service took this, but no transaction showed up yet. Check your activity in a minute before trying again.";

type ErrorLike = { name?: string; message?: string; statusCode?: number; cause?: unknown };

/**
 * Turnkey answered a sponsored send with a refusal (a limit reached, sponsorship
 * off, a policy), so nothing was broadcast. Only then may the app treat the send
 * as never made. A lost connection or a timeout proves nothing: the send may have
 * gone out, and the app must keep what it saved ahead of it.
 */
export function turnkeyRefused(e: unknown): boolean {
  let x = e as ErrorLike | undefined;
  for (let i = 0; x && typeof x === "object" && i < 8; i++, x = x.cause as ErrorLike | undefined) {
    if (x.name === "TurnkeyRequestError") return true;
    if (x.name === "TurnkeyNetworkError" && typeof x.statusCode === "number" && x.statusCode >= 400 && x.statusCode < 500) return true;
    if (typeof x.message === "string" && /ACTIVITY_STATUS_(FAILED|REJECTED)/.test(x.message)) return true;
  }
  return false;
}

export type SponsorStatus = {
  txStatus?: string;
  eth?: { txHash?: string };
  error?: { message?: string };
  txError?: string;
};

/**
 * Waits for a sponsored send's hash. Turnkey's own poller waits for inclusion and
 * gives up after a minute; the app only needs the hash, then waits for the receipt
 * the way it does for any wallet. A failure here does not mean nothing went out, so
 * it throws a plain Error: the app keeps what it saved ahead of the send.
 */
export async function waitForSponsoredHash(
  getStatus: () => Promise<SponsorStatus>,
  { intervalMs = 700, timeoutMs = 120_000, sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms)), now = Date.now } = {},
): Promise<`0x${string}`> {
  const end = now() + timeoutMs;
  for (;;) {
    const s = await getStatus().catch(() => null);
    const hash = s?.eth?.txHash;
    if (hash && /^0x[0-9a-fA-F]{64}$/.test(hash)) return hash as `0x${string}`;
    if (s?.txStatus === "FAILED" || s?.txStatus === "CANCELLED") {
      throw new Error(s.error?.message || s.txError || "The sponsored transaction failed.");
    }
    if (now() >= end) throw new Error(SPONSOR_SLOW_TEXT);
    await sleep(intervalMs);
  }
}
