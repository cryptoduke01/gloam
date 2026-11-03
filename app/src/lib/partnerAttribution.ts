/**
 * Link attribution: a payment, cash out or swap opened from a partner's link,
 * counted to that partner. Server only.
 *
 * Two bindings, both made before the transaction exists, so nobody can claim
 * someone else's transaction afterwards:
 *
 *  - Relay-bound (fee-split grade). The app hands the link's code to the relay
 *    with the proof (payments and cash outs by default, swaps always). The relay
 *    binds the code to the transaction hash it sent itself (bindRelayTx) and counts
 *    the transaction once it lands. A cash out sent later is bound when the
 *    scheduled run sends it (bindScheduledJob, then the run). A relay binding is
 *    authoritative: nothing else is read for that transaction. A copied proof the
 *    relay sends binds only the relay's own transaction, which reverts.
 *
 *  - Wallet-registered (attribution grade). Before the payer's wallet is asked,
 *    the app registers the spend: a hash of its nullifier, the link's code, and a
 *    hash of a value only the spender has when it sends (POST /api/partners/register):
 *    the payment's new note commitment, or the cash out's proof. The transaction
 *    counts only when that value is the one in it, and the registration came no
 *    later than its block's second. Knowing a nullifier ahead of time (a payer
 *    knows the nullifier of every note it pays out) is not enough. If two codes
 *    register the same spend with the right value, it counts for nobody.
 *    Registrations last an hour. Not taken on chains with a public mempool
 *    (Ethereum), where a pending transaction's calldata could be copied.
 *
 * Counting (settleLinkTx: POST /api/partners/attribute, the relay, the scheduled run,
 * the on-chain match) reads the receipt on its chain through the relay's read-only
 * client and counts a real vault action that fits the flow. Who asks changes
 * nothing. A cash out that pays a partner's own proven address (lib/partnerAddresses)
 * is that partner's, matched on chain, whatever link it came from.
 *
 * Kept: what the chain shows and nothing more (lib/partners ActivityRecord). Never
 * the payer's wallet, the address a cash out paid, a note, the caller's IP or
 * anything else. No partner and no third party is called. Nothing here ever holds
 * up a send: failures are logged and dropped.
 */
import { decodeFunctionData, isAddress, type Hex } from "viem";
import { ApiError } from "./partnersApi";
import { attributedTo, claimTransaction, getPartner, recordActivity, type ActivityRecord } from "./partners";
import { resolveLinkCode } from "./partnerLinks";
import { isBytes32, isLinkCodeShape, linkBindHash, linkNullifierHash, proofBindValue, PUBLIC_MEMPOOL_CHAINS } from "./partnerCode";
import { classifyVaultTx, kindFitsFlow, LINK_FLOWS, type LinkFlow, type ReceiptLog, type VaultTxFacts } from "./partnerVerify";
import { jsonOf, k, kv, kv1 } from "./partnersKv";
import { addressOwner } from "./partnerAddresses";
import { networkForChain, relayPoolAbi, relayPublicClient } from "./relay/server";
import { EVERY_SWAP_ROUTER, swapRoutersOn } from "./vaultSwap";
import { logSafe } from "./logSafe";
import type { GloamNetwork } from "./networks";

/** A wallet registration is kept this long: it only has to outlast the wallet's prompt and the block. */
export const REGISTRATION_TTL_SEC = 3600;
/** A relay binding is kept this long, so a later count (the app, the on-chain match) still finds it. */
export const RELAY_BINDING_TTL_SEC = 7 * 86_400;
/** A cash out scheduled for later keeps its code this long: a dated one goes out up to 90 days ahead. */
export const JOB_CODE_TTL_SEC = 100 * 86_400;
/** A transaction can be counted to a link this long after it lands. */
export const ATTRIBUTION_WINDOW_SEC = 7 * 86_400;

/** The claim a transaction gets when two codes registered it: it counts for nobody. */
const NOBODY = { id: "conflict" };

export type Registration = {
  partnerId: string;
  code: string;
  flow: LinkFlow;
  /** ms: when the server took it. */
  at: number;
  /** linkBindHash of the value only the spender had when it sent. */
  bind: Hex;
};

