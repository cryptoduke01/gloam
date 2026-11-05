/**
 * Partner interface fees charged, as the relay saw them. Server only.
 *
 * A fee is one private payment (a vault transfer) from the user to the partner's
 * Gloam address, sent through the relay with { partnerFee: { kind, asset, amount } }
 * beside the proof (lib/partnerFeeMath). The relay sends it like any transfer and,
 * once it lands, counts it as charged for the partner:
 *   - from the Gloam app (POST /api/relay), for the link code it names;
 *   - from a partner's own app (POST /api/v1/relay), for the key's partner.
 * A private payment's amount is hidden on chain, so the amount is the one the
 * client reported with the send: it is kept and shown as "reported". What is
 * checked: the code or key is the partner's, the partner has a fee of that kind
 * and a Gloam address for fees on that network, the token is one Gloam knows
 * there, a flat fee is exactly the setting's, a share is never more than 1% of
 * the largest cash out or deposit the vault takes, the transaction landed as a
 * plain private payment in the vault, and it was not counted before.
 *
 * Kept, under gloam:partners:v1:
 *   feetx:<chainId>:<hash>   the partner a fee transfer counted for (once)
 *   feesum:<id>              hash: f|<chainId>|<asset>|<kind>|amt (micro-units), |n (count), |usd (USD micros)
 *   feelog:<id>              newest-first list of fee records (capped), for admin
 * Never the user's note, wallet or IP, and never the payment the fee went with.
 */
import { getAddress, isAddress, type Address, type Hex } from "viem";
import { assetInfo, priceMicrosFor, toMicroUnits, tierOf, type Partner, type Tier } from "./partners";
import { hashNumbers, jsonOf, k, kv, kv1, type KvCommand } from "./partnersKv";
import { feeAddressFor, feeDue, FEE_KINDS, type FeeKind } from "./partnerFeeMath";
import { getNetwork, NETWORK_KEYS, type GloamNetwork } from "./networks";
import { classifyVaultTx, type ReceiptLog } from "./partnerVerify";
import { EVERY_SWAP_ROUTER, swapRoutersOn } from "./vaultSwap";
import { randomId } from "./apiKeys";
import { logSafe } from "./logSafe";

const FEELOG_MAX = 200;
const FEE_TX_TTL_SEC = 400 * 86_400;

export class FeeReportError extends Error {
  constructor(
    message: string,
    public code: string
  ) {
    super(message);
  }
}

export type FeeRecord = {
  id: string;
  network: string;
  chainId: number;
  kind: FeeKind;
  asset: Address;
  symbol: string;
  decimals: number;
  /** Base units, as the client reported it. */
  amount: string;
  /** null on testnet and for unpriced tokens. */
  usd: number | null;
  txHash: Hex;
  source: "link" | "api";
  /** ms: when it landed (the relay's receipt wait), or when it was counted. */
  ts: number;
  reported: true;
};

/** The fee as the relay takes it, checked to the letter; null when there is none. Throws on a malformed one. */
export function readPartnerFee(raw: unknown): { kind: FeeKind; asset: Address; amount: bigint } | null {
  if (raw === undefined || raw === null) return null;
  if (typeof raw !== "object") throw new FeeReportError("partnerFee must be { kind, asset, amount }.", "bad_partner_fee");
  const f = raw as Record<string, unknown>;
  if (Object.keys(f).some((key) => !["kind", "asset", "amount", "code"].includes(key))) {
    throw new FeeReportError("partnerFee takes only kind, asset and amount.", "bad_partner_fee");
  }
  if (typeof f.kind !== "string" || !(FEE_KINDS as string[]).includes(f.kind)) {
    throw new FeeReportError('partnerFee.kind must be "private_payment", "cash_out" or "deposit".', "bad_partner_fee");
  }
  if (typeof f.asset !== "string" || !isAddress(f.asset, { strict: false })) throw new FeeReportError("partnerFee.asset must be a token address.", "bad_partner_fee");
  if (typeof f.amount !== "string" || !/^[1-9]\d{0,77}$/.test(f.amount)) throw new FeeReportError("partnerFee.amount must be base units, more than 0.", "bad_partner_fee");
  return { kind: f.kind as FeeKind, asset: getAddress(f.asset), amount: BigInt(f.amount) };
}

/** The most a share fee can be: 1% (the setting's cap) of 10 million whole tokens. */
const SHARE_CEILING_TOKENS = 100_000n;

/**
 * Why this partner can't be charged this fee on this network, or null. Pure.
 * The fee must be one the partner set: a fee of that kind, a Gloam address for
 * fees there, a token Gloam knows, and for a flat fee exactly the setting's.
 */
