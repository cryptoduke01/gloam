/**
 * Securing a claimed payment: the payee side of a person-to-person payment.
 *
 * A Gloam payment is a note: commitment = Poseidon(secret, amount, asset),
 * spent by revealing nullifier = Poseidon(secret, commitment). The payer picks
 * the secret, so the payer can spend the note too. Claiming a payment (a
 * gloam2t payment to a Gloam address, a gloam1 / gloam1e claim link, a payroll
 * payout) only saves it in this browser, and until the payee moves it the
 * payer could take it back.
 *
 * Securing moves it: a private transfer of the whole amount into a fresh note
 * whose secret only this browser knows (with a zero change note). Once that
 * lands, the claimed note's nullifier is spent by the payee and the money is
 * theirs alone. If the payer spends it first, the move cannot land and the
 * claim is dropped.
 *
 * The move is the SDK's sweep (packages/sdk/src/sweep.ts), the same one x402
 * and MPP payees settle with. This file supplies the app's side: the browser
 * prover, the vault reads, the relay or the wallet to send through, and the
 * local bookkeeping. The fresh note is saved before anything is sent and is
 * left out of the balance until it lands; it is never dropped, because a send
 * that looked failed can still land. reconcileClaims settles it from what the
 * chain shows.
 */
import {
  sweepReceivedNote,
  transferCallArgs,
  type PoseidonMerklePath,
  type Prover,
  type SweepChain,
  type SweepResult,
} from "@gloamtrade/sdk";
import type { Address, Hex, PublicClient } from "viem";
import { NETWORK_KEYS, getActiveNetwork, getNetwork, type GloamNetwork } from "./networks";
import { noteNullifierPoseidon } from "./notePoseidon";
import { fieldToHex, hexToField } from "./poseidon";
import { proveTransferInBrowser } from "./proveClient";
import { relayTransfer, waitForTx } from "./relay/client";
import { publicClientFor } from "./rhClient";
import { dataKeyLocked, getAllNotes, unlockNoteVault } from "./noteVault";
import { isNativeAsset, saveLocalNote, shieldPoolAbi, updateLocalNote, type BackupSeenCheck, type BackupSpentCheck, type LocalNote } from "./shield";
import { syncShieldTree } from "./treeSync";
import { escrowHolds } from "./vaultSwap";
import { supportsNativeShield } from "./tokens";

/** Claimed payments are saved under this id prefix (MoveView). */
export const CLAIM_PREFIX = "imp-";
/** Fresh notes from securing a claim. */
const SECURED_PREFIX = "swp-";

export function claimNoteId(): string {
  return `${CLAIM_PREFIX}${Date.now()}`;
}

/** A payment someone else made that this browser claimed. */
export function isClaimedNote(n: LocalNote): boolean {
  return n.id.startsWith(CLAIM_PREFIX);
}

/** Claimed, still spendable, and not yet moved: the payer can still spend it. */
export function isUnsecuredClaim(n: LocalNote): boolean {
  return (
    isClaimedNote(n) &&
    !n.secured &&
    n.status !== "recovered" &&
    Boolean(n.secret) &&
    n.secret !== "0x"
  );
}

/** The fresh note a claim was secured into (a cash-out split also names the note it came from). */
export function isSecuredClaim(n: LocalNote): boolean {
  return Boolean(n.sweptFrom?.id.startsWith(CLAIM_PREFIX));
}

type Transfer = { chainId: number; proof: Hex; root: Hex; nullifier: Hex; commitments: readonly [Hex, Hex] };

