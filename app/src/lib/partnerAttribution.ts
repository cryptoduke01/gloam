/**
 * Link attribution: a payment, cash out or swap opened from a partner's link,
 * counted to that partner. Server only.
 *
 * The link's code is bound to the spend before the transaction exists, so nobody
 * can claim someone else's transaction afterwards:
 *  - Relayed sends (payments and cash outs by default, swaps always): the app hands
 *    the code to the relay with the proof. The relay registers the spend under the
 *    code with the time it took the request, before anything is on chain, and once
 *    the transaction lands, counts it (afterRelaySend).
 *  - Wallet sends: before the wallet is asked, the app registers a hash of the
 *    spend's nullifier with the code (POST /api/partners/register). Only a
 *    registration made before the transaction's block counts.
 *  - Cash outs sent later: registered by the relay when they are scheduled.
 * A registration is keyed by linkNullifierHash(nullifier) (lib/partnerCode), which
 * names the spend without revealing it; the earliest registration of a spend wins.
 *
 * Counting (settleLinkTx, POST /api/partners/attribute, the scheduled run and the
 * on-chain match) reads the receipt on its chain through the relay's read-only
 * client, finds the spend's nullifier (lib/partnerVerify), and counts the
 * transaction to the registration's partner when it is a real vault action that
 * fits the flow. Who asks to count it changes nothing: the partner comes from the
 * registration. A cash out that pays a partner's own verified address
 * (lib/partnerAddresses) is that partner's, matched on chain, whatever link it
 * came from.
 *
 * Kept: what the chain shows and nothing more (lib/partners ActivityRecord). Never
 * the payer's wallet, the address a cash out paid, a note, the caller's IP or
 * anything else. No partner and no third party is called. Nothing here ever holds
 * up a send: failures are logged and dropped.
 */
import type { Hex } from "viem";
import { isAddress } from "viem";
import { ApiError } from "./partnersApi";
import { attributedTo, getPartner, recordActivity, type ActivityRecord } from "./partners";
import { linkCodeState, resolveLinkCode, getLinkCode } from "./partnerLinks";
import { isBytes32, isLinkCodeShape, linkNullifierHash } from "./partnerCode";
import { classifyVaultTx, kindFitsFlow, LINK_FLOWS, type LinkFlow, type ReceiptLog, type VaultTxFacts } from "./partnerVerify";
import { jsonOf, k, kv, kv1 } from "./partnersKv";
import { addressOwner } from "./partnerAddresses";
import { networkForChain, relayPublicClient } from "./relay/server";
import { EVERY_SWAP_ROUTER, swapRoutersOn } from "./vaultSwap";
import { logSafe } from "./logSafe";
import type { GloamNetwork } from "./networks";

/** A registration is kept this long: long enough for a cash out sent later, a day out, and the app's next visit. */
export const REGISTRATION_TTL_SEC = 7 * 86_400;
/** A transaction can be counted to a link this long after it lands. */
export const ATTRIBUTION_WINDOW_SEC = REGISTRATION_TTL_SEC;

export type Registration = {
  partnerId: string;
  code: string;
  flow: LinkFlow;
  /** ms: when the server took it (the relay: when it took the request, before the send). */
  at: number;
  /** "relay": made by the relay from the request it sent; "app": made by the app before a wallet send. */
  via: "relay" | "app";
};

/**
 * Registers a spend under a live code. The earliest registration of a spend wins:
 * a later one (someone who saw the transaction go by) never replaces it, and the
 * relay's, made when it took the request, replaces one made after that.
 * Returns whether this one is now the spend's registration.
 */
export async function registerLink(args: {
  chainId: number;
  nullifierHash: Hex;
  code: string;
  flow: LinkFlow;
  via: "relay" | "app";
  at?: number;
}): Promise<{ registered: boolean; reason?: "code_not_live" | "earlier" }> {
  const at = args.at ?? Date.now();
  const resolved = await resolveLinkCode(args.code, at);
  if (!resolved) return { registered: false, reason: "code_not_live" };
  const key = k("reg", args.chainId, args.nullifierHash.toLowerCase());
  const prev = jsonOf<Registration>(await kv1(["GET", key]));
  // an earlier registration stands; it is this one's when it names the same code (the app registered before handing the relay the code)
  if (prev && prev.at <= at) return { registered: prev.code === args.code, reason: "earlier" };
  const reg: Registration = { partnerId: resolved.partner.id, code: resolved.code.code, flow: args.flow, at, via: args.via };
  await kv([["SET", key, JSON.stringify(reg), "EX", REGISTRATION_TTL_SEC]]);
  return { registered: true };
}

