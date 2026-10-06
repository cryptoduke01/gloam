/**
 * The "gloam" payment method, intent "charge": shapes, parsing and bindings.
 *
 * A gloam charge is paid with a private transfer inside the Gloam shielded
 * pool. The payment output is a note the payer creates for exactly the
 * requested amount and asset; it travels in the credential sealed to the
 * payee's receive tag, so only the payee can open it. The public chain sees a
 * shielded transfer (a nullifier and two commitments) and nothing else.
 *
 * Wire shapes (see docs/mpp/draft-gloam-charge-00.md):
 *
 *   request  { amount, currency, recipient: "gloamr1.…", description?, externalId?,
 *              methodDetails: { chainId, pool, decimals?, supportedModes? } }
 *   payload  { type: "hash", hash, ticket, binding }                       (push)
 *            { type: "transfer", transfer: { proof, root, nullifier,
 *                                            newCommitments }, ticket, binding } (pull)
 */

import type { Address, Hex } from "viem";
import {
  buildGloamPaymentRequirements,
  isReceiveTag,
  GLOAM_NETWORKS,
  NATIVE_ASSET,
  RH_USDG,
  TEMPO_OUSD,
  TEMPO_PATHUSD,
  type GloamPaymentRequirements,
} from "@gloamtrade/sdk";
import { canonicalJson, hmacBase64url, type PaymentChallenge } from "./wire.js";

export const GLOAM_METHOD = "gloam" as const;
export const GLOAM_CHARGE_INTENT = "charge" as const;
/** Domain separator of the credential's challenge binding. */
export const GLOAM_BINDING_DOMAIN = "gloam-mpp-charge-v1" as const;

/** push: the payer broadcasts its own transfer. pull: the server submits it. */
export type GloamMode = "push" | "pull";
export const GLOAM_MODES: readonly GloamMode[] = ["push", "pull"];

export interface GloamChargeMethodDetails {
  /** Chain the shielded pool lives on (Tempo Moderato 42431, Robinhood Chain testnet 46630). */
  chainId: number;
  /** The Gloam pool the transfer settles through. Clients and servers accept only the official pool for chainId. */
  pool: Address;
  /** Token decimals, for display only. */
  decimals?: number;
  /** Submission modes the server accepts. Absent means both. */
  supportedModes?: GloamMode[];
}

export interface GloamChargeRequest {
  /** Base units, as a decimal string. */
  amount: string;
  /** Token address; the zero address is the chain's native unit. */
  currency: Address;
  /** The payee's receive tag (gloamr1.…). The payment note is sealed to it. */
  recipient: string;
  description?: string;
  externalId?: string;
  methodDetails: GloamChargeMethodDetails;
}

/** The payer's transfer call, transfer(proof, root, nullifier, newCommitments) on the pool. */
export interface GloamTransferCall {
  proof: Hex;
  root: Hex;
  nullifier: Hex;
  /** [payment note, change note]. The first is the payment. */
  newCommitments: [Hex, Hex];
}

export interface GloamHashPayload {
  type: "hash";
  /** The payer's transfer transaction, already broadcast. */
  hash: Hex;
  /** The payment note package (gloam1.…) sealed to the recipient tag (gloam2t.…). */
  ticket: string;
  /** base64url HMAC-SHA256 keyed by the payment note secret over the challenge. */
  binding: string;
}

export interface GloamTransferPayload {
  type: "transfer";
  transfer: GloamTransferCall;
  ticket: string;
  binding: string;
}

export type GloamChargePayload = GloamHashPayload | GloamTransferPayload;

/** Receipt fields for a gloam charge (on top of status, method, timestamp, reference). */
export interface GloamChargeReceipt {
  status: "success";
  method: typeof GLOAM_METHOD;
  timestamp: string;
  /** The sweep transaction that moved the payment into a note only the payee knows. */
  reference: Hex;
  challengeId: string;
  chainId: number;
  externalId?: string;
  [field: string]: unknown;
}

/** A charge failure, with the Problem Details code a server should answer with. */
export class GloamChargeError extends Error {
  constructor(
    readonly code:
      | "verification-failed"
      | "invalid-payload"
      | "invalid-challenge"
      | "payment-expired"
      | "bad-request"
      | "method-unsupported",
    message: string,
    /** True when the same credential may succeed later (the transfer is not mined yet, a sweep is unconfirmed). */
    readonly retryable = false
  ) {
    super(message);
    this.name = "GloamChargeError";
  }
}

