"use client";

/**
 * Running a private swap from the browser (lib/vaultSwap has the router and
 * quotes). A swap spends one whole note, so part of a note is first set aside
 * in its own note (lib/cashOutSplit, the same as a partial cash out). Then:
 *
 *   1. make a refund note in the note's own asset, price the swap again (a
 *      quote seen a minute ago may now give less than the market does; the
 *      better of the two is used, lib/vaultSwap replanVaultSwap), then make
 *      the new note for exactly the planned amount, and prove both shields;
 *   2. work out this swap's escrow (derived from the note spent, both new notes
 *      and the route), check it against the router's escrowFor, and prove the
 *      note's unshield to it, so nobody can change what lands;
 *   3. save both new notes before anything is sent, out of the balance until
 *      one lands (sweepPending, named after the note they come from: the sync
 *      that counts one retires that note and the other, lib/claimSweep);
 *   4. hand the proofs to the Gloam relay. The wallet never submits a swap:
 *      that would put it next to the swap on the explorer.
 *
 * The new notes are dropped only when the swap surely never went out (the
 * relay refused it before sending). A send that may have gone out keeps them,
 * and the next sync settles them either way. So does one that landed and
 * reverted, but its unshield proof stays valid until the note is spent, so that
 * note is marked (swapProofAt) and the sync moves it to a fresh note as soon as
 * the relay takes it (lib/claimSweep moveRevertedNotes). A swap with no saved
 * hash that shows nothing for an hour goes the same way (SWAP_UNSEEN_MS).
 */
import { keccak256, type Address, type Hex } from "viem";
import { buildPoseidonUnshieldWitness } from "./proverPoseidon";
import { fieldToBytes32, proveShieldInBrowser, proveUnshieldInBrowser } from "./proveClient";
import { noteNullifierPoseidon } from "./notePoseidon";
import { fieldToHex, hexToField } from "./poseidon";
import type { PoseidonMerklePath } from "./merklePoseidon";
import { prepareBridgeNote } from "./bridgePrivate";
import { freshPath, networkOfNote, spendPlanFor, spendWaitMessage, splitForCashOut } from "./cashOutSplit";
import { relayVaultSwap, RelaySubmitError, waitForTx } from "./relay/client";
import { publicClientFor } from "./rhClient";
import { assertNoteOnNetwork, dropUnsentNote, saveLocalNote, shieldPoolAbi, updateLocalNote, type LocalNote } from "./shield";
import type { GloamNetwork } from "./networks";
import {
  encodeRoute,
  escrowAddress,
  refundAmountFor,
  replanVaultSwap,
  vaultSwapAbi,
  type EscrowKey,
  type SwapPlan,
  type VaultSwapRefundInfo,
} from "./vaultSwap";

/** Relay codes after which the swap may still have gone out. */
const MAYBE_SENT = new Set(["maybe_sent", "rpc", "network", "error", "internal", "in_flight"]);

export const SWAP_MAYBE_SENT =
  "The swap may have gone out. Your money is safe in the vault: refresh in a minute to see where it landed.";

export const SWAP_REVERTED =
  "The swap didn't go through on this try. Your money is safe in the vault. It moves to a fresh private balance in about 3 minutes: keep Gloam open, or it finishes next time you open the app. Then get a new quote.";

export const SWAP_SPENT =
  "This try didn't go through, but another copy of the swap already spent this balance. Refresh in a minute to see where your money landed.";

export const SWAP_REFUNDED =
  "The swap couldn't finish, so the money went back to your private balance, less up to 1%: the vault's cash-out fee, plus a safety margin that goes to the Gloam treasury.";

export type SwapResult = { hash: Hex; outNote: LocalNote; refunded: boolean };

/** What sendVaultSwap calls: the app's own below, a test's own in scripts/. */
export type SwapSender = {
  relay: typeof relayVaultSwap;
  /** How the transaction ended. Throws when that can't be told yet (a slow network). */
  wait: (hash: Hex) => Promise<"success" | "reverted">;
  isSpent: (nullifier: Hex) => Promise<boolean>;
};