export async function registrationOf(chainId: number, nullifier: Hex): Promise<Registration | null> {
  return jsonOf<Registration>(await kv1(["GET", k("reg", chainId, linkNullifierHash(nullifier).toLowerCase())]));
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

export type RegisterInput = { chainId: number; nullifierHash: Hex; code: string; flow: LinkFlow };

/** The registration request's body, to the letter, or a 400. */
export function readRegisterInput(body: Record<string, unknown>): RegisterInput {
  if (Object.keys(body).some((key) => !["chainId", "nullifierHash", "code", "flow"].includes(key))) {
    throw new ApiError(400, "bad_request", "Send only { chainId, nullifierHash, code, flow }.");
  }
  if (typeof body.chainId !== "number" || !Number.isSafeInteger(body.chainId) || body.chainId <= 0) {
    throw new ApiError(400, "bad_chain", "chainId must be a chain id number.");
  }
  if (!isBytes32(body.nullifierHash)) throw new ApiError(400, "bad_hash", "nullifierHash must be 32 bytes.");
  if (!isLinkCodeShape(body.code)) throw new ApiError(400, "bad_code", "That is not a partner link code.");
  if (typeof body.flow !== "string" || !LINK_FLOWS.includes(body.flow as LinkFlow)) {
    throw new ApiError(400, "bad_flow", 'flow must be "pay" or "swap".');
  }
  return { chainId: body.chainId, nullifierHash: body.nullifierHash.toLowerCase() as Hex, code: body.code, flow: body.flow as LinkFlow };
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
 * Counts one landed transaction to the partner its spend was registered under,
 * or throws an ApiError saying why not. A cash out to a partner's own verified
 * address goes to that partner instead, as matched on chain.
 */
export async function settleLinkTx(
  input: SettleInput,
  deps: AttributionDeps = attributionDeps
): Promise<{ kind: ActivityRecord["kind"]; record: ActivityRecord }> {
  const net = netFor(input.chainId);
  // counted already (to anyone): no chain read
  if (await attributedTo(net.chainId, input.txHash)) throw new ApiError(409, "already_attributed", "That transaction is already counted.");

  const receipt = await deps.receipt(net, input.txHash);
  if (!receipt) throw new ApiError(404, "tx_not_found", `No confirmed transaction with that hash on ${net.label} yet.`);
  if (receipt.status !== "success") throw new ApiError(422, "tx_failed", "That transaction failed on chain.");
  const facts = classify(net, receipt.logs);
  if (!facts.ok) throw new ApiError(422, "not_vault_action", "That transaction is not a payment, cash out or swap in Gloam's vault.");

  const reg = await registrationOf(net.chainId, facts.nullifier);
  if (!reg) throw new ApiError(404, "not_registered", "That transaction did not come from a partner's link.");
  if (!kindFitsFlow(facts.kind, reg.flow)) {
    throw new ApiError(422, "wrong_flow", reg.flow === "swap" ? "A swap link counts private swaps only." : "A pay link counts payments and cash outs only.");
  }
  const ts = await deps.blockTime(net, receipt.blockNumber);
  if (!Number.isFinite(ts) || ts <= 0) throw new ApiError(502, "rpc", "Could not read the block. Try again.");
  // the app's registration has to be older than the block: one made after the transaction showed up counts for nothing
  if (reg.via === "app" && reg.at > ts * 1000) throw new ApiError(422, "registered_late", "That transaction was registered after it landed.");
  if (Math.floor(deps.now() / 1000) - ts > ATTRIBUTION_WINDOW_SEC) {
    throw new ApiError(422, "too_old", "Link payments can be counted for seven days after they land.");
  }

  const edge = facts.kind === "private_payment" ? null : { asset: facts.asset, amount: facts.amount };
  if (edge && !isAddress(edge.asset)) throw new ApiError(422, "not_vault_action", "That transaction is not a payment, cash out or swap in Gloam's vault.");

  // a cash out to a partner's own verified address is theirs, whichever link it came from
  const owner = facts.kind === "cash_out" && facts.to ? await addressOwner(net.chainId, facts.to) : null;
  const ownerPartner = owner ? await getPartner(owner) : null;
  const partner = ownerPartner ?? (await getPartner(reg.partnerId));
  if (!partner) throw new ApiError(404, "not_registered", "The partner behind that link is gone.");
  const r = await deps.record({
    partner,
    keyId: null,
    source: ownerPartner ? "chain" : "link",
    linkCode: ownerPartner ? null : reg.code,
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

/** The flow a relay action belongs to, and the nullifier of the spend it sends; null for anything a link doesn't count. */
export function relaySpendOf(body: Record<string, unknown>): { flow: LinkFlow; nullifier: Hex } | null {
  if (body.action === "transfer" || body.action === "unshield") {
    return isBytes32(body.nullifier) ? { flow: "pay", nullifier: body.nullifier } : null;
  }
  if (body.action === "swap" && body.unshieldTx === undefined) {
    const spend = (body.spend ?? {}) as Record<string, unknown>;
    return isBytes32(spend.nullifier) ? { flow: "swap", nullifier: spend.nullifier } : null;
  }
  return null;
}

/** How long the relay's after-send step waits for the receipt before leaving the count to a later settle. */
const AFTER_SEND_WAIT_MS = 40_000;

/**
 * After the relay sent a transaction from a partner's link: registers its spend
 * under the code as of `at` (when the relay took the request), then waits for the
 * receipt and counts it. Runs after the response (next/server after), never
 * throws, and a miss is settled later by the app, the scheduled run or the
 * on-chain match.
 */
export async function afterRelaySend(args: {
  net: GloamNetwork;
  hash: Hex;
  code: unknown;
  spend: { flow: LinkFlow; nullifier: Hex } | null;
  at: number;
  wait?: (net: GloamNetwork, hash: Hex) => Promise<void>;
  deps?: AttributionDeps;
}): Promise<void> {
  try {
    if (!args.spend || !isLinkCodeShape(args.code)) return;
    const r = await registerLink({
      chainId: args.net.chainId,
      nullifierHash: linkNullifierHash(args.spend.nullifier),
      code: args.code,
      flow: args.spend.flow,
      via: "relay",
      at: args.at,
    });
    if (!r.registered) return;
    const wait =
      args.wait ??
      (async (net: GloamNetwork, hash: Hex) => {
        await relayPublicClient(net).waitForTransactionReceipt({ hash, timeout: AFTER_SEND_WAIT_MS, pollingInterval: 1_500 });
      });
    await wait(args.net, args.hash);
    await settleLinkTx({ chainId: args.net.chainId, txHash: args.hash.toLowerCase() as Hex }, args.deps);
  } catch (e) {
    if (e instanceof ApiError && ["already_attributed", "not_registered", "not_vault_action", "wrong_flow"].includes(e.code)) return;
    console.error("gloam_partner_after_send", logSafe(e));
  }
}

/** A scheduled cash out from a partner's link: registered when it is scheduled, before anything is sent. */
export async function registerScheduled(args: { chainId: number; nullifier: Hex; code: unknown; at: number }): Promise<void> {
  try {
    if (!isLinkCodeShape(args.code)) return;
    await registerLink({ chainId: args.chainId, nullifierHash: linkNullifierHash(args.nullifier), code: args.code, flow: "pay", via: "relay", at: args.at });
  } catch (e) {
    console.error("gloam_partner_register_scheduled", logSafe(e));
  }
}

/** Whether a code is live, for the registration route's answer. */
export async function codeIsLive(code: string): Promise<boolean> {
  const c = await getLinkCode(code);
  return Boolean(c && linkCodeState(c) === "live");
}