/** What securing reads and calls: the app's own below, a test's own in scripts/. */
export type ClaimEnv = {
  /** The active network's vault. */
  chainId: number;
  pool: Address | null;
  chain: SweepChain;
  prove: Prover;
  relay: (t: Transfer) => Promise<Hex>;
  /** Where a commitment sits in the vault tree, once it is there. */
  leafIndexOf: (commitment: Hex) => Promise<number | undefined>;
  /**
   * A spend and a commitment read at one block, so two answers from nodes a
   * block apart can't call a move that landed dead. Null fields: unread.
   */
  stateAt?: (
    nullifier: Hex | null,
    commitment: Hex
  ) => Promise<{ spent: boolean | null; seen: boolean | null; block?: bigint | null }>;
  /**
   * A private swap's refund note: does its money wait at the swap's escrow, at
   * `block` (the block stateAt read)? Null: unread.
   */
  escrowWaiting?: (n: LocalNote, block: bigint) => Promise<boolean | null>;
  /** Puts a swap's waiting money back as its refund note (lib/vaultSwapRun). */
  finishRefund?: (n: LocalNote) => Promise<void>;
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function readBool(client: PublicClient, pool: Address, fn: "isSpent" | "commitmentSeen", arg: Hex, blockNumber?: bigint): Promise<boolean> {
  return client.readContract({
    address: pool,
    abi: shieldPoolAbi,
    functionName: fn,
    args: [arg],
    ...(blockNumber !== undefined ? { blockNumber } : {}),
  }) as Promise<boolean>;
}

/** Both reads at one block. A node without that block yet fails the read, which counts as unread. */
async function readStateAt(client: PublicClient, pool: Address, nullifier: Hex | null, commitment: Hex) {
  const block = await client.getBlockNumber().catch(() => null);
  if (block === null) return { spent: null, seen: null, block: null };
  const [spent, seen] = await Promise.all([
    nullifier ? readBool(client, pool, "isSpent", nullifier, block).catch(() => null) : Promise.resolve(null),
    readBool(client, pool, "commitmentSeen", commitment, block).catch(() => null),
  ]);
  return { spent, seen, block };
}

/** The vault tree, waiting a little for a commitment that only just landed. */
async function findLeaf(client: PublicClient, net: GloamNetwork, commitment: Hex) {
  for (let i = 0; i < 4; i++) {
    const tree = await syncShieldTree(client, net).catch(() => null);
    const idx = tree?.indexByCommitment.get(commitment.toLowerCase());
    if (tree && idx != null) return { tree, idx };
    if (i < 3) await sleep(1_250);
  }
  return null;
}

/** The app's vault on the active network, read over its own RPC. */
export function appClaimEnv(onStage?: (text: string) => void): ClaimEnv {
  // One network for the whole claim: every read goes to its chain, even if the
  // page switches halfway (the vaults share one address, so a read on another
  // chain would answer for this one without failing).
  const net = getActiveNetwork();
  const pool = net.pool;
  const client = publicClientFor(net);
  return {
    chainId: net.chainId,
    pool,
    chain: {
      isSpent: (nullifier) => readBool(client, pool!, "isSpent", nullifier),
      isCommitmentSeen: (commitment) => readBool(client, pool!, "commitmentSeen", commitment),
      pathForCommitment: async (commitment) => {
        const found = await findLeaf(client, net, commitment);
        return found ? ((await found.tree.pathForLeaf(found.idx)) as PoseidonMerklePath | null) : null;
      },
      waitForReceipt: async (hash) => {
        onStage?.("Waiting for it to land…");
        return { status: await waitForTx(hash, undefined, client) };
      },
    },
    prove: async (input) => {
      const { proofBytes, publicSignals } = await proveTransferInBrowser(input);
      return { proofBytes, publicSignals };
    },
    relay: relayTransfer,
    leafIndexOf: async (commitment) => (await findLeaf(client, net, commitment))?.idx,
    stateAt: (nullifier, commitment) => readStateAt(client, pool!, nullifier, commitment),
    escrowWaiting: async (n, block) => {
      if (!n.vaultSwap || !n.sweptFrom) return false;
      return escrowHolds(client, n.vaultSwap, n.sweptFrom.nullifier, n.commitment, BigInt(n.amountWei), block).catch(
        () => null
      );
    },
    finishRefund: async (n) => {
      const { finishVaultSwapRefund } = await import("./vaultSwapRun");
      await finishVaultSwapRefund(n);
    },
  };
}

/** The claimed note's nullifier, from the note or worked out from its secret. */
async function nullifierOf(n: LocalNote): Promise<Hex> {
  if (n.nullifier && n.nullifier !== "0x") return n.nullifier;
  return fieldToHex(await noteNullifierPoseidon(hexToField(n.secret), hexToField(n.commitment)));
}

/** The move landed: count the fresh note and retire the claimed one. */
async function finalize(env: ClaimEnv, fresh: LocalNote, txHash: Hex | null) {
  const leafIndex = await env.leafIndexOf(fresh.commitment);
  // on disk before this returns: a restore or another tab that reads the store next must see the move
  await updateLocalNote(fresh.id, {
    // counted again even if an earlier sync gave it up (a refund that landed late)
    status: "open",
    sweepPending: false,
    ...(leafIndex != null ? { leafIndex } : {}),
    ...(txHash ? { txHash } : {}),
  });
  if (fresh.sweptFrom) await updateLocalNote(fresh.sweptFrom.id, { status: "recovered", secured: true });
}

/**
 * One pending fresh note, from what the chain shows. Seen in the vault: it is
 * counted and its claimed note retired. Not seen while the claimed note is
 * spent: it can never land, so it leaves the balance for good (kept as
 * history). Otherwise it stays pending. The app reads both at one block
 * (stateAt), so answers from two nodes a block apart can't call a move that
 * landed dead.
 *
 * One exception: a private swap's refund note (`vaultSwap`) whose note was
 * spent by an unshield sent on its own. The money then waits at the swap's
 * escrow and lands as this note once the refund is finished, so while the
 * escrow holds it (or can't be read) the note is "refund" or pending, never dead.
 */
async function settlePending(env: ClaimEnv, fresh: LocalNote): Promise<"landed" | "dead" | "pending" | "refund"> {
  const { spent, seen, block } = env.stateAt
    ? await env.stateAt(fresh.sweptFrom?.nullifier ?? null, fresh.commitment)
    : {
        spent: fresh.sweptFrom ? await env.chain.isSpent(fresh.sweptFrom.nullifier).catch(() => null) : null,
        seen: await env.chain.isCommitmentSeen(fresh.commitment).catch(() => null),
        block: null,
      };
  if (seen === true) {
    await finalize(env, fresh, null);
    return "landed";
  }
  if (seen === false && spent === true) {
    if (fresh.vaultSwap) {
      // The escrow is read at the same block, or a refund landing in between
      // would read as "spent, not seen, escrow empty" and be given up.
      if (block == null) return "pending";
      const waiting = env.escrowWaiting ? await env.escrowWaiting(fresh, block).catch(() => null) : null;
      if (waiting === true) return "refund";
      if (waiting === null) return "pending";
    }
    updateLocalNote(fresh.id, { status: "recovered", sweepPending: false });
    return "dead";
  }
  return "pending";
}

/** Earlier moves of this claim that may have landed since. Returns the one that did. */
async function settleEarlier(env: ClaimEnv, claimId: string): Promise<LocalNote | null> {
  const earlier = getAllNotes().filter(
    (n) => n.sweepPending && n.status !== "recovered" && n.sweptFrom?.id === claimId
  );
  for (const fresh of earlier) {
    if ((await settlePending(env, fresh)) === "landed") return fresh;
  }
  return null;
}

function securedResult(fresh: LocalNote, hash: Hex | null): SweepResult {
  const { secret, commitment, nullifier, amountWei, asset } = fresh;
  return {
    ok: true,
    final: true,
    status: "swept",
    reason: null,
    hash,
    freshNote: { secret, commitment, nullifier: nullifier ?? "0x", amountWei, asset },
    amountWei,
    asset,
  };
}

export type SecureParams = {
  /** The claimed note (an unsecured `imp-` note on the active network). */
  note: LocalNote;
  /** Send through the Gloam relay, so the wallet never shows and needs no gas. */
  relay: boolean;
  /** Sends pool.transfer(...args) from the wallet when the relay is off. Returns the hash. */
  sendWithWallet: (call: { pool: Address; args: readonly [Hex, Hex, Hex, readonly [Hex, Hex]] }) => Promise<Hex>;
  /** Progress, in plain words. */
  onStage?: (text: string) => void;
};

/**
 * Move a claimed note into a fresh note only this browser knows. `final` is
 * true once the move has landed. Statuses (SDK SweepStatus):
 *  - swept: secured; the fresh note is in the balance.
 *  - already_spent: someone spent it first (the payer); the claim is dropped.
 *  - not_settled: the payment is not in the vault yet; try again later.
 *  - failed / unconfirmed: still the claimed note; secure it again later.
 *  - bad_note: the amount does not match the note's record in the vault.
 */
export async function secureClaim(
  p: SecureParams,
  env: ClaimEnv = appClaimEnv(p.onStage)
): Promise<SweepResult> {
  const { note } = p;
  const pool = env.pool;
  if (!pool || note.chainId !== env.chainId || note.pool.toLowerCase() !== pool.toLowerCase()) {
    throw new Error("Switch to the network this payment is on to secure it.");
  }
  const nullifier = await nullifierOf(note);
  // A move sent before (a lost reply, a closed tab) may have landed already.
  const landed = await settleEarlier(env, note.id);
  if (landed) return securedResult(landed, null);
  let fresh: LocalNote | null = null;

  p.onStage?.("Proving privately…");
  const result = await sweepReceivedNote({
    note: {
      secret: note.secret,
      commitment: note.commitment,
      nullifier,
      amountWei: note.amountWei,
      asset: note.asset,
    },
    poolAddress: pool,
    chainId: note.chainId,
    prove: env.prove,
    chain: env.chain,
    // Saved before anything is sent: if this tab closes, this is the only copy.
    beforeSubmit: async (out) => {
      fresh = {
        id: `${SECURED_PREFIX}${Date.now()}`,
        chainId: note.chainId,
        pool,
        asset: out.asset,
        amountWei: out.amountWei,
        commitment: out.commitment,
        secret: out.secret,
        nullifier: out.nullifier,
        bound: true,
        scheme: "poseidon",
        from: note.from,
        createdAt: Date.now(),
        status: "open",
        source: "local",
        sweptFrom: { id: note.id, nullifier },
        sweepPending: true,
        // The payer's note stays with the money.
        ...(note.note ? { note: note.note } : {}),
      };
      // on disk and read back before the move is sent, or nothing is sent
      await saveLocalNote(fresh);
    },
    submit: (intent) => {
      const args = transferCallArgs(intent);
      if (p.relay) {
        p.onStage?.("Securing it through the Gloam relay…");
        return env.relay({
          chainId: note.chainId,
          proof: args[0],
          root: args[1],
          nullifier: args[2],
          commitments: args[3],
        });
      }
      p.onStage?.("Confirm in your wallet to secure it…");
      return p.sendWithWallet({ pool, args });
    },
  });

  const out = fresh as LocalNote | null;
  if (result.status === "swept" && out) {
    await finalize(env, out, result.hash);
  } else if (result.status === "not_settled") {
    // not in the vault: out of the balance until it is (reconcileUnfunded)
    updateLocalNote(note.id, { unfunded: true });
  } else if (result.status === "already_spent") {
    updateLocalNote(note.id, { status: "recovered" });
    // Spent by someone else, unless one of our own moves landed: ask the chain.
    const ours = await settleEarlier(env, note.id);
    if (ours) return securedResult(ours, ours.id === out?.id ? result.hash : null);
  }
  // failed / unconfirmed: the fresh note stays pending until the chain says
  // what happened (reconcileClaims). A relay that lost its reply may still
  // have sent it.
  return result;
}

/**
 * Does the vault hold this payment yet? A claim it doesn't is saved as
 * `unfunded`: kept, out of the balance until it lands. A read that fails
 * counts as not yet; the next sync asks again.
 */
export async function claimFunded(commitment: Hex, env: ClaimEnv = appClaimEnv()): Promise<boolean> {
  return (await env.chain.isCommitmentSeen(commitment).catch(() => false)) === true;
}

/**
 * For a backup restore (shield importNotesBackup): is this note spent in the
 * vault? Null when it can't tell: another network or vault, a legacy note
 * without its nullifier, or a read that fails.
 */
export function backupSpentCheck(env: ClaimEnv = appClaimEnv()): BackupSpentCheck {
  return async (n) => {
    const pool = env.pool;
    if (!pool || n.chainId !== env.chainId || n.pool.toLowerCase() !== pool.toLowerCase()) return null;
    if (n.scheme === "keccak" && (!n.nullifier || n.nullifier === "0x")) return null;
    const nullifier = await nullifierOf(n).catch(() => null);
    if (!nullifier) return null;
    return env.chain.isSpent(nullifier).catch(() => null);
  };
}

/**
 * For a backup restore (shield importNotesBackup): does the vault hold this
 * note's commitment? Null when it can't tell: another network or vault, or a
 * read that fails (the note then goes in as before, for the sync to settle).
 */
export function backupSeenCheck(env: ClaimEnv = appClaimEnv()): BackupSeenCheck {
  return async (n) => {
    const pool = env.pool;
    if (!pool || n.chainId !== env.chainId || n.pool.toLowerCase() !== pool.toLowerCase()) return null;
    return env.chain.isCommitmentSeen(n.commitment).catch(() => null);
  };
}

/**
 * Notes the vault had not shown, claimed payments and restored ones: count
 * each one it shows now. A claim saved before this check (no leaf on record,
 * never checked) is checked once too. Returns true when something changed.
 */
export async function reconcileUnfunded(env?: ClaimEnv): Promise<boolean> {
  if (typeof window === "undefined") return false;
  const unchecked = getAllNotes().filter(
    (n) =>
      n.status !== "recovered" &&
      (n.unfunded === true || (isClaimedNote(n) && n.unfunded === undefined && n.leafIndex == null))
  );
  if (!unchecked.length) return false;
  const e = env ?? appClaimEnv();
  const pool = e.pool;
  if (!pool) return false;
  let changed = false;
  for (const n of unchecked) {
    if (n.chainId !== e.chainId || n.pool.toLowerCase() !== pool.toLowerCase()) continue;
    const seen = await e.chain.isCommitmentSeen(n.commitment).catch(() => null);
    if (seen === null || n.unfunded === !seen) continue;
    updateLocalNote(n.id, { unfunded: !seen });
    changed = true;
  }
  return changed;
}

const GHOST_REPAIR_KEY = "gloam.repair.ghostEth.v1";

/**
 * One pass per vault, once: reopen ETH notes an older sync marked spent by
 * mistake. A sync begun on Robinhood Chain or Tempo mainnet (no ETH there, so
 * its ETH inventory read 0) could finish after a switch and mark the new
 * network's ETH notes spent. Only a note the vault still holds is reopened:
 * its nullifier is unspent and the vault has seen its commitment. A payment
 * this browser made for someone else (pay-), a secured claim and anything not
 * on a payments vault that lists ETH are never touched. A pass where a read
 * fails is tried again on the next sync.
 */
export async function reopenGhostEthNotes(env?: ClaimEnv): Promise<boolean> {
  if (typeof window === "undefined") return false;
  // A vault behind its passkey (or not read from disk yet) shows no notes: not the same as none to repair.
  if (dataKeyLocked()) return false;
  await unlockNoteVault();
  const e = env ?? appClaimEnv();
  const pool = e.pool;
  if (!pool) return false;
  const net = NETWORK_KEYS.map(getNetwork).find((n) => n.chainId === e.chainId && n.pool?.toLowerCase() === pool.toLowerCase());
  if (!net?.paymentsPool || !supportsNativeShield(net.chainId)) return false;
  const flag = `${GHOST_REPAIR_KEY}:${e.chainId}:${pool.toLowerCase()}`;
  try {
    if (window.localStorage.getItem(flag)) return false;
  } catch {
    /* storage blocked: the pass runs, reads only */
  }
  const candidates = getAllNotes().filter(
    (n) =>
      n.status === "recovered" &&
      n.chainId === e.chainId &&
      n.pool.toLowerCase() === pool.toLowerCase() &&
      isNativeAsset(n.asset) &&
      !n.id.startsWith("pay-") &&
      !n.secured &&
      Boolean(n.secret) &&
      n.secret !== "0x" &&
      n.secret.length > 10
  );
  let changed = false;
  let unread = false;
  const writes: Promise<void>[] = [];
  for (const n of candidates) {
    const nullifier = await nullifierOf(n).catch(() => null);
    if (!nullifier) continue;
    const [spent, seen] = await Promise.all([
      e.chain.isSpent(nullifier).catch(() => null),
      e.chain.isCommitmentSeen(n.commitment).catch(() => null),
    ]);
    if (spent === null || seen === null) {
      unread = true;
      continue;
    }
    if (!spent && seen) {
      writes.push(updateLocalNote(n.id, { status: "open" }));
      changed = true;
    }
  }
  // done only once every reopened note is on disk
  const saved = await Promise.all(writes).then(() => true, () => false);
  if (!unread && saved) {
    try {
      window.localStorage.setItem(flag, String(Date.now()));
    } catch {
      /* next sync reads again; reopening is idempotent */
    }
  }
  return changed;
}

/**
 * A note moved out of a claim that landed here means the claim was secured.
 * Before restores merged, a backup's copy of the claim was written over this
 * browser's: reopened (counted next to the note it was secured into), then
 * retired by the next sync without its secured mark. Marks such claims again,
 * from this browser's own notes. Returns true when one changed.
 */
function remarkSecured(): boolean {
  const landed = new Set(
    getAllNotes()
      .filter((n) => isSecuredClaim(n) && !n.sweepPending && n.status !== "recovered")
      .map((n) => n.sweptFrom!.id)
  );
  const stale = getAllNotes().filter((n) => landed.has(n.id) && (n.status !== "recovered" || !n.secured));
  for (const n of stale) updateLocalNote(n.id, { status: "recovered", secured: true });
  return stale.length > 0;
}

/**
 * Settle secured claims whose move was sent but not confirmed here (a closed
 * tab, a lost reply, another device's backup), and mark claims secured again
 * where a restore unmarked them (remarkSecured). Returns true when something
 * changed.
 */
export async function reconcileClaims(env?: ClaimEnv): Promise<boolean> {
  if (typeof window === "undefined") return false;
  const remarked = remarkSecured();
  const pending = getAllNotes().filter((n) => n.sweepPending && n.status !== "recovered");
  if (!pending.length) return remarked;
  const e = env ?? appClaimEnv();
  const pool = e.pool;
  if (!pool) return remarked;
  let changed = remarked;
  for (const fresh of pending) {
    if (fresh.chainId !== e.chainId || fresh.pool.toLowerCase() !== pool.toLowerCase()) continue;
    const state = await settlePending(e, fresh);
    if (state === "refund") {
      // proving and relaying take a while: the sync doesn't wait, the next one counts it
      void e.finishRefund?.(fresh).catch(() => {});
      continue;
    }
    if (state !== "pending") changed = true;
  }
  return changed;
}
