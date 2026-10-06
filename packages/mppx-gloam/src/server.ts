/**
 * Payee side of a gloam charge: verify a credential, then make it final.
 *
 * validateGloamCharge is read-only. It opens the sealed ticket with the payee's
 * receive key and checks that the note binds the requested amount and asset,
 * that the credential is bound to this challenge, and that the note is the
 * payment output of a Transferred event in the official Gloam pool (push) or
 * of the presented transfer call (pull).
 *
 * settleGloamCharge is the terminal step. In pull mode it first submits the
 * payer's transfer. Then it runs the SDK's settleGloamPayment, which sweeps
 * the payment into a fresh note only the payee knows, and returns a receipt
 * only once that sweep confirms. The payer created the payment note and knows
 * its secret, so a payment is never final before the sweep.
 *
 * Replay protection is the payment note's nullifier: the sweep spends it on
 * chain exactly once. A replay store in front of it keeps concurrent requests
 * with the same credential from racing, and remembers a sweep whose receipt
 * was lost so a retry of the same credential can still be served once.
 */

import { keccak256, toBytes, type Address, type Hex } from "viem";
import {
  fieldToHex,
  hexToField,
  noteNullifierPoseidon,
  openGloamPaymentNote,
  settleGloamPayment,
  sweepChainFromClient,
  verifyPaymentNoteBinding,
  GLOAM_X402_SCHEME,
  GLOAM_X402_VERSION,
  type GloamIntent,
  type GloamPaymentPayload,
  type IntentExec,
  type NoteExport,
  type PrivateSendIntent,
  type Prover,
  type ReceiveKey,
  type SweepChain,
} from "@gloamtrade/sdk";
import {
  allowedModes,
  challengeBinding,
  officialPool,
  parseGloamChargePayload,
  parseGloamChargeRequest,
  toPaymentRequirements,
  GloamChargeError,
  GLOAM_METHOD,
  GLOAM_MODES,
  type GloamChargePayload,
  type GloamChargeReceipt,
  type GloamChargeRequest,
  type GloamMode,
  type GloamPools,
} from "./charge.js";
import type { GloamSubmitter } from "./client.js";
import { constantTimeEqual, isExpired } from "./wire.js";

// ── chain access ─────────────────────────────────────────────────────────────

export interface MinimalLog {
  address: string;
  topics: readonly string[];
  data: string;
}

export interface MinimalReceipt {
  status: "success" | "reverted";
  logs: readonly MinimalLog[];
}

/** What a gloam charge server needs from the chain: the sweep reads plus transaction receipts. */
export interface GloamChargeChain extends SweepChain {
  /** The receipt of `hash` with its logs, or null while it is not mined (or unknown). */
  getReceipt(hash: Hex): Promise<MinimalReceipt | null>;
}

/** topic0 of ShieldPoolPoseidon's Transferred(bytes32 indexed nullifier, bytes32[2] newCommitments). */
export const TRANSFERRED_TOPIC: Hex = keccak256(toBytes("Transferred(bytes32,bytes32[2])"));

export interface TransferredEvent {
  nullifier: Hex;
  newCommitments: [Hex, Hex];
}

/** The Transferred events `pool` emitted in a receipt. Logs from any other address are ignored. */
export function transfersInReceipt(receipt: MinimalReceipt, pool: Address): TransferredEvent[] {
  const out: TransferredEvent[] = [];
  for (const log of receipt.logs) {
    if (log.address.toLowerCase() !== pool.toLowerCase()) continue;
    if ((log.topics[0] ?? "").toLowerCase() !== TRANSFERRED_TOPIC) continue;
    const data = log.data.toLowerCase();
    if (log.topics.length < 2 || !/^0x[0-9a-f]{128}$/.test(data)) continue;
    out.push({
      nullifier: log.topics[1]!.toLowerCase() as Hex,
      newCommitments: [`0x${data.slice(2, 66)}` as Hex, `0x${data.slice(66, 130)}` as Hex],
    });
  }
  return out;
}

type SdkPublicClient = Parameters<typeof sweepChainFromClient>[0];