// ── the official pools ───────────────────────────────────────────────────────

/** chainId -> official Gloam pool. Pass your own map only for a private deployment you trust. */
export type GloamPools = Record<number, Address>;

export const OFFICIAL_POOLS: GloamPools = Object.fromEntries(
  Object.values(GLOAM_NETWORKS).map((n) => [n.chainId, n.pool])
) as GloamPools;

export function officialPool(chainId: number, pools: GloamPools = OFFICIAL_POOLS): Address | undefined {
  return pools[chainId];
}

const lc = (s: string) => s.toLowerCase();
const HEX32 = /^0x[0-9a-fA-F]{64}$/;
const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const UINT = /^(0|[1-9][0-9]*)$/;

/** Decimals of the assets Gloam knows (native ETH 18; PathUSD, OUSD, USDG 6), or undefined. */
export function assetDecimals(currency: Address): number | undefined {
  const c = lc(currency);
  if (c === lc(NATIVE_ASSET)) return 18;
  if (c === lc(TEMPO_PATHUSD) || c === lc(TEMPO_OUSD) || c === lc(RH_USDG)) return 6;
  return undefined;
}

/** Known assets, for labels only (never for matching: matching is by address). */
export function assetSymbol(chainId: number, currency: Address): string {
  const c = lc(currency);
  if (c === lc(NATIVE_ASSET)) return "ETH";
  if (c === lc(TEMPO_PATHUSD)) return "PathUSD";
  if (c === lc(TEMPO_OUSD)) return "OUSD";
  if (c === lc(RH_USDG)) return "USDG";
  void chainId;
  return "TOKEN";
}

// ── building and parsing requests ─────────────────────────────────────────────

export interface BuildChargeRequestParams {
  /** Price in base units. */
  amountWei: bigint;
  /** Payee receive tag (gloamr1.…). */
  recipient: string;
  /** "tempo", "robinhood", or a chain id. Default "tempo". */
  network?: "tempo" | "robinhood" | number;
  /** Token address. Default PathUSD on Tempo, native ETH on Robinhood Chain. */
  currency?: Address;
  decimals?: number;
  modes?: GloamMode[];
  description?: string;
  externalId?: string;
  pools?: GloamPools;
}

/** Resolve "tempo" | "robinhood" | chainId to a chain id, plus that network's default asset. */
export function resolveNetwork(network: BuildChargeRequestParams["network"] = "tempo") {
  if (typeof network === "number") {
    const known = Object.values(GLOAM_NETWORKS).find((n) => n.chainId === network);
    return {
      chainId: network,
      currency: known?.key === "robinhood" ? NATIVE_ASSET : TEMPO_PATHUSD,
      decimals: known?.key === "robinhood" ? 18 : 6,
    };
  }
  const net = GLOAM_NETWORKS[network];
  if (!net) throw new Error(`Unknown Gloam network "${network}".`);
  return {
    chainId: net.chainId,
    currency: net.key === "robinhood" ? NATIVE_ASSET : TEMPO_PATHUSD,
    decimals: net.key === "robinhood" ? 18 : 6,
  };
}

/** Server side: the request of a gloam charge challenge. */
export function buildGloamChargeRequest(p: BuildChargeRequestParams): GloamChargeRequest {
  if (p.amountWei <= 0n) throw new Error("amountWei must be positive.");
  if (!isReceiveTag(p.recipient)) {
    throw new Error("recipient must be a Gloam receive tag (gloamr1.…), so the payment can be sealed to the payee.");
  }
  const net = resolveNetwork(p.network);
  const pool = officialPool(net.chainId, p.pools);
  if (!pool) throw new Error(`There is no Gloam pool on chain ${net.chainId}.`);
  const currency = p.currency ?? net.currency;
  if (!ADDRESS.test(currency)) throw new Error("currency must be a token address.");
  const modes = p.modes ? [...new Set(p.modes)] : undefined;
  if (modes && (modes.length === 0 || modes.some((m) => !GLOAM_MODES.includes(m)))) {
    throw new Error('modes must be a non-empty subset of ["push", "pull"].');
  }
  const decimals = p.decimals ?? assetDecimals(currency);
  return {
    amount: p.amountWei.toString(),
    currency,
    recipient: p.recipient.trim(),
    ...(p.description !== undefined ? { description: p.description } : {}),
    ...(p.externalId !== undefined ? { externalId: p.externalId } : {}),
    methodDetails: {
      chainId: net.chainId,
      pool,
      ...(decimals !== undefined ? { decimals } : {}),
      // Absent means both, so only write it when the server narrows it.
      ...(modes && modes.length < GLOAM_MODES.length ? { supportedModes: modes } : {}),
    },
  };
}