export type RelayBinding = { partnerId: string; code: string; flow: LinkFlow; at: number };

/**
 * Registers a wallet send under a live code, before the wallet is asked. One code
 * per spend at a time (the same code again keeps its first registration); a second
 * code is kept too, and makes the spend count for nobody if both match it.
 */
export async function registerLink(args: {
  chainId: number;
  nullifierHash: Hex;
  bindHash: Hex;
  code: string;
  flow: LinkFlow;
  at?: number;
}): Promise<{ registered: boolean; reason?: "code_not_live" | "public_mempool" | "relay_only" }> {
  const at = args.at ?? Date.now();
  if (PUBLIC_MEMPOOL_CHAINS.includes(args.chainId)) return { registered: false, reason: "public_mempool" };
  // a swap only ever goes through the relay, which binds it itself
  if (args.flow !== "pay") return { registered: false, reason: "relay_only" };
  const resolved = await resolveLinkCode(args.code, at);
  if (!resolved) return { registered: false, reason: "code_not_live" };
  const key = k("reg", args.chainId, args.nullifierHash.toLowerCase());
  const reg: Registration = { partnerId: resolved.partner.id, code: resolved.code.code, flow: args.flow, at, bind: args.bindHash.toLowerCase() as Hex };
  await kv([
    ["HSETNX", key, `${reg.code}|${reg.bind}`, JSON.stringify(reg)],
    ["EXPIRE", key, REGISTRATION_TTL_SEC],
  ]);
  return { registered: true };
}

export async function registrationsOf(chainId: number, nullifier: Hex): Promise<Registration[]> {
  const raw = await kv1(["HGETALL", k("reg", chainId, linkNullifierHash(nullifier).toLowerCase())]);
  const out: Registration[] = [];
  if (Array.isArray(raw)) for (let i = 1; i < raw.length; i += 2) {
    const r = jsonOf<Registration>(raw[i]);
    if (r) out.push(r);
  }
  return out;
}

/** The relay binds a link's code to the transaction it sent. Authoritative for that transaction. */
export async function bindRelayTx(args: { chainId: number; txHash: Hex; code: string; flow: LinkFlow; at: number }): Promise<boolean> {
  const resolved = await resolveLinkCode(args.code, args.at);
  if (!resolved) return false;
  const b: RelayBinding = { partnerId: resolved.partner.id, code: resolved.code.code, flow: args.flow, at: args.at };
  await kv1(["SET", k("relaytx", args.chainId, args.txHash.toLowerCase()), JSON.stringify(b), "EX", RELAY_BINDING_TTL_SEC]);
  return true;
}

export async function relayBindingOf(chainId: number, txHash: string): Promise<RelayBinding | null> {
  return jsonOf<RelayBinding>(await kv1(["GET", k("relaytx", chainId, txHash.toLowerCase())]));
}

export type AttributionReceipt = {
  status: "success" | "reverted";
  blockNumber: bigint;
  logs: readonly ReceiptLog[];
};

export type AttributionDeps = {
  /** The receipt on that chain, or null when it is not there (yet). */
  receipt: (net: GloamNetwork, hash: Hex) => Promise<AttributionReceipt | null>;
  /** The block's time, seconds. */
  blockTime: (net: GloamNetwork, block: bigint) => Promise<number>;
  /** The transaction's target and calldata, for a wallet cash out's proof; null when not read. */
  tx: (net: GloamNetwork, hash: Hex) => Promise<{ to: string | null; input: Hex } | null>;
  record: typeof recordActivity;
  now: () => number;
};

export const attributionDeps: AttributionDeps = {
  receipt: async (net, hash) => {
    const r = await relayPublicClient(net)
      .getTransactionReceipt({ hash })
      .catch(() => null);
    return r ? { status: r.status, blockNumber: r.blockNumber, logs: r.logs } : null;
  },
  blockTime: async (net, block) => Number((await relayPublicClient(net).getBlock({ blockNumber: block })).timestamp),
  tx: async (net, hash) => {
    const t = await relayPublicClient(net)
      .getTransaction({ hash })
      .catch(() => null);
    return t ? { to: t.to ?? null, input: t.input } : null;
  },
  record: recordActivity,
  now: () => Date.now(),
};