/**
 * Hands a swap to the relay and follows it to the chain. Returns its hash once
 * it landed without reverting; throws in plain words otherwise. `spentId` is the
 * note the swap spends, and `outId` and `refund` the two saved for it.
 */
export async function sendVaultSwap(
  call: Parameters<typeof relayVaultSwap>[0],
  notes: { spentId: string; outId: string; refund: LocalNote },
  send: SwapSender,
  onSent?: () => void
): Promise<Hex> {
  let hash: Hex;
  try {
    hash = await send.relay(call);
  } catch (e) {
    if (e instanceof RelaySubmitError && MAYBE_SENT.has(e.code)) throw new Error(SWAP_MAYBE_SENT);
    dropUnsentNote(notes.outId);
    dropUnsentNote(notes.refund.id);
    throw e;
  }
  // Kept in case this tab never hears how it ended (it closes, the wait gives
  // up): a sync reads the receipt. The swap is out, so a failed save stops nothing.
  const sent = { hash, at: Date.now() };
  await updateLocalNote(notes.refund.id, { vaultSwap: { ...notes.refund.vaultSwap!, sent } }).catch(() => {});

  onSent?.();
  let outcome: "success" | "reverted";
  try {
    outcome = await send.wait(hash);
  } catch {
    // A slow network: it may still land, and the next sync settles it.
    throw new Error(SWAP_MAYBE_SENT);
  }
  if (outcome === "reverted") {
    // Not proof that nothing moved: a copy or a resend of this call may have
    // landed first. Both notes stay saved, out of the balance; the sync settles them.
    if ((await send.isSpent(call.spend.nullifier).catch(() => null)) === true) throw new Error(SWAP_SPENT);
    // Its unshield proof (to this swap's escrow) is public now and stays valid
    // until the note is spent: on disk before anyone hears of it, so a closed
    // tab still moves the note on the next load.
    await updateLocalNote(notes.spentId, { swapProofAt: sent.at }).catch(() => {});
    throw new Error(SWAP_REVERTED);
  }
  return hash;
}

