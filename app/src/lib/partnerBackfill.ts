/**
 * The on-chain match: past cash outs that paid one of a partner's own receiving
 * addresses (lib/partnerAddresses), counted to that partner with source "chain".
 * Admin-started, server side, read-only. Server only.
 *
 * On every mainnet with a vault it reads the vault's Unshielded logs from the
 * vault's deploy block (lib/networks, the same blocks as contracts/deployments)
 * up to the chain's head, one address and one topic per query (Robinhood Chain's
 * RPC allows no more over a wide range), in spans each chain's RPC accepts; a
 * span the node calls too wide is halved (lib/logRange). Where a log's `to` is a
 * partner's address, the transaction's receipt is read and checked like a link
 * attribution's (lib/partnerVerify: one cash out, no swap in it), and counted with
 * what the chain shows: the hash, chain, asset, amount, the vault's fee from its
 * WithdrawFee log and the block's time. A transaction counts once (the claim in
 * lib/partners recordActivity, shared with live attribution and claimTransaction),
 * so running it again, or after a link already counted the same transaction,
 * changes nothing.
 *
 * What it can't find, said plainly in the dashboards:
 *  - private payments: inside the vault the payee and the amount are hidden, so
 *    there is nothing to match a partner's address against;
 *  - private swaps: a swap's note goes out to a one-time escrow and its output comes
 *    back into the vault as a new note, so no swap on the live routers pays a public
 *    address. Only the next router's exit (VaultSwapExit) could, and it is not
 *    deployed: nothing to read yet.
 *
 * Nothing about who sent the money is read into storage: not the transaction's
 * sender, not the relay, not the paying wallet.
 *
 * A pass stops starting new spans when its time budget runs out; each chain's
 * cursor (backfill:cursor:<chainId>) keeps where it got to, and the next pass
 * picks up there. A dry run reads the same and writes nothing.
 */
import type { Address, Hex } from "viem";
import { getLogsSafe } from "./logRange";
import { k, kv1 } from "./partnersKv";
import { assetInfo, attributedTo, getPartner, recordActivity, type Partner } from "./partners";
import { addressChains } from "./partnerAddresses";
import { classifyVaultTx, VAULT_EVENTS } from "./partnerVerify";
import { relayPublicClient } from "./relay/server";
import { EVERY_SWAP_ROUTER, swapRoutersOn } from "./vaultSwap";
import type { AttributionReceipt } from "./partnerAttribution";
import type { GloamNetwork, NetworkKey } from "./networks";

/** First span per query; a range error halves it. Robinhood Chain takes wide spans for one address and one topic. */
export const BACKFILL_SPAN: Record<number, bigint> = { 4663: 5_000_000n };

export function spanFor(net: GloamNetwork): bigint {
  return BACKFILL_SPAN[net.chainId] ?? net.logRange;
}

export type UnshieldLog = { txHash: Hex; blockNumber: bigint; nullifier: Hex; asset: Address; to: Address; amount: bigint };

export type BackfillDeps = {
  head: (net: GloamNetwork) => Promise<bigint>;
  /** The vault's Unshielded logs in [from, to]: one address, one topic. */
  unshielded: (net: GloamNetwork, from: bigint, to: bigint) => Promise<UnshieldLog[]>;
  receipt: (net: GloamNetwork, hash: Hex) => Promise<AttributionReceipt | null>;
  blockTime: (net: GloamNetwork, block: bigint) => Promise<number>;
  partner: (id: string) => Promise<Partner | null>;
  record: typeof recordActivity;
  attributed: typeof attributedTo;
  readCursor: (chainId: number) => Promise<bigint | null>;
  writeCursor: (chainId: number, block: bigint) => Promise<void>;
  now: () => number;
};

const UNSHIELDED = VAULT_EVENTS[2];