export type SettleInput = { chainId: number; txHash: Hex };

/** The settle request's body, checked to the letter, or a 400. Extra fields are refused, not ignored. */
export function readSettleInput(body: Record<string, unknown>): SettleInput {
  if (Object.keys(body).some((key) => key !== "chainId" && key !== "txHash")) {
    throw new ApiError(400, "bad_request", "Send only { chainId, txHash }.");
  }
  if (typeof body.chainId !== "number" || !Number.isSafeInteger(body.chainId) || body.chainId <= 0) {
    throw new ApiError(400, "bad_chain", "chainId must be a chain id number.");
  }
  if (!isBytes32(body.txHash)) throw new ApiError(400, "bad_tx", "txHash must be a 32-byte transaction hash.");
  return { chainId: body.chainId, txHash: body.txHash.toLowerCase() as Hex };
}

export type RegisterInput = { chainId: number; nullifierHash: Hex; bindHash: Hex; code: string; flow: LinkFlow };

/** The registration request's body, to the letter, or a 400. */
export function readRegisterInput(body: Record<string, unknown>): RegisterInput {
  if (Object.keys(body).some((key) => !["chainId", "nullifierHash", "bindHash", "code", "flow"].includes(key))) {
    throw new ApiError(400, "bad_request", "Send only { chainId, nullifierHash, bindHash, code, flow }.");
  }
  if (typeof body.chainId !== "number" || !Number.isSafeInteger(body.chainId) || body.chainId <= 0) {
    throw new ApiError(400, "bad_chain", "chainId must be a chain id number.");
  }
  if (!isBytes32(body.nullifierHash)) throw new ApiError(400, "bad_hash", "nullifierHash must be 32 bytes.");
  if (!isBytes32(body.bindHash)) throw new ApiError(400, "bad_hash", "bindHash must be 32 bytes.");
  if (!isLinkCodeShape(body.code)) throw new ApiError(400, "bad_code", "That is not a partner link code.");
  if (typeof body.flow !== "string" || !LINK_FLOWS.includes(body.flow as LinkFlow)) {
    throw new ApiError(400, "bad_flow", 'flow must be "pay" or "swap".');
  }
  return {
    chainId: body.chainId,
    nullifierHash: body.nullifierHash.toLowerCase() as Hex,
    bindHash: body.bindHash.toLowerCase() as Hex,
    code: body.code,
    flow: body.flow as LinkFlow,
  };
}

function netFor(chainId: number): GloamNetwork {
  try {
    return networkForChain(chainId);
  } catch {
    throw new ApiError(400, "bad_chain", "Gloam does not run a vault on that chain.");
  }
}

export function classify(net: GloamNetwork, logs: readonly ReceiptLog[]): VaultTxFacts {
  return classifyVaultTx(logs, { pool: net.pool!, routers: swapRoutersOn(net.chainId).map((r) => r.address), anyRouter: EVERY_SWAP_ROUTER });
}

/**
 * The value a wallet send's registration has to name, read from the transaction:
 * a private payment's new note commitment (from its log), a cash out's proof (from
 * the call, made straight to the vault). null when it can't be read: then a wallet
 * registration can't match.
 */
async function bindOf(net: GloamNetwork, hash: Hex, facts: Extract<VaultTxFacts, { ok: true }>, deps: AttributionDeps): Promise<Hex | null> {
  if (facts.kind === "private_payment") return linkBindHash(facts.paymentCommitment);
  if (facts.kind !== "cash_out") return null;
  const t = await deps.tx(net, hash);
  if (!t || !t.to || t.to.toLowerCase() !== net.pool!.toLowerCase()) return null;
  try {
    const call = decodeFunctionData({ abi: relayPoolAbi, data: t.input });
    // the call must be this very spend: its nullifier is the one the vault logged
    if (call.functionName !== "unshield" || String(call.args[2]).toLowerCase() !== facts.nullifier.toLowerCase()) return null;
    return linkBindHash(proofBindValue(call.args[0] as Hex));
  } catch {
    return null;
  }
}