export async function runVaultSwap(args: {
  network: GloamNetwork;
  router: Address;
  note: LocalNote;
  /** How much of the note to swap; below its value, the rest stays a note of its own. */
  amount: bigint;
  assetOut: Address;
  /** The quote the person saw. Priced again before proving; the better plan is sent. */
  plan: SwapPlan;
  /** The vault's cash-out fee the quote was made with. */
  feeBps: number;
  owner: Address;
  /** The note's tree path, read fresh. */
  pathFor: (note: LocalNote) => Promise<PoseidonMerklePath | null>;
  onStatus: (s: string) => void;
}): Promise<SwapResult> {
  const { network, note, amount, router } = args;
  if (!network.pool) throw new Error("This network has no vault yet.");
  assertNoteOnNetwork(note, network);
  const moving = spendWaitMessage(note);
  if (moving) throw new Error(moving);
  // every read of this swap, before and after the send, goes to its own network's chain
  const client = publicClientFor(network);
  const noteWei = BigInt(note.amountWei);
  if (amount <= 0n || amount > noteWei) throw new Error("Pick an amount up to this balance.");

  // The note to spend: the whole one, or the part set aside. A note that backed a proof
  // of funds moves whole to a fresh note first, so the proof can't point at this swap, and
  // so does one whose last swap reverted, so that swap's proof can't be used.
  let target = note;
  const spendPlan = spendPlanFor(note, amount);
  if (spendPlan !== "direct") {
    const start = await args.pathFor(note);
    if (!start) throw new Error("Could not read your private balance. Refresh and try again.");
    target = await splitForCashOut({
      note,
      amount,
      path: start,
      owner: args.owner,
      // the split goes through the relay too: a swap never shows the wallet
      relayOn: true,
      allowWhole: spendPlan === "move",
      sendWithWallet: () => Promise.reject(new Error("Swaps go through the Gloam relay.")),
      onStatus: args.onStatus,
    });
  }
  const targetWei = BigInt(target.amountWei);

  // 1. The refund note first (it doesn't depend on the price), then the price
  //    again, as close to sending as the proofs allow: the new note and the
  //    escrow below are bound to amountOut.
  args.onStatus("Proving privately, this takes 10 to 30 seconds…");
  const back = await prepareBridgeNote(refundAmountFor(targetWei), target.asset, network, args.owner);
  if (args.plan.router.toLowerCase() !== router.toLowerCase()) {
    throw new Error("This quote was for another swap router. Get a new quote and try again.");
  }
  const plan = await replanVaultSwap(
    client,
    network.chainId,
    { assetIn: target.asset, assetOut: args.assetOut, amountIn: targetWei, feeBps: args.feeBps, router },
    args.plan
  );
  const out = await prepareBridgeNote(plan.amountOut, args.assetOut, network, args.owner);

  // 2. The escrow the unshield must name: worked out here, and checked against
  //    the router's own answer, so a wrong RPC can't send the note elsewhere.
  const nullifier =
    target.nullifier && target.nullifier !== "0x"
      ? target.nullifier
      : (fieldToHex(await noteNullifierPoseidon(hexToField(target.secret), hexToField(target.commitment))) as Hex);
  const routeBytes = encodeRoute(plan.route);
  const key: EscrowKey = {
    nullifier,
    amountIn: targetWei,
    outCommitment: out.note.commitment,
    assetOut: args.assetOut,
    amountOut: plan.amountOut,
    refundCommitment: back.note.commitment,
    refundAmount: BigInt(back.note.amountWei),
    routeHash: keccak256(routeBytes),
  };
  const escrow = escrowAddress(router, target.asset, key);
  const routerSays = await client.readContract({
    address: router,
    abi: vaultSwapAbi,
    functionName: "escrowFor",
    args: [target.asset, key],
  });
  if (routerSays.toLowerCase() !== escrow.toLowerCase()) {
    throw new Error("This swap's address didn't check out, so nothing was sent. Refresh and try again.");
  }
  const path = await args.pathFor(target);
  if (!path) throw new Error("Could not read your private balance. Refresh and try again.");
  const w = await buildPoseidonUnshieldWitness({
    secretHex: target.secret,
    amount: targetWei,
    asset: target.asset,
    to: escrow,
    path,
  });
  if (!w.checks.commitmentMatches) throw new Error(w.blocker ?? "This balance does not match the vault.");
  if (fieldToBytes32(w.publicInputs.nullifier).toLowerCase() !== nullifier.toLowerCase()) {
    throw new Error("This balance does not match the vault.");
  }
  const { proofBytes } = await proveUnshieldInBrowser(w.circomInput);

  // 3. Both saved before anything is sent. The refund note keeps what finishing
  //    a refund needs (finishVaultSwapRefund), in case it is ever wanted.
  const now = Date.now();
  const refundInfo: VaultSwapRefundInfo = {
    router,
    assetIn: target.asset,
    amountIn: targetWei.toString(),
    out: { commitment: out.note.commitment, asset: args.assetOut, amount: plan.amountOut.toString() },
    route: plan.route,
  };
  const outNote: LocalNote = { ...out.note, id: `sw-${now}`, sweptFrom: { id: target.id, nullifier }, sweepPending: true };
  const refundNote: LocalNote = {
    ...back.note,
    id: `swr-${now}`,
    sweptFrom: { id: target.id, nullifier },
    sweepPending: true,
    vaultSwap: refundInfo,
  };
  // on disk and read back before the swap is sent, or nothing is sent
  await saveLocalNote(outNote);
  await saveLocalNote(refundNote);

  // 4. Through the relay only.
  args.onStatus("Swapping through the Gloam relay…");
  const hash = await sendVaultSwap(
    {
      chainId: network.chainId,
      router,
      spend: { proof: proofBytes, root: fieldToBytes32(w.publicInputs.root), nullifier, asset: target.asset, amount: targetWei },
      deposit: { proof: out.proof, commitment: outNote.commitment, asset: args.assetOut, amount: plan.amountOut },
      refund: { proof: back.proof, commitment: refundNote.commitment, asset: target.asset, amount: BigInt(refundNote.amountWei) },
      route: plan.route,
    },
    { spentId: target.id, outId: outNote.id, refund: refundNote },
    {
      relay: relayVaultSwap,
      wait: (h) => waitForTx(h, undefined, client),
      isSpent: (n) => client.readContract({ address: network.pool!, abi: shieldPoolAbi, functionName: "isSpent", args: [n] }),
    },
    () => args.onStatus("Waiting for the swap to land…")
  );

  // Landed: the new note, or (if someone sent the unshield on its own first)
  // the refund note. Which one is read from the vault; if that read fails both
  // stay pending and the next sync settles them, so no money is ever hidden.
  const seen = (c: Hex) =>
    client.readContract({ address: network.pool!, abi: shieldPoolAbi, functionName: "commitmentSeen", args: [c] });
  const [outSeen, refundSeen] = await Promise.all([seen(outNote.commitment), seen(refundNote.commitment)]).catch(
    () => [false, false] as const
  );
  if (!outSeen && !refundSeen) throw new Error("The swap went out. Refresh in a minute to see it in your balance.");
  const refunded = !outSeen;
  const landed = refunded ? refundNote : outNote;
  const unused = refunded ? outNote : refundNote;
  const at = await freshPath(landed.commitment, network);
  updateLocalNote(target.id, { status: "recovered", txHash: hash });
  updateLocalNote(unused.id, { status: "recovered", sweepPending: false });
  updateLocalNote(landed.id, { status: "open", sweepPending: false, txHash: hash, ...(at ? { leafIndex: at.leafIndex } : {}) });
  return {
    hash,
    refunded,
    outNote: { ...landed, txHash: hash, sweepPending: false, ...(at ? { leafIndex: at.leafIndex } : {}) },
  };
}