export const backfillDeps: BackfillDeps = {
  head: (net) => relayPublicClient(net).getBlockNumber({ cacheTime: 0 }),
  unshielded: async (net, from, to) => {
    const c = relayPublicClient(net);
    const read = (x: bigint, y: bigint) => getLogsSafe((a, b) => c.getLogs({ address: net.pool!, event: UNSHIELDED, fromBlock: a, toBlock: b }), x, y);
    let logs: Awaited<ReturnType<typeof read>>;
    try {
      logs = await read(from, to);
    } catch (e) {
      // Some nodes refuse a span with a generic error ("Invalid parameters") rather than a range error: halve it once.
      if (to - from < 1_000n) throw e;
      const mid = from + (to - from) / 2n;
      logs = [...(await read(from, mid)), ...(await read(mid + 1n, to))];
    }
    return logs.map((l) => ({
      txHash: l.transactionHash!,
      blockNumber: l.blockNumber!,
      nullifier: l.args.nullifier!,
      asset: l.args.asset!,
      to: l.args.to!,
      amount: l.args.amount!,
    }));
  },
  receipt: async (net, hash) => {
    const r = await relayPublicClient(net)
      .getTransactionReceipt({ hash })
      .catch(() => null);
    return r ? { status: r.status, blockNumber: r.blockNumber, logs: r.logs } : null;
  },
  blockTime: async (net, block) => Number((await relayPublicClient(net).getBlock({ blockNumber: block })).timestamp),
  partner: getPartner,
  record: recordActivity,
  attributed: attributedTo,
  readCursor: async (chainId) => {
    const v = await kv1(["GET", k("backfill", "cursor", chainId)]);
    return typeof v === "string" && /^\d+$/.test(v) ? BigInt(v) : null;
  },
  writeCursor: async (chainId, block) => {
    await kv1(["SET", k("backfill", "cursor", chainId), block.toString()]);
  },
  now: () => Date.now(),
};

export type BackfillMatch = {
  partnerId: string;
  network: NetworkKey;
  chainId: number;
  txHash: Hex;
  kind: "cash_out";
  asset: Address;
  symbol: string | null;
  /** Smallest units. */
  amount: string;
  /** The vault's fee, smallest units. */
  vaultFee: string;
  /** Block time, ms. */
  ts: number;
  result: "recorded" | "already_counted" | "would_record" | "refused";
  /** Why a matched log was not counted. */
  reason?: string;
};

export type ChainScan = {
  network: NetworkKey;
  chainId: number;
  from: string;
  to: string;
  /** The last block read; `to` when `done`. */
  scannedTo: string;
  done: boolean;
  queries: number;
  logs: number;
  matches: number;
  ms: number;
  error?: string;
};

export type BackfillResult = {
  dryRun: boolean;
  from: "deploy" | "cursor";
  ms: number;
  addresses: number;
  chains: ChainScan[];
  matches: BackfillMatch[];
  /** Why swaps are not matched, in a sentence. */
  swaps: string;
  /** Why private payments are not matched, in a sentence. */
  privatePayments: string;
};

export const SWAPS_NOT_MATCHED =
  "Swaps are not matched: a swap's note goes to a one-time escrow and its output comes back into the vault as a private note, so no swap on the live routers pays a public address.";
export const PRIVATE_PAYMENTS_NOT_MATCHED =
  "Past private payments can't be matched: inside the vault the payee and the amount are hidden. Only cash outs that paid a partner's public address can be.";

/**
 * One pass over every mainnet (or `chains`). `book`: chainId to (lowercase
 * address to partner id). Stops starting new spans after `budgetMs`.
 */