/** A GloamChargeChain over a viem PublicClient (the pool's tree is rebuilt for each sweep path). */
export function gloamChargeChainFromClient(client: SdkPublicClient, params: { pool: Address; fromBlock?: bigint }): GloamChargeChain {
  return {
    ...sweepChainFromClient(client, params),
    async getReceipt(hash) {
      try {
        const r = await client.getTransactionReceipt({ hash });
        return { status: r.status, logs: r.logs };
      } catch (e) {
        if (e instanceof Error && /not.?found|could not be found/i.test(`${e.name} ${e.message}`)) return null;
        throw e;
      }
    },
  };
}

// ── replay store ─────────────────────────────────────────────────────────────

export interface GloamReplayRecord {
  /** settling: a request is working on it. sent: the sweep went out, outcome unknown. settled: final, served once. */
  state: "settling" | "sent" | "settled";
  at: number;
  freshCommitment?: Hex;
  sweepHash?: Hex | null;
  receipt?: GloamChargeReceipt;
  /** On a `challenge:<id>` record: the payment that holds the challenge. */
  paymentNullifier?: Hex;
}

/**
 * Keyed by the payment note's nullifier, and by `challenge:<id>` so that a
 * challenge settles one payment only. Use a shared store (Redis, a database)
 * when several instances settle.
 */
export interface GloamReplayStore {
  get(key: string): Promise<GloamReplayRecord | undefined>;
  /** Create the record only if none exists; true when this call created it. Must be atomic. */
  claim(key: string, record: GloamReplayRecord): Promise<boolean>;
  put(key: string, record: GloamReplayRecord): Promise<void>;
  delete(key: string): Promise<void>;
}

export function memoryReplayStore(): GloamReplayStore {
  const m = new Map<string, GloamReplayRecord>();
  return {
    get: async (k) => m.get(k),
    claim: async (k, r) => {
      if (m.has(k)) return false;
      m.set(k, r);
      return true;
    },
    put: async (k, r) => void m.set(k, r),
    delete: async (k) => void m.delete(k),
  };
}

// ── config ───────────────────────────────────────────────────────────────────

export interface GloamChargeServerConfig {
  /** The payee's receive key. Its tag is the recipient of every charge this server issues. */
  receiveKey: ReceiveKey;
  /** Chain access, or a function of the chain id when the server prices on several networks. */
  chain: GloamChargeChain | ((chainId: number) => GloamChargeChain);
  /** Transfer-circuit prover for the sweep. */
  prove: Prover;
  /** Submits the sweep, and the payer's transfer in pull mode: your wallet, or relaySubmitter(). */
  submit: GloamSubmitter;
  /** Accepted modes. Default both. */
  modes?: GloamMode[];
  pools?: GloamPools;
  replay?: GloamReplayStore;
  /**
   * Called with the payee's fresh note after it is proved and before the sweep
   * is submitted. Persist it here: its secret is the money, and if the process
   * dies after submitting this is the only copy.
   */
  beforeSubmit?: (freshNote: NoteExport, intent: PrivateSendIntent) => void | Promise<void>;
  /** How long a settling record blocks another request for the same payment. Default 120 s. */
  settlingTimeoutMs?: number;
  now?: () => number;
}

const fail = (message: string, retryable = false) => new GloamChargeError("verification-failed", message, retryable);
const lc = (s: string) => s.toLowerCase();
const chainFor = (config: GloamChargeServerConfig, chainId: number) =>
  typeof config.chain === "function" ? config.chain(chainId) : config.chain;

const replayStores = new WeakMap<GloamChargeServerConfig, GloamReplayStore>();
const challengeKey = (id: string) => `challenge:${id}`;
/** The config's replay store, or one in-memory store per config object. */
export function replayStoreOf(config: GloamChargeServerConfig): GloamReplayStore {
  if (config.replay) return config.replay;
  let s = replayStores.get(config);
  if (!s) replayStores.set(config, (s = memoryReplayStore()));
  return s;
}

// ── validate ─────────────────────────────────────────────────────────────────

/** The challenge fields a gloam charge needs (an echoed challenge from any MPP library fits). */
export interface ChargeChallengeLike {
  id: string;
  realm: string;
  request: unknown;
  expires?: string;
}