export function feeProblem(partner: Pick<Partner, "fees" | "feeTo">, net: GloamNetwork, fee: { kind: FeeKind; asset: Address; amount: bigint }): string | null {
  if (!feeAddressFor(partner.feeTo, net)) return "This partner has no Gloam address for fees on this network.";
  // the fee note reaches the partner only through its sealed heads-up on the memo board
  if (!net.payMemo) return "This network has no payment memo board, so a fee there could not reach the partner.";
  const info = assetInfo(net, fee.asset);
  if (!info) return "Gloam does not know that token on this network.";
  if (fee.kind === "private_payment") {
    const due = feeDue("private_payment", partner.fees, info, 0n);
    if (due <= 0n) return "This partner has no fee on private payments in this token.";
    if (fee.amount !== due) return "That is not this partner's fee per private payment.";
    return null;
  }
  const bps = fee.kind === "cash_out" ? partner.fees.cashoutBps : partner.fees.depositBps;
  if (bps <= 0) return `This partner has no fee on ${fee.kind === "cash_out" ? "cash outs" : "deposits"}.`;
  if (fee.amount > SHARE_CEILING_TOKENS * 10n ** BigInt(info.decimals)) return "That fee is larger than any cash out or deposit could carry.";
  return null;
}

/**
 * Counts one fee transfer as charged, once it has landed as a plain private
 * payment in the vault. Returns the record, or null when it was counted already.
 */
export async function recordFeeCharged(args: {
  partner: Pick<Partner, "id" | "fees" | "feeTo">;
  net: GloamNetwork;
  txHash: Hex;
  fee: { kind: FeeKind; asset: Address; amount: bigint };
  source: "link" | "api";
  ts?: number;
}): Promise<FeeRecord | null> {
  const { partner, net, fee } = args;
  const problem = feeProblem(partner, net, fee);
  if (problem) throw new FeeReportError(problem, "fee_not_set");
  const txHash = args.txHash.toLowerCase() as Hex;
  const [claim] = await kv([["SET", k("feetx", net.chainId, txHash), partner.id, "NX", "EX", FEE_TX_TTL_SEC]]);
  if (claim !== "OK") return null;
  const info = assetInfo(net, fee.asset)!;
  const price = net.testnet ? null : await priceMicrosFor(info).catch(() => null);
  const usdMicros = price == null ? null : (fee.amount * price) / 10n ** BigInt(info.decimals);
  const record: FeeRecord = {
    id: randomId("fee"),
    network: net.key,
    chainId: net.chainId,
    kind: fee.kind,
    asset: fee.asset,
    symbol: info.symbol,
    decimals: info.decimals,
    amount: fee.amount.toString(),
    usd: usdMicros == null ? null : Number(usdMicros) / 1e6,
    txHash,
    source: args.source,
    ts: args.ts ?? Date.now(),
    reported: true,
  };
  const tag = `f|${net.chainId}|${fee.asset.toLowerCase()}|${fee.kind}|`;
  const cmds: KvCommand[] = [
    ["HINCRBY", k("feesum", partner.id), `${tag}amt`, toMicroUnits(fee.amount, info.decimals).toString()],
    ["HINCRBY", k("feesum", partner.id), `${tag}n`, 1],
    ["LPUSH", k("feelog", partner.id), JSON.stringify(record)],
    ["LTRIM", k("feelog", partner.id), 0, FEELOG_MAX - 1],
  ];
  if (usdMicros != null) cmds.push(["HINCRBY", k("feesum", partner.id), `${tag}usd`, usdMicros.toString()]);
  await kv(cmds);
  return record;
}

export type FeeTotalsRow = {
  network: string;
  chainId: number;
  asset: Address;
  symbol: string;
  kind: FeeKind;
  /** Whole tokens (six places at most), as reported. */
  amount: string;
  count: number;
  /** null when unpriced (testnet, stock tokens). */
  usd: number | null;
};

export type FeesCharged = {
  tier: Tier;
  /** Every amount here is as the client reported it with the fee's own transfer. */
  reported: true;
  count: number;
  usd: number;
  byToken: FeeTotalsRow[];
};

function microString(v: number): string {
  const s = Math.abs(Math.trunc(v)).toString().padStart(7, "0");
  return `${v < 0 ? "-" : ""}${`${s.slice(0, -6)}.${s.slice(-6)}`.replace(/\.?0+$/, "") || "0"}`;
}