/** Strictly parse a decoded request. Throws GloamChargeError("bad-request") with a plain reason. */
export function parseGloamChargeRequest(input: unknown): GloamChargeRequest {
  const bad = (why: string) => new GloamChargeError("bad-request", `This gloam charge request is not valid: ${why}.`);
  if (!input || typeof input !== "object" || Array.isArray(input)) throw bad("it is not an object");
  const r = input as Record<string, unknown>;
  if (typeof r.amount !== "string" || !UINT.test(r.amount) || BigInt(r.amount) <= 0n) throw bad("amount must be a positive whole number of base units");
  if (typeof r.currency !== "string" || !ADDRESS.test(r.currency)) throw bad("currency must be a token address");
  if (typeof r.recipient !== "string" || !isReceiveTag(r.recipient)) throw bad("recipient must be a Gloam receive tag (gloamr1.…)");
  const md = r.methodDetails as Record<string, unknown> | undefined;
  if (!md || typeof md !== "object") throw bad("methodDetails is missing");
  if (typeof md.chainId !== "number" || !Number.isSafeInteger(md.chainId) || md.chainId <= 0) throw bad("methodDetails.chainId must be a chain id");
  if (typeof md.pool !== "string" || !ADDRESS.test(md.pool)) throw bad("methodDetails.pool must be the pool address");
  if (md.decimals !== undefined && (typeof md.decimals !== "number" || !Number.isInteger(md.decimals) || md.decimals < 0 || md.decimals > 36)) {
    throw bad("methodDetails.decimals must be a whole number");
  }
  let supportedModes: GloamMode[] | undefined;
  if (md.supportedModes !== undefined) {
    if (!Array.isArray(md.supportedModes) || md.supportedModes.length === 0 || md.supportedModes.some((m) => m !== "push" && m !== "pull")) {
      throw bad('methodDetails.supportedModes must list "push" and/or "pull"');
    }
    supportedModes = md.supportedModes as GloamMode[];
  }
  if (md.version !== undefined && md.version !== 1) throw bad(`methodDetails.version ${String(md.version)} is not supported`);
  return {
    amount: r.amount,
    currency: r.currency as Address,
    recipient: r.recipient,
    ...(typeof r.description === "string" ? { description: r.description } : {}),
    ...(typeof r.externalId === "string" ? { externalId: r.externalId } : {}),
    methodDetails: {
      chainId: md.chainId,
      pool: md.pool as Address,
      ...(typeof md.decimals === "number" ? { decimals: md.decimals } : {}),
      ...(supportedModes ? { supportedModes } : {}),
    },
  };
}

/** Modes a request allows. */
export const allowedModes = (r: GloamChargeRequest): GloamMode[] => r.methodDetails.supportedModes ?? [...GLOAM_MODES];

/** Strictly parse a credential payload. Throws GloamChargeError("invalid-payload"). */
export function parseGloamChargePayload(input: unknown): GloamChargePayload {
  const bad = (why: string) => new GloamChargeError("invalid-payload", `This gloam credential payload is not valid: ${why}.`);
  if (!input || typeof input !== "object" || Array.isArray(input)) throw bad("it is not an object");
  const p = input as Record<string, unknown>;
  if (typeof p.ticket !== "string" || !p.ticket.startsWith("gloam2t.")) throw bad("ticket must be a payment note sealed to the recipient (gloam2t.…)");
  if (typeof p.binding !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(p.binding)) throw bad("binding must be a base64url HMAC-SHA256");
  if (p.type === "hash") {
    if (typeof p.hash !== "string" || !HEX32.test(p.hash)) throw bad("hash must be a transaction hash");
    return { type: "hash", hash: p.hash as Hex, ticket: p.ticket, binding: p.binding };
  }
  if (p.type === "transfer") {
    const t = p.transfer as Record<string, unknown> | undefined;
    if (!t || typeof t !== "object") throw bad("transfer is missing");
    if (typeof t.proof !== "string" || !/^0x([0-9a-fA-F]{2})+$/.test(t.proof)) throw bad("transfer.proof must be hex bytes");
    for (const k of ["root", "nullifier"] as const) {
      if (typeof t[k] !== "string" || !HEX32.test(t[k] as string)) throw bad(`transfer.${k} must be bytes32`);
    }
    const c = t.newCommitments;
    if (!Array.isArray(c) || c.length !== 2 || c.some((x) => typeof x !== "string" || !HEX32.test(x))) {
      throw bad("transfer.newCommitments must be two bytes32 values");
    }
    return {
      type: "transfer",
      transfer: { proof: t.proof as Hex, root: t.root as Hex, nullifier: t.nullifier as Hex, newCommitments: [c[0] as Hex, c[1] as Hex] },
      ticket: p.ticket,
      binding: p.binding,
    };
  }
  throw bad('type must be "hash" or "transfer"');
}