export interface ValidatedGloamCharge {
  challengeId: string;
  realm: string;
  request: GloamChargeRequest;
  payload: GloamChargePayload;
  mode: GloamMode;
  /** The opened payment note. Keep it server side; its secret is spendable until the sweep. */
  note: NoteExport;
  paymentNullifier: Hex;
  /** The payer's transfer: from the Transferred event (push) or the presented call (pull). */
  transfer: { nullifier: Hex; newCommitments: [Hex, Hex]; proof?: Hex; root?: Hex };
  /** True when the payer's transfer is already in the pool. */
  landed: boolean;
  /** A record left by an earlier attempt with this payment (a sweep whose outcome was unknown). */
  pending: GloamReplayRecord | null;
}

/**
 * Read-only verification of a gloam charge credential against the challenge it
 * echoes. The caller must already have checked that the challenge is its own
 * (HMAC id) and is the price of the resource requested; MPP libraries do that.
 */
export async function validateGloamCharge(args: {
  challenge: ChargeChallengeLike;
  payload: unknown;
  config: GloamChargeServerConfig;
}): Promise<ValidatedGloamCharge> {
  const { challenge, config } = args;
  const now = config.now?.() ?? Date.now();
  if (isExpired(challenge, now)) throw new GloamChargeError("payment-expired", "This challenge has expired.");

  const request = parseGloamChargeRequest(challenge.request);
  const md = request.methodDetails;
  const official = officialPool(md.chainId, config.pools);
  if (!official || lc(official) !== lc(md.pool)) {
    throw fail(`The challenge names pool ${md.pool} on chain ${md.chainId}, which is not the Gloam pool. Not settling there.`);
  }
  if (request.recipient.trim() !== config.receiveKey.tag.trim()) {
    throw fail("This charge pays a different receive tag than this server's.");
  }

  const payload = parseGloamChargePayload(args.payload);
  const mode: GloamMode = payload.type === "hash" ? "push" : "pull";
  const serverModes = config.modes ?? GLOAM_MODES;
  if (!allowedModes(request).includes(mode) || !serverModes.includes(mode)) {
    throw fail(`This server does not accept ${mode} mode for this charge.`);
  }

  let note: NoteExport & { pool?: Address };
  try {
    note = await openGloamPaymentNote(payload.ticket, config.receiveKey);
  } catch {
    throw fail("The ticket does not open with this server's receive key: it was sealed to someone else, or it is corrupt.");
  }
  if (note.pool && lc(note.pool) !== lc(md.pool)) throw fail("The payment note belongs to a different pool.");
  if (lc(note.asset) !== lc(request.currency)) throw fail("The payment note holds a different asset than the charge asks for.");
  if (BigInt(note.amountWei) !== BigInt(request.amount)) {
    throw fail(`The payment note carries ${note.amountWei} base units; the charge is ${request.amount}.`);
  }
  if (!(await verifyPaymentNoteBinding(note))) throw fail("The payment note's amount does not bind to its commitment.");
  const expected = await challengeBinding({
    secret: note.secret,
    realm: challenge.realm,
    challengeId: challenge.id,
    commitment: note.commitment,
  });
  if (!constantTimeEqual(expected, payload.binding)) throw fail("This credential is bound to a different challenge.");

  const paymentNullifier = fieldToHex(await noteNullifierPoseidon(hexToField(note.secret), hexToField(note.commitment)));
  const pending = (await replayStoreOf(config).get(paymentNullifier)) ?? null;
  if (pending?.state === "settled") throw fail("This payment was already used.");
  const holder = await replayStoreOf(config).get(challengeKey(challenge.id));
  if (holder?.state === "settled" && holder.paymentNullifier !== paymentNullifier) {
    throw new GloamChargeError("invalid-challenge", "This challenge was already paid and used. Request the resource again for a fresh one.");
  }

  const chain = chainFor(config, md.chainId);
  // Spent with no record of ours: the payer (who also knows the secret) moved it, or another server took it.
  if (!pending && (await chain.isSpent(paymentNullifier))) {
    throw fail("The payment note was already spent, most likely by the payer who created it. Do not grant access.");
  }

  let transfer: ValidatedGloamCharge["transfer"];
  let landed: boolean;
  if (payload.type === "hash") {
    const receipt = await chain.getReceipt(payload.hash);
    if (!receipt) throw fail(`The payment transfer ${payload.hash} is not mined yet. Retry shortly with the same credential.`, true);
    if (receipt.status !== "success") throw fail(`The payment transfer ${payload.hash} reverted.`);
    const event = transfersInReceipt(receipt, md.pool).find((e) => lc(e.newCommitments[0]) === lc(note.commitment));
    if (!event) throw fail("The payment note is not the payment output of a Transferred event from the Gloam pool in that transaction.");
    transfer = event;
    landed = true;
  } else {
    const t = payload.transfer;
    if (lc(t.newCommitments[0]) !== lc(note.commitment)) throw fail("The payment note is not the payment output of the presented transfer.");
    transfer = t;
    landed = await chain.isCommitmentSeen(note.commitment);
    if (!landed && !pending && (await chain.isSpent(t.nullifier))) {
      throw fail("The note that funds this transfer was already spent elsewhere, so the transfer cannot land.");
    }
  }

  return { challengeId: challenge.id, realm: challenge.realm, request, payload, mode, note, paymentNullifier, transfer, landed, pending };
}