export async function runBackfill(
  opts: { dryRun: boolean; from: "deploy" | "cursor"; book: Map<number, Map<string, string>>; budgetMs: number; chains?: number[] },
  deps: BackfillDeps = backfillDeps
): Promise<BackfillResult> {
  const started = deps.now();
  const deadline = started + opts.budgetMs;
  const nets = addressChains().filter((n) => !opts.chains || opts.chains.includes(n.chainId));
  const matches: BackfillMatch[] = [];
  const addresses = [...opts.book.values()].reduce((s, m) => s + m.size, 0);

  const chains = await Promise.all(
    nets.map(async (net): Promise<ChainScan> => {
      const t0 = deps.now();
      const scan: ChainScan = { network: net.key, chainId: net.chainId, from: "", to: "", scannedTo: "", done: false, queries: 0, logs: 0, matches: 0, ms: 0 };
      try {
        const deploy = net.deployBlock!;
        const cursor = opts.from === "cursor" ? await deps.readCursor(net.chainId) : null;
        const from = cursor != null && cursor >= deploy ? cursor + 1n : deploy;
        const head = await deps.head(net);
        scan.from = from.toString();
        scan.to = head.toString();
        scan.scannedTo = (from - 1n).toString();
        const mine = opts.book.get(net.chainId) ?? new Map<string, string>();
        const span = spanFor(net);
        for (let a = from; a <= head; a += span) {
          if (deps.now() > deadline) break;
          const b = a + span - 1n > head ? head : a + span - 1n;
          const logs = await deps.unshielded(net, a, b);
          scan.queries++;
          scan.logs += logs.length;
          for (const log of logs) {
            const partnerId = mine.get(log.to.toLowerCase());
            if (!partnerId) continue;
            scan.matches++;
            matches.push(await matchOne(net, log, partnerId, opts.dryRun, deps));
          }
          scan.scannedTo = b.toString();
          if (!opts.dryRun) await deps.writeCursor(net.chainId, b);
        }
        scan.done = BigInt(scan.scannedTo) >= head;
      } catch (e) {
        scan.error = e instanceof Error ? e.message.split("\n")[0]!.slice(0, 200) : "read failed";
      }
      scan.ms = deps.now() - t0;
      return scan;
    })
  );
  matches.sort((x, y) => y.ts - x.ts);
  return {
    dryRun: opts.dryRun,
    from: opts.from,
    ms: deps.now() - started,
    addresses,
    chains,
    matches,
    swaps: SWAPS_NOT_MATCHED,
    privatePayments: PRIVATE_PAYMENTS_NOT_MATCHED,
  };
}

async function matchOne(net: GloamNetwork, log: UnshieldLog, partnerId: string, dryRun: boolean, deps: BackfillDeps): Promise<BackfillMatch> {
  const base: BackfillMatch = {
    partnerId,
    network: net.key,
    chainId: net.chainId,
    txHash: log.txHash.toLowerCase() as Hex,
    kind: "cash_out",
    asset: log.asset,
    symbol: assetInfo(net, log.asset)?.symbol ?? null,
    amount: log.amount.toString(),
    vaultFee: "0",
    ts: 0,
    result: "refused",
  };
  if (await deps.attributed(net.chainId, base.txHash)) return { ...base, result: "already_counted" };
  const receipt = await deps.receipt(net, base.txHash);
  if (!receipt || receipt.status !== "success") return { ...base, reason: "No successful receipt." };
  const facts = classifyVaultTx(receipt.logs, {
    pool: net.pool!,
    routers: swapRoutersOn(net.chainId).map((r) => r.address),
    anyRouter: EVERY_SWAP_ROUTER,
  });
  // the receipt must be the one cash out the log came from, nothing packed beside it
  if (!facts.ok || facts.kind !== "cash_out" || facts.asset.toLowerCase() !== log.asset.toLowerCase() || facts.amount !== log.amount) {
    return { ...base, reason: "Not a plain cash out." };
  }
  const ts = (await deps.blockTime(net, receipt.blockNumber)) * 1000;
  const found = { ...base, vaultFee: facts.vaultFee.toString(), ts };
  if (dryRun) return { ...found, result: "would_record" };
  const partner = await deps.partner(partnerId);
  if (!partner) return { ...found, reason: "The partner account is gone." };
  const r = await deps.record({
    partner,
    keyId: null,
    source: "chain",
    network: net,
    kind: "cash_out",
    txHash: base.txHash,
    edge: { asset: log.asset, amount: log.amount },
    vaultFee: facts.vaultFee,
    now: ts,
  });
  return { ...found, result: r.recorded ? "recorded" : "already_counted" };
}