export const isGloamChargeChallenge = (ch: Pick<PaymentChallenge, "method" | "intent">) =>
  ch.method === GLOAM_METHOD && ch.intent === GLOAM_CHARGE_INTENT;

// ── bridges to the SDK's x402 shapes ──────────────────────────────────────────

/**
 * The SDK's payment requirements for a gloam charge, so buildGloamPayment and
 * settleGloamPayment serve MPP unchanged. `resource` is a label (the realm or URL).
 */
export function toPaymentRequirements(request: GloamChargeRequest, resource: string, maxTimeoutSeconds = 600): GloamPaymentRequirements {
  return buildGloamPaymentRequirements({
    amountWei: BigInt(request.amount),
    asset: request.currency,
    assetSymbol: assetSymbol(request.methodDetails.chainId, request.currency),
    payTo: request.recipient,
    resource,
    description: request.description,
    network: request.methodDetails.chainId,
    poolAddress: request.methodDetails.pool,
    maxTimeoutSeconds,
  });
}

/** A gloam charge request carrying the same terms as x402 gloam-private requirements. */
export function fromPaymentRequirements(
  req: GloamPaymentRequirements,
  opts: { decimals?: number; modes?: GloamMode[]; externalId?: string } = {}
): GloamChargeRequest {
  return {
    amount: String(req.maxAmountRequired),
    currency: req.asset,
    recipient: req.payTo,
    ...(req.description ? { description: req.description } : {}),
    ...(opts.externalId !== undefined ? { externalId: opts.externalId } : {}),
    methodDetails: {
      chainId: Number(req.network),
      pool: req.poolAddress,
      ...(opts.decimals !== undefined ? { decimals: opts.decimals } : {}),
      ...(opts.modes && opts.modes.length < GLOAM_MODES.length ? { supportedModes: opts.modes } : {}),
    },
  };
}

/** The economically significant terms, for comparing a presented challenge with a route's price. */
export function chargeTerms(r: GloamChargeRequest) {
  return {
    amount: r.amount,
    currency: lc(r.currency),
    recipient: r.recipient.trim(),
    chainId: r.methodDetails.chainId,
    pool: lc(r.methodDetails.pool),
  };
}

/** The first term that differs, or null when they match. */
export function termsMismatch(expected: GloamChargeRequest, actual: GloamChargeRequest): string | null {
  const a = chargeTerms(expected);
  const b = chargeTerms(actual);
  for (const k of Object.keys(a) as (keyof typeof a)[]) if (a[k] !== b[k]) return k;
  return null;
}

// ── the challenge binding ────────────────────────────────────────────────────

/** 32 big-endian bytes of a field element given as hex. */
function secretBytes(secret: Hex): Uint8Array {
  const h = BigInt(secret).toString(16).padStart(64, "0");
  if (h.length > 64) throw new Error("The note secret is wider than 32 bytes.");
  const out = new Uint8Array(32);
  for (let i = 0; i < 32; i++) out[i] = parseInt(h.slice(i * 2, i * 2 + 2), 16);
  return out;
}

/**
 * Bind a credential to exactly one challenge. Keyed by the payment note secret,
 * which only the payer and the payee know, over the challenge id, the realm and
 * the payment commitment. Someone who lifts a credential off the wire cannot
 * rebind it to another challenge without opening the sealed ticket.
 */
export async function challengeBinding(args: { secret: Hex; realm: string; challengeId: string; commitment: Hex }): Promise<string> {
  const msg = canonicalJson([GLOAM_BINDING_DOMAIN, args.realm, args.challengeId, lc(args.commitment)]);
  return hmacBase64url(secretBytes(args.secret), msg);
}
