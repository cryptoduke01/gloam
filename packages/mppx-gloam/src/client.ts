/**
 * Payer side of a gloam charge: turn a 402 challenge into a credential.
 *
 * Built on the SDK's buildGloamPayment: a private send of exactly the
 * requested amount from a note the payer holds, with the payment note sealed
 * to the payee's receive tag. Then either
 *
 *   push  the payer broadcasts the transfer itself (its own wallet or the
 *         Gloam relay) and presents the transaction hash, or
 *   pull  the payer presents the proven transfer call and the server submits
 *         it, so the payer needs no gas and its wallet never touches the chain.
 *
 * Nothing here holds keys: proving and submission are injected, and the
 * change note is handed to the caller before anything is submitted.
 */

import type { Address, Hex } from "viem";
import {
  buildGloamPayment,
  isReceiveTag,
  type BuiltPayment,
  type GloamIntent,
  type IntentExec,
  type PoseidonMerklePath,
  type Prover,
} from "@gloamtrade/sdk";
import {
  allowedModes,
  challengeBinding,
  isGloamChargeChallenge,
  officialPool,
  parseGloamChargeRequest,
  toPaymentRequirements,
  GloamChargeError,
  type GloamChargePayload,
  type GloamChargeRequest,
  type GloamMode,
  type GloamPools,
} from "./charge.js";
import { secondsLeft, serializeCredential, type PaymentChallenge, type PaymentCredential } from "./wire.js";

/** A note the payer holds in the pool, with its membership path. */
export interface GloamSpendableNote {
  secret: Hex;
  amountWei: bigint;
  path: PoseidonMerklePath;
}

/** Submits a proven private send (wallet or relay) and returns the transaction hash. */
export type GloamSubmitter = (intent: GloamIntent & { exec: IntentExec }) => Promise<Hex>;

/** Limits a payer applies before paying any challenge (the spec's amount, recipient and currency checks). */
export interface GloamClientPolicy {
  /** Refuse a charge above this many base units. */
  maxAmountWei?: bigint;
  /** Only these token addresses. */
  currencies?: Address[];
  /** Only these chain ids. */
  chainIds?: number[];
  /** Only these receive tags. */
  recipients?: string[];
}

/** Throw a plain error when a request breaks the payer's policy or names a pool that is not Gloam's. */
export function assertPayable(request: GloamChargeRequest, policy: GloamClientPolicy = {}, pools?: GloamPools): void {
  const md = request.methodDetails;
  const official = officialPool(md.chainId, pools);
  if (!official) throw new Error(`There is no Gloam pool on chain ${md.chainId}; not paying.`);
  if (official.toLowerCase() !== md.pool.toLowerCase()) {
    throw new Error(`The challenge names pool ${md.pool}, not the Gloam pool ${official} on chain ${md.chainId}; not paying.`);
  }
  if (!isReceiveTag(request.recipient)) throw new Error("The recipient is not a Gloam receive tag; not paying.");
  if (policy.chainIds && !policy.chainIds.includes(md.chainId)) throw new Error(`Chain ${md.chainId} is not allowed by this payer.`);
  if (policy.currencies && !policy.currencies.some((c) => c.toLowerCase() === request.currency.toLowerCase())) {
    throw new Error(`Currency ${request.currency} is not allowed by this payer.`);
  }
  if (policy.recipients && !policy.recipients.some((t) => t.trim() === request.recipient.trim())) {
    throw new Error("This recipient is not on the payer's list.");
  }
  if (policy.maxAmountWei !== undefined && BigInt(request.amount) > policy.maxAmountWei) {
    throw new Error(`The charge of ${request.amount} base units is over the payer's limit of ${policy.maxAmountWei}.`);
  }
}

/** Pick a mode: the preferred one if the challenge allows it, else what the payer can do. */
export function chooseMode(request: GloamChargeRequest, prefer: GloamMode | "auto", canPush: boolean): GloamMode {
  const allowed = allowedModes(request).filter((m) => m === "pull" || canPush);
  if (allowed.length === 0) {
    throw new Error(canPush ? "The challenge allows no submission mode." : "The challenge only accepts push, and no submitter was given to broadcast the transfer.");
  }
  if (prefer !== "auto") {
    if (!allowed.includes(prefer)) throw new Error(`The challenge does not accept ${prefer} mode (it accepts: ${allowed.join(", ")}).`);
    return prefer;
  }
  // Pull first: no gas for the payer, its wallet never appears, and nothing moves unless the server takes it.
  return allowed.includes("pull") ? "pull" : "push";
}

/** The payer's transfer call out of a built payment. */
export function transferCallOf(built: Pick<BuiltPayment, "intent">) {
  const [proof, root, nullifier, outs] = built.intent.exec.args as readonly [Hex, Hex, Hex, readonly [Hex, Hex]];
  return { proof, root, nullifier, newCommitments: [outs[0], outs[1]] as [Hex, Hex] };
}

/** The fields of a challenge the payer side needs (an mppx Challenge fits, and so does a parsed one). */
export interface ChallengeForPayment {
  id: string;
  realm: string;
  method: string;
  intent: string;
  request: unknown;
  expires?: string;
}

/**
 * The credential payload for an already-built payment. The payment note secret
 * is used only to compute the challenge binding; it never leaves in the clear.
 */