/** One partner's fees charged on a tier, from its sums. Pure. */
export function summarizeFees(sums: Record<string, number>, tier: Tier): FeesCharged {
  const rows = new Map<string, FeeTotalsRow>();
  let count = 0;
  let usd = 0;
  for (const [field, v] of Object.entries(sums)) {
    const m = /^f\|(\d+)\|(0x[0-9a-f]{40})\|([a-z_]+)\|(amt|n|usd)$/.exec(field);
    if (!m) continue;
    const net = NETWORK_KEYS.map(getNetwork).find((n) => String(n.chainId) === m[1]);
    if (!net || tierOf(net.key) !== tier || !(FEE_KINDS as string[]).includes(m[3]!)) continue;
    const key = `${m[1]}|${m[2]}|${m[3]}`;
    const row =
      rows.get(key) ??
      ({ network: net.key, chainId: net.chainId, asset: getAddress(m[2]!), symbol: assetInfo(net, m[2] as Address)?.symbol ?? "token", kind: m[3] as FeeKind, amount: "0", count: 0, usd: null } as FeeTotalsRow & { raw?: number });
    if (m[4] === "amt") row.amount = microString(v);
    else if (m[4] === "n") {
      row.count = v;
      count += v;
    } else {
      row.usd = v / 1e6;
      usd += v / 1e6;
    }
    rows.set(key, row);
  }
  const byToken = [...rows.values()].sort((a, b) => (b.usd ?? 0) - (a.usd ?? 0) || b.count - a.count);
  return { tier, reported: true, count, usd: tier === "testnet" ? 0 : usd, byToken: tier === "testnet" ? byToken.map((r) => ({ ...r, usd: null })) : byToken };
}

export async function readFeesCharged(partnerId: string, tier: Tier = "mainnet"): Promise<FeesCharged> {
  return summarizeFees(hashNumbers(await kv1(["HGETALL", k("feesum", partnerId)])), tier);
}

/** Every partner's fees charged on a tier, in one round trip. */
export async function readAllFeesCharged(ids: string[], tier: Tier = "mainnet"): Promise<Record<string, FeesCharged>> {
  const res = ids.length ? await kv(ids.map((id) => ["HGETALL", k("feesum", id)] as KvCommand)) : [];
  return Object.fromEntries(ids.map((id, i) => [id, summarizeFees(hashNumbers(res[i]), tier)]));
}

export async function readFeeLog(partnerId: string, tier: Tier = "mainnet", n = 50): Promise<FeeRecord[]> {
  const raw = await kv1(["LRANGE", k("feelog", partnerId), 0, FEELOG_MAX - 1]);
  return (Array.isArray(raw) ? raw : [])
    .map((r) => jsonOf<FeeRecord>(r))
    .filter((r): r is FeeRecord => Boolean(r) && tierOf(r!.network as never) === tier)
    .slice(0, n);
}

// ---------------------------------------------------------------- after the relay sent it

export type FeeSettleDeps = {
  /** Waits for the receipt; null when it did not land in time. */
  receipt: (net: GloamNetwork, hash: Hex) => Promise<{ status: "success" | "reverted"; logs: readonly ReceiptLog[] } | null>;
  now: () => number;
};

const FEE_WAIT_MS = 60_000;

export const feeSettleDeps: FeeSettleDeps = {
  receipt: async (net, hash) => {
    const { relayPublicClient } = await import("./relay/server");
    const r = await relayPublicClient(net)
      .waitForTransactionReceipt({ hash, timeout: FEE_WAIT_MS, pollingInterval: 1_500 })
      .catch(() => null);
    return r ? { status: r.status, logs: r.logs } : null;
  },
  now: () => Date.now(),
};

/**
 * After the relay sent a fee transfer: waits for it to land, checks it is a plain
 * private payment in the vault, and counts it as charged. Never throws.
 */
export async function settleFeeAfterSend(
  args: { partner: Pick<Partner, "id" | "fees" | "feeTo">; net: GloamNetwork; hash: Hex; fee: { kind: FeeKind; asset: Address; amount: bigint }; source: "link" | "api" },
  deps: FeeSettleDeps = feeSettleDeps
): Promise<FeeRecord | null> {
  try {
    const r = await deps.receipt(args.net, args.hash);
    if (!r || r.status !== "success") return null;
    const facts = classifyVaultTx(r.logs, { pool: args.net.pool!, routers: swapRoutersOn(args.net.chainId).map((x) => x.address), anyRouter: EVERY_SWAP_ROUTER });
    if (!facts.ok || facts.kind !== "private_payment") return null;
    return await recordFeeCharged({ ...args, txHash: args.hash, ts: deps.now() });
  } catch (e) {
    console.error("gloam_partner_fee_settle", logSafe(e));
    return null;
  }
}