/** Proof bytes and a root the router never reads on the refund path (64 zero bytes, a zero root). */
const UNUSED_PROOF = `0x${"00".repeat(64)}` as Hex;
const UNUSED_ROOT = `0x${"00".repeat(32)}` as Hex;
const RETRY_MS = 60_000;
/** A vault that refused the refund is asked less often: each try is a proof, and its limit can stay closed for days. */
const BLOCKED_RETRY_MS = 10 * 60_000;
const lastTry = new Map<string, number>();

/**
 * Puts a swap's waiting money back as its refund note: the case where someone
 * sent the swapped note's unshield on its own, so the money sits at the swap's
 * escrow (lib/claimSweep finds it and calls this). Proves the refund note's
 * shield again from its saved secret and sends the same swap call through the
 * relay; the router sees the note spent and makes the refund. At most one try
 * a minute per note; the next sync counts the note once it lands. True when one
 * was sent. A refund the vault refuses (a closed limit) throws the relay's
 * refusal, and the note stays pending for the next sync (lib/claimSweep).
 */
export async function finishVaultSwapRefund(note: LocalNote): Promise<boolean> {
  const info = note.vaultSwap;
  const from = note.sweptFrom;
  if (!info || !from || !note.sweepPending) return false;
  const last = lastTry.get(note.id);
  if (last !== undefined && Date.now() - last < (note.refundHeld === "blocked" ? BLOCKED_RETRY_MS : RETRY_MS)) return false;
  lastTry.set(note.id, Date.now());

  const { proofBytes } = await proveShieldInBrowser({
    commitment: BigInt(note.commitment).toString(),
    amount: note.amountWei,
    asset: BigInt(note.asset).toString(),
    secret: BigInt(note.secret).toString(),
  });
  const hash = await relayVaultSwap({
    chainId: note.chainId,
    // the router this swap went through, which may not be the one new swaps use now
    router: info.router,
    spend: { proof: UNUSED_PROOF, root: UNUSED_ROOT, nullifier: from.nullifier, asset: info.assetIn, amount: BigInt(info.amountIn) },
    deposit: { proof: UNUSED_PROOF, commitment: info.out.commitment, asset: info.out.asset, amount: BigInt(info.out.amount) },
    refund: { proof: proofBytes, commitment: note.commitment, asset: note.asset, amount: BigInt(note.amountWei) },
    route: info.route,
  });
  // the receipt is read on the note's own chain, whatever the page shows by now
  const net = networkOfNote(note);
  await waitForTx(hash, undefined, net ? publicClientFor(net) : undefined).catch(() => null);
  return true;
}