/**
 * Counts one landed transaction to the link it was bound to, or throws an ApiError
 * saying why not. A cash out to a partner's own proven address goes to that
 * partner instead, as matched on chain.
 */
export async function settleLinkTx(
  input: SettleInput,
  deps: AttributionDeps = attributionDeps
): Promise<{ kind: ActivityRecord["kind"]; record: ActivityRecord }> {
  const net = netFor(input.chainId);
  // counted already (to anyone, or to nobody): no chain read
  if (await attributedTo(net.chainId, input.txHash)) throw new ApiError(409, "already_attributed", "That transaction is already counted.");

  const receipt = await deps.receipt(net, input.txHash);
  if (!receipt) throw new ApiError(404, "tx_not_found", `No confirmed transaction with that hash on ${net.label} yet.`);
  if (receipt.status !== "success") throw new ApiError(422, "tx_failed", "That transaction failed on chain.");
  const facts = classify(net, receipt.logs);
  if (!facts.ok) throw new ApiError(422, "not_vault_action", "That transaction is not a payment, cash out or swap in Gloam's vault.");
  const ts = await deps.blockTime(net, receipt.blockNumber);
  if (!Number.isFinite(ts) || ts <= 0) throw new ApiError(502, "rpc", "Could not read the block. Try again.");
  if (Math.floor(deps.now() / 1000) - ts > ATTRIBUTION_WINDOW_SEC) {
    throw new ApiError(422, "too_old", "Link payments can be counted for seven days after they land.");
  }

  // 1. The relay's own binding of this very transaction: authoritative.
  let bound: { partnerId: string; code: string; flow: LinkFlow; by: "relay" | "wallet" } | null = null;
  const relay = await relayBindingOf(net.chainId, input.txHash);
  if (relay) bound = { ...relay, by: "relay" };
  else if (!PUBLIC_MEMPOOL_CHAINS.includes(net.chainId)) {
    // 2. Wallet registrations of this spend that name the value only its spender had, no later than its block.
    const want = await bindOf(net, input.txHash, facts, deps);
    const regs = want ? (await registrationsOf(net.chainId, facts.nullifier)).filter((r) => r.bind === want && Math.floor(r.at / 1000) <= ts) : [];
    const codes = new Set(regs.map((r) => r.code));
    if (codes.size > 1) {
      // two links registered the same spend: it counts for nobody, now or later
      await claimTransaction(NOBODY, net.chainId, input.txHash);
      throw new ApiError(409, "conflicting_codes", "Two links registered that transaction, so it counts for neither.");
    }
    if (regs[0]) bound = { ...regs[0], by: "wallet" };
  }
  if (!bound) throw new ApiError(404, "not_registered", "That transaction did not come from a partner's link.");
  if (!kindFitsFlow(facts.kind, bound.flow)) {
    throw new ApiError(422, "wrong_flow", bound.flow === "swap" ? "A swap link counts private swaps only." : "A pay link counts payments and cash outs only.");
  }

  const edge = facts.kind === "private_payment" ? null : { asset: facts.asset, amount: facts.amount };
  if (edge && !isAddress(edge.asset)) throw new ApiError(422, "not_vault_action", "That transaction is not a payment, cash out or swap in Gloam's vault.");
  // a cash out to a partner's own proven address is theirs, whichever link it came from
  const owner = facts.kind === "cash_out" && facts.to ? await addressOwner(net.chainId, facts.to) : null;
  const ownerPartner = owner ? await getPartner(owner) : null;
  const partner = ownerPartner ?? (await getPartner(bound.partnerId));
  if (!partner) throw new ApiError(404, "not_registered", "The partner behind that link is gone.");
  const r = await deps.record({
    partner,
    keyId: null,
    source: ownerPartner ? "chain" : "link",
    linkCode: ownerPartner ? null : bound.code,
    linkBind: ownerPartner ? null : bound.by,
    network: net,
    kind: facts.kind,
    txHash: input.txHash,
    edge,
    vaultFee: facts.kind === "private_payment" ? 0n : facts.vaultFee,
    // the day it landed, which for a cash out sent later is not the day it was reported
    now: ts * 1000,
  });
  if (!r.recorded) throw new ApiError(409, "already_attributed", "That transaction is already counted.");
  return { kind: facts.kind, record: r.record };
}

