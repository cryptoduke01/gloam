/**
 * Link attribution (POST /api/partners/attribute): a payment or swap opened from
 * a partner's link, counted to that partner once it lands. Server only.
 *
 * The app sends four things: the link's code, the chain, the transaction hash
 * and the flow the link opened ("pay" or "swap"). Nothing else is taken from the
 * request. The server then reads the transaction's receipt on that chain itself,
 * through the relay's read-only client, and counts it only when it is a real
 * vault action that fits the flow (lib/partnerVerify): a pay link's private
 * payment or cash out to a wallet, a swap link's private swap through a router
 * Gloam runs there. It has to be recent (ATTRIBUTION_WINDOW_SEC) and not yet
 * counted to anyone: a transaction counts once, for one partner (the same claim
 * as recordActivity and claimTransaction in lib/partners).
 *
 * Kept: what the chain shows and nothing more (lib/partners ActivityRecord):
 * the hash, the chain, the kind, a public edge's asset and amount, the vault's
 * fee, the time and the partner. Never the payer's wallet, the address a cash out
 * paid, a note, the caller's IP or anything else. No partner and no third party
 * is called; the only outside read is the chain's own RPC.
 *
 * Every refusal fails closed: nothing is counted. The app never waits on this.
 */
import type { Hex } from "viem";
import { isAddress } from "viem";
import { ApiError } from "./partnersApi";
import { attributedTo, recordActivity, type ActivityRecord } from "./partners";
import { resolveLinkCode, isLinkCodeShape } from "./partnerLinks";
import { classifyVaultTx, kindFitsFlow, LINK_FLOWS, type LinkFlow, type ReceiptLog } from "./partnerVerify";
import { networkForChain, relayPublicClient } from "./relay/server";
import { EVERY_SWAP_ROUTER, swapRoutersOn } from "./vaultSwap";
import type { GloamNetwork } from "./networks";

/** A transaction can be counted to a link this long after it lands: a day for a cash out sent later, and some to spare. */
export const ATTRIBUTION_WINDOW_SEC = 72 * 3600;

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

export type AttributionInput = { code: string; chainId: number; txHash: Hex; flow: LinkFlow };

/** The request body, checked to the letter, or a 400. Extra fields are refused, not ignored. */
export function readAttributionInput(body: Record<string, unknown>): AttributionInput {
  const keys = Object.keys(body);
  if (keys.some((key) => !["code", "chainId", "txHash", "flow"].includes(key))) {
    throw new ApiError(400, "bad_request", "Send only { code, chainId, txHash, flow }.");
  }
  if (!isLinkCodeShape(body.code)) throw new ApiError(400, "bad_code", "That is not a partner link code.");
  if (typeof body.chainId !== "number" || !Number.isSafeInteger(body.chainId) || body.chainId <= 0) {
    throw new ApiError(400, "bad_chain", "chainId must be a chain id number.");
  }
  if (typeof body.txHash !== "string" || !/^0x[0-9a-fA-F]{64}$/.test(body.txHash)) {
    throw new ApiError(400, "bad_tx", "txHash must be a 32-byte transaction hash.");
  }
  if (typeof body.flow !== "string" || !LINK_FLOWS.includes(body.flow as LinkFlow)) {
    throw new ApiError(400, "bad_flow", 'flow must be "pay" or "swap".');
  }
  return { code: body.code, chainId: body.chainId, txHash: body.txHash.toLowerCase() as Hex, flow: body.flow as LinkFlow };
}

/** Counts one transaction to the partner whose live code it came with, or throws an ApiError saying why not. */
export async function attributeLinkTx(
  input: AttributionInput,
  deps: AttributionDeps = attributionDeps
): Promise<{ kind: ActivityRecord["kind"]; record: ActivityRecord }> {
  let net: GloamNetwork;
  try {
    net = networkForChain(input.chainId);
  } catch {
    throw new ApiError(400, "bad_chain", "Gloam does not run a vault on that chain.");
  }
  const resolved = await resolveLinkCode(input.code, deps.now());
  if (!resolved) throw new ApiError(404, "code_not_live", "That link code is not live. It may have been revoked or expired.");
  // counted already (to anyone): no chain read
  if (await attributedTo(net.chainId, input.txHash)) throw new ApiError(409, "already_attributed", "That transaction is already counted.");

  const receipt = await deps.receipt(net, input.txHash);
  if (!receipt) throw new ApiError(404, "tx_not_found", `No confirmed transaction with that hash on ${net.label} yet.`);
  if (receipt.status !== "success") throw new ApiError(422, "tx_failed", "That transaction failed on chain.");

  const facts = classifyVaultTx(receipt.logs, {
    pool: net.pool!,
    routers: swapRoutersOn(net.chainId).map((r) => r.address),
    anyRouter: EVERY_SWAP_ROUTER,
  });
  if (!facts.ok) throw new ApiError(422, "not_vault_action", "That transaction is not a payment, cash out or swap in Gloam's vault.");
  if (!kindFitsFlow(facts.kind, input.flow)) {
    throw new ApiError(422, "wrong_flow", input.flow === "swap" ? "A swap link counts private swaps only." : "A pay link counts payments and cash outs only.");
  }

  const ts = await deps.blockTime(net, receipt.blockNumber);
  const age = Math.floor(deps.now() / 1000) - ts;
  if (!Number.isFinite(ts) || ts <= 0 || age > ATTRIBUTION_WINDOW_SEC) {
    throw new ApiError(422, "too_old", "Link payments can be counted for 72 hours after they land.");
  }

  const edge = facts.kind === "private_payment" ? null : { asset: facts.asset, amount: facts.amount };
  if (edge && !isAddress(edge.asset)) throw new ApiError(422, "not_vault_action", "That transaction is not a payment, cash out or swap in Gloam's vault.");
  const r = await deps.record({
    partner: resolved.partner,
    keyId: null,
    source: "link",
    linkCode: resolved.code.code,
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