// ── settle ───────────────────────────────────────────────────────────────────

function receiptOf(v: ValidatedGloamCharge, sweepHash: Hex, now: number): GloamChargeReceipt {
  return {
    status: "success",
    method: GLOAM_METHOD,
    timestamp: new Date(now).toISOString().replace(/\.\d{3}Z$/, "Z"),
    reference: sweepHash,
    challengeId: v.challengeId,
    chainId: v.request.methodDetails.chainId,
    ...(v.request.externalId !== undefined ? { externalId: v.request.externalId } : {}),
  };
}

/** The payer's transfer from a pull credential, as an intent any submitter (wallet or relay) can send. */
export function payerTransferIntent(chainId: number, pool: Address, t: ValidatedGloamCharge["transfer"]): GloamIntent<"private_send"> & { exec: IntentExec } {
  if (!t.proof || !t.root) throw fail("The transfer call is incomplete.");
  return {
    intent: "private_send",
    chainId,
    agentAddress: null,
    plan: { asset: "shielded" },
    privacy: "A payer's private send, submitted by the payee. The public sees a shielded transfer.",
    execution: "Submitted by the payee on the payer's behalf (pull mode).",
    exec: { poolAddress: pool, fn: "transfer", valueWei: 0n, args: [t.proof, t.root, t.nullifier, t.newCommitments] },
  };
}

/**
 * Make a gloam charge final and return its receipt. Validates first unless a
 * validation from this same request is passed in. Throws GloamChargeError;
 * `retryable` errors mean the same credential may succeed on a later try.
 */
