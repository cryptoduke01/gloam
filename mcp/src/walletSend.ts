/**
 * Sends from the agent's own wallet, and what to make of one that throws.
 *
 * A send that throws before its signed transaction reaches the RPC (gas
 * estimation, signing, a revert in simulation) moved nothing. One that throws
 * after may have landed: the reply was lost (a timeout, a gateway's 504 after
 * the node took it), or the node said it already had it. The caller keeps the
 * notes such a send makes, pending, until a refresh settles them.
 *
 * The signer's transport notes each transaction's hash before the RPC answers
 * (noteBroadcast). The hashes go to the wallet send they belong to, through
 * AsyncLocalStorage, so two sends at once never take each other's hash.
 */
import { AsyncLocalStorage } from "node:async_hooks";
import { TransactionNotFoundError, type Hex } from "viem";
import type { Signer } from "./signer.js";

const inFlight = new AsyncLocalStorage<Hex[]>();

/** Note a transaction handed to the RPC, in the wallet send it belongs to. The signer's transport calls this before the RPC answers. */
export function noteBroadcast(hash: Hex): void {
  inFlight.getStore()?.push(hash);
}

/**
 * A wallet send that threw after its signed transaction went to the RPC, with
 * no answer that proves the node refused it. It may land. `hash` is its own
 * hash, noted before the RPC answered. `maybeSent` is what the SDK's sweep
 * looks for on a submitter's error.
 */
export class WalletSendUnclear extends Error {
  readonly maybeSent = true;
  constructor(
    readonly hash: Hex,
    cause: unknown
  ) {
    super(cause instanceof Error ? cause.message : String(cause), { cause });
    this.name = "WalletSendUnclear";
  }
}

/** Answers that can mean this transaction, or an earlier attempt of it, is already with the node. */
const ALREADY_IN = /already known|known transaction|already imported|already exists|already in (the )?(mem)?pool|nonce too low|nonce has already been used|replacement transaction underpriced|duplicate/i;

/** Answers about the connection, not the transaction. */
const CONNECTION = /time[ds]?[ -]?out|timeout|deadline|upstream|gateway|unavailable|temporar|try again|rate limit|too many requests|connection|socket|econn|fetch failed|network|aborted|reset/i;

/** JSON-RPC codes that say nothing about the transaction: unknown, internal, limit exceeded, timed out, rate limited. */
const UNCLEAR_CODES = new Set([-1, -32603, -32005, -32002, 429]);

/** A node's own refusal of a transaction it then does not keep. */
const REFUSALS = [
  /insufficient funds/i,
  /intrinsic gas too low/i,
  /underpriced/i, // "replacement transaction underpriced" is caught by ALREADY_IN first
  /less than (the )?block base fee|lower than the block base fee|fee cap (is )?(too low|less than)/i,
  /invalid sender|invalid chain ?id|chain ?id mismatch|incorrect chain ?id|wrong chain ?id|only replay-protected/i,
  /exceeds block gas limit|exceeds the block gas limit/i,
  /oversized data|transaction size|too large/i,
];

/**
 * "refused" only when the node itself answered with one of the refusals it
 * does not keep a transaction after; anything else is "unclear".
 */
export function sendRefusal(err: unknown): "refused" | "unclear" {
  let refused = false;
  for (let e: unknown = err, depth = 0; e && depth < 12; e = (e as { cause?: unknown }).cause, depth++) {
    const o = e as { shortMessage?: unknown; message?: unknown; details?: unknown; code?: unknown };
    const text = `${typeof o.shortMessage === "string" ? o.shortMessage : (o.message ?? "")} ${o.details ?? ""}`;
    if (ALREADY_IN.test(text) || CONNECTION.test(text)) return "unclear";
    if (typeof o.code === "number" && UNCLEAR_CODES.has(o.code)) return "unclear";
    if (REFUSALS.some((r) => r.test(text))) refused = true;
  }
  return refused ? "refused" : "unclear";
}

/** How long to wait for a new block before giving up on telling (then the send counts as maybe sent). */
const BLOCK_WAIT_MS = 30_000;
const POLL_MS = 1_000;

/**
 * Whether the node may have the transaction, asked once at least one block
 * after the send: a node behind the one that took it would not know it yet.
 * True when it does, and whenever it cannot be told.
 */
export async function mayHaveIt(client: Signer["publicClient"], hash: Hex, wait = { blockMs: BLOCK_WAIT_MS, pollMs: POLL_MS }): Promise<boolean> {
  if (typeof client.getBlockNumber !== "function" || typeof client.getTransaction !== "function") return true;
  const start = await client.getBlockNumber({ cacheTime: 0 }).catch(() => null);
  if (start === null) return true;
  const deadline = Date.now() + wait.blockMs;
  for (;;) {
    const now = await client.getBlockNumber({ cacheTime: 0 }).catch(() => null);
    if (now !== null && now > start) break;
    if (Date.now() > deadline) return true;
    await new Promise((r) => setTimeout(r, wait.pollMs));
  }
  return client.getTransaction({ hash }).then(
    () => true,
    (e: unknown) => !(e instanceof TransactionNotFoundError)
  );
}

/**
 * Send from the agent's wallet. A throw before the transaction left comes back
 * as it was. A throw once it went to the RPC is a WalletSendUnclear with its
 * hash, unless the node answered with a refusal and, a block later, still does
 * not have it.
 */
export async function walletSend(signer: Signer, send: (wallet: Signer["walletClient"]) => Promise<Hex>): Promise<Hex> {
  const sent: Hex[] = [];
  try {
    return await inFlight.run(sent, () => send(signer.walletClient));
  } catch (err) {
    const hash = sent.at(-1);
    if (!hash) throw err;
    if (sendRefusal(err) === "refused" && !(await mayHaveIt(signer.publicClient, hash))) throw err;
    throw new WalletSendUnclear(hash, err);
  }
}