export async function payloadFromPayment(args: {
  challenge: Pick<ChallengeForPayment, "id" | "realm">;
  payment: Pick<BuiltPayment, "intent" | "paymentNote" | "payload" | "sealed">;
  mode: GloamMode;
  /** The broadcast transfer's hash; required for push. */
  hash?: Hex | null;
}): Promise<GloamChargePayload> {
  const { challenge, payment } = args;
  if (!payment.sealed) throw new Error("A gloam credential carries the payment note sealed to the recipient; this payment is not sealed.");
  const binding = await challengeBinding({
    secret: payment.paymentNote.secret,
    realm: challenge.realm,
    challengeId: challenge.id,
    commitment: payment.paymentNote.commitment,
  });
  const ticket = payment.payload.payload.paymentNote;
  if (args.mode === "push") {
    if (!args.hash) throw new Error("push mode needs the hash of the broadcast transfer.");
    return { type: "hash", hash: args.hash, ticket, binding };
  }
  return { type: "transfer", transfer: transferCallOf(payment), ticket, binding };
}

/**
 * Wrap an already-built payment into a serialized credential. For callers that
 * build and broadcast the payment themselves (the Gloam MCP server does).
 */
export async function credentialFromPayment(args: {
  challenge: PaymentChallenge;
  payment: Pick<BuiltPayment, "intent" | "paymentNote" | "payload" | "sealed">;
  mode: GloamMode;
  hash?: Hex | null;
}): Promise<{ authorization: string; credential: PaymentCredential<GloamChargePayload> }> {
  const payload = await payloadFromPayment(args);
  const credential: PaymentCredential<GloamChargePayload> = { challenge: args.challenge, payload };
  return { authorization: serializeCredential(credential), credential };
}

export interface PayGloamChargeParams {
  challenge: ChallengeForPayment;
  /** The note to pay from (it must cover the amount; the rest comes back as change). */
  note: GloamSpendableNote;
  /** Transfer-circuit prover (artifactProver over transfer.wasm + transfer_final.zkey). */
  prove: Prover;
  /** "auto" (default) prefers pull. */
  mode?: GloamMode | "auto";
  /** Broadcasts the transfer in push mode (your wallet, or relaySubmitter()). */
  submit?: GloamSubmitter;
  /** Optional: wait for the push transfer to confirm before presenting it. Recommended. */
  waitForReceipt?: (hash: Hex) => Promise<{ status: "success" | "reverted" }>;
  policy?: GloamClientPolicy;
  pools?: GloamPools;
  /** Refuse to push with less time than this left on the challenge. Default 30 seconds. */
  minSecondsLeft?: number;
  /**
   * Called with the built payment before anything is submitted or returned.
   * Persist built.changeNote here: it is the payer's remaining balance.
   */
  beforeSubmit?: (built: BuiltPayment, mode: GloamMode) => void | Promise<void>;
  now?: () => number;
}

export interface PaidGloamCharge {
  payload: GloamChargePayload;
  request: GloamChargeRequest;
  mode: GloamMode;
  /** The push transfer's hash, or null in pull mode. */
  hash: Hex | null;
  built: BuiltPayment;
}

/** Check a gloam charge challenge against the payer's policy, pay it, and return the credential payload. */
export async function payGloamCharge(p: PayGloamChargeParams): Promise<PaidGloamCharge> {
  const ch = p.challenge;
  if (!isGloamChargeChallenge(ch)) throw new Error(`Not a gloam charge challenge (${ch.method}/${ch.intent}).`);
  const now = p.now?.() ?? Date.now();
  const left = secondsLeft(ch, now);
  if (left <= 0) throw new GloamChargeError("payment-expired", "This challenge has expired; request the resource again for a fresh one.");
  const request = parseGloamChargeRequest(ch.request);
  assertPayable(request, p.policy, p.pools);
  const mode = chooseMode(request, p.mode ?? "auto", !!p.submit);
  if (mode === "push" && left < (p.minSecondsLeft ?? 30)) {
    throw new GloamChargeError("payment-expired", `Only ${Math.floor(left)}s left on this challenge, too little to settle a push payment safely. Request a fresh challenge.`);
  }
  if (p.note.amountWei < BigInt(request.amount)) throw new Error("The note does not cover the charge.");

  const built = await buildGloamPayment({
    requirements: toPaymentRequirements(request, ch.realm),
    senderSecretHex: p.note.secret,
    senderNoteAmountWei: p.note.amountWei,
    path: p.note.path,
    prove: p.prove,
  });
  await p.beforeSubmit?.(built, mode);

  let hash: Hex | null = null;
  if (mode === "push") {
    hash = await p.submit!(built.intent);
    if (p.waitForReceipt) {
      const r = await p.waitForReceipt(hash);
      if (r.status !== "success") throw new Error(`The payment transfer reverted (${hash}). Nothing was paid.`);
    }
    built.payload.payload.txHash = hash;
  }
  const payload = await payloadFromPayment({ challenge: ch, payment: built, mode, hash });
  return { payload, request, mode, hash, built };
}

export interface CreatedGloamCredential extends PaidGloamCharge {
  /** The `Payment …` value for the field the challenge selects (credentialField). */
  authorization: string;
  credential: PaymentCredential<GloamChargePayload>;
}

/** Pay a parsed gloam charge challenge and return the serialized credential to retry with. */
export async function createGloamChargeCredential(
  p: Omit<PayGloamChargeParams, "challenge"> & { challenge: PaymentChallenge }
): Promise<CreatedGloamCredential> {
  const paid = await payGloamCharge(p);
  const credential: PaymentCredential<GloamChargePayload> = { challenge: p.challenge, payload: paid.payload };
  return { ...paid, credential, authorization: serializeCredential(credential) };
}