export async function settleGloamCharge(args: {
  challenge: ChargeChallengeLike;
  payload: unknown;
  config: GloamChargeServerConfig;
  validated?: ValidatedGloamCharge;
}): Promise<GloamChargeReceipt> {
  const { config } = args;
  const v = args.validated ?? (await validateGloamCharge(args));
  const md = v.request.methodDetails;
  const chain = chainFor(config, md.chainId);
  const replay = replayStoreOf(config);
  const clock = () => config.now?.() ?? Date.now();
  const key = v.paymentNullifier;

  const timeout = config.settlingTimeoutMs ?? 120_000;
  const ckey = challengeKey(v.challengeId);
  const markChallenge = (state: GloamReplayRecord["state"]) => replay.put(ckey, { state, at: clock(), paymentNullifier: key });
  const releaseChallenge = async () => {
    const h = await replay.get(ckey);
    if (h?.paymentNullifier === key) await replay.delete(ckey);
  };

  // A challenge settles one payment. Another payment that holds it blocks this one (before anything is swept).
  const holder = await replay.get(ckey);
  if (holder && holder.paymentNullifier !== key) {
    if (holder.state === "settled") {
      throw new GloamChargeError("invalid-challenge", "This challenge was already paid and used. Request the resource again for a fresh one.");
    }
    if (holder.state === "sent" || clock() - holder.at < timeout) {
      throw fail("Another payment for this challenge is being settled. Retry shortly.", true);
    }
  }

  // An earlier attempt with this payment: finish it, wait for it, or refuse.
  const existing = await replay.get(key);
  if (existing?.state === "settled") throw fail("This payment was already used.");
  if (existing?.state === "sent") {
    if (existing.freshCommitment && (await chain.isCommitmentSeen(existing.freshCommitment))) {
      const reference = existing.sweepHash ?? (v.payload.type === "hash" ? v.payload.hash : existing.freshCommitment);
      const receipt = receiptOf(v, reference, clock());
      await replay.put(key, { ...existing, state: "settled", at: clock(), receipt });
      await markChallenge("settled");
      return receipt;
    }
    if (await chain.isSpent(key)) {
      await replay.delete(key);
      await releaseChallenge();
      throw fail("The payment note was spent by someone else before this server's sweep landed. Do not grant access.");
    }
    throw fail("A sweep of this payment was sent and has not confirmed yet. Retry shortly with the same credential.", true);
  }
  if (existing?.state === "settling" && clock() - existing.at < timeout) {
    throw fail("This payment is being settled by another request. Retry shortly.", true);
  }
  const claim: GloamReplayRecord = { state: "settling", at: clock() };
  if (existing) await replay.put(key, claim);
  else if (!(await replay.claim(key, claim))) throw fail("This payment is being settled by another request. Retry shortly.", true);
  // Then the challenge, atomically (a stale claim by another payment is taken over).
  const challengeClaim: GloamReplayRecord = { state: "settling", at: clock(), paymentNullifier: key };
  if (holder) await replay.put(ckey, challengeClaim);
  else if (!(await replay.claim(ckey, challengeClaim))) {
    await replay.delete(key);
    throw fail("Another payment for this challenge is being settled. Retry shortly.", true);
  }

  let sent = false;
  try {
    // Pull: the payer's transfer has to land before the payment note can be swept.
    let paymentHash: Hex | null = v.payload.type === "hash" ? v.payload.hash : null;
    if (v.mode === "pull" && !(await chain.isCommitmentSeen(v.note.commitment))) {
      let ok = false;
      try {
        paymentHash = await config.submit(payerTransferIntent(md.chainId, md.pool, v.transfer));
        ok = (await chain.waitForReceipt(paymentHash)).status === "success";
      } catch {
        ok = false;
      }
      if (!ok && !(await chain.isCommitmentSeen(v.note.commitment).catch(() => false))) {
        throw fail("The payer's transfer did not go through (its note may have been spent elsewhere). Nothing was paid.");
      }
    }

    const x402Payload: GloamPaymentPayload = {
      x402Version: GLOAM_X402_VERSION,
      scheme: GLOAM_X402_SCHEME,
      network: md.chainId,
      payload: {
        paymentNote: v.payload.ticket,
        txHash: paymentHash,
        exec: {
          poolAddress: md.pool,
          fn: "transfer",
          valueWei: 0n,
          args: [v.transfer.proof ?? "0x", v.transfer.root ?? "0x", v.transfer.nullifier, v.transfer.newCommitments],
        },
      },
    };
    const result = await settleGloamPayment({
      requirements: toPaymentRequirements(v.request, v.realm),
      payload: x402Payload,
      receiveKey: config.receiveKey,
      prove: config.prove,
      chain,
      submit: config.submit,
      beforeSubmit: async (fresh, intent) => {
        // Remember the sweep before it goes out, so a lost receipt cannot cost the payer its access.
        await replay.put(key, { state: "sent", at: clock(), freshCommitment: fresh.commitment, sweepHash: null });
        await markChallenge("sent");
        sent = true;
        await config.beforeSubmit?.(fresh, intent);
      },
    });

    if (result.grantAccess && result.sweep?.hash) {
      const receipt = receiptOf(v, result.sweep.hash, clock());
      await replay.put(key, {
        state: "settled",
        at: clock(),
        freshCommitment: result.freshNote?.commitment,
        sweepHash: result.sweep.hash,
        receipt,
      });
      await markChallenge("settled");
      return receipt;
    }
    if (result.status === "unconfirmed") {
      await replay.put(key, {
        state: "sent",
        at: clock(),
        freshCommitment: result.freshNote?.commitment,
        sweepHash: result.sweep?.hash ?? null,
      });
      throw fail(`${result.reason ?? "The sweep has not confirmed."} Retry shortly with the same credential.`, true);
    }
    await replay.delete(key);
    await releaseChallenge();
    throw fail(result.reason ?? "The payment could not be settled.");
  } catch (e) {
    // Keep a sent record (money may be moving); drop a bare claim unless the failure is worth retrying.
    const drop = !sent && (!(e instanceof GloamChargeError) || !e.retryable);
    if (drop) {
      await replay.delete(key).catch(() => undefined);
      await releaseChallenge().catch(() => undefined);
    }
    throw e;
  }
}