/** The flow a relay action belongs to; null for anything a link doesn't count (a memo, a refund, an exit). */
export function relayFlowOf(body: Record<string, unknown>): LinkFlow | null {
  if (body.action === "transfer" || body.action === "unshield") return "pay";
  if (body.action === "swap" && body.unshieldTx === undefined) return "swap";
  return null;
}

/** How long the relay's after-send step waits for the receipt before leaving the count to a later settle. */
const AFTER_SEND_WAIT_MS = 40_000;

/**
 * After the relay sent a transaction from a partner's link: binds the code to that
 * transaction's hash (the relay's own), then waits for the receipt and counts it.
 * Runs after the response (next/server after), never throws; a miss is counted
 * later by the app or the on-chain match, which find the same binding.
 */
export async function afterRelaySend(args: {
  net: GloamNetwork;
  hash: Hex;
  code: unknown;
  flow: LinkFlow | null;
  at: number;
  wait?: (net: GloamNetwork, hash: Hex) => Promise<void>;
  deps?: AttributionDeps;
}): Promise<void> {
  try {
    if (!args.flow || !isLinkCodeShape(args.code)) return;
    if (!(await bindRelayTx({ chainId: args.net.chainId, txHash: args.hash, code: args.code, flow: args.flow, at: args.at }))) return;
    const wait =
      args.wait ??
      (async (net: GloamNetwork, hash: Hex) => {
        await relayPublicClient(net).waitForTransactionReceipt({ hash, timeout: AFTER_SEND_WAIT_MS, pollingInterval: 1_500 });
      });
    // not landed in time (or never): the binding stays, and a later count finds it
    if (!(await wait(args.net, args.hash).then(() => true).catch(() => false))) return;
    await settleLinkTx({ chainId: args.net.chainId, txHash: args.hash.toLowerCase() as Hex }, args.deps);
  } catch (e) {
    if (e instanceof ApiError && ["already_attributed", "not_registered", "not_vault_action", "wrong_flow", "tx_failed"].includes(e.code)) return;
    console.error("gloam_partner_after_send", logSafe(e));
  }
}

/** A cash out scheduled for later from a partner's link: its code waits with the job until the relay sends it. */
export async function bindScheduledJob(args: { jobId: string; code: unknown; at: number }): Promise<void> {
  try {
    if (!isLinkCodeShape(args.code) || !(await resolveLinkCode(args.code, args.at))) return;
    await kv1(["SET", k("jobcode", args.jobId), JSON.stringify({ code: args.code, at: args.at }), "EX", JOB_CODE_TTL_SEC]);
  } catch (e) {
    console.error("gloam_partner_bind_scheduled", logSafe(e));
  }
}

/** After the scheduled run sent a job: binds its code (if any) to the relay's transaction and counts it. */
export async function afterScheduledSend(args: { net: GloamNetwork; jobId: string; hash: Hex; deps?: AttributionDeps }): Promise<void> {
  try {
    const j = jsonOf<{ code: string; at: number }>(await kv1(["GET", k("jobcode", args.jobId)]));
    if (!j) return;
    if (!(await bindRelayTx({ chainId: args.net.chainId, txHash: args.hash, code: j.code, flow: "pay", at: j.at }))) return;
    await settleLinkTx({ chainId: args.net.chainId, txHash: args.hash.toLowerCase() as Hex }, args.deps);
  } catch (e) {
    if (e instanceof ApiError && ["already_attributed", "not_registered", "tx_not_found", "tx_failed"].includes(e.code)) return;
    console.error("gloam_partner_settle_scheduled", logSafe(e));
  }
}
