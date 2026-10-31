"use client";

/**
 * Prepaid agent top-ups: an owner refills an AI agent's wallet from their
 * private balance on a schedule, with the app closed.
 *
 * Keys and proving live in the browser, so nothing can make a proof on a
 * schedule (a payroll schedule is only a reminder, lib/payrollSchedule). What
 * can run on its own is a proof already made: the relay holds it, with no
 * secret, and sends it on its day (lib/relay/scheduled). So a series is
 * prepaid. The whole total is set aside by splitting it into one note per
 * top-up, one cash out is proven per note to the agent's wallet, and each is
 * handed to the relay for its own day, drawn at random inside that day.
 *
 * That is a private cash out (lib/cashOutPrivately) with up to 12 equal pieces
 * and a day each instead of a window, so nothing here moves money itself, and
 * a stop leaves what a stopped private cash out leaves:
 *  - top-ups already scheduled go out as planned, and each can be cancelled;
 *  - one split off but not scheduled stays in the private balance and shows
 *    (unscheduledPieces), to schedule again or keep;
 *  - the rest of the money stays in the balance as one note, and the slots
 *    never made show as a series to finish;
 *  - a split that may have gone out keeps both its notes out of the balance
 *    until the next sync settles them (lib/claimSweep).
 *
 * The money stays in the vault until each top-up goes out. Each proof stays
 * valid until its note is spent, whatever the relay does with its copy, so a
 * top-up cancelled, refused or given up on moves to a fresh note before it can
 * be spent (shield proofLoose, lib/claimSweep moveRevertedNotes). The mark that
 * says so is on disk before the proof leaves, so a closed tab changes nothing.
 * A note's tag (LocalNote.cashOutPlan.topUp) outlives its job, so a top-up that
 * ended still shows where it went.
 *
 * Not offered on Ethereum mainnet, where gas costs more than the fee brings in
 * (lib/relay/scheduled DATED_OFF_CHAINS): the relay refuses it as well.
 *
 * What it shows: each cash out's amount, the agent's wallet and the time are
 * public, and all of a series land in one wallet, so anyone can add them up.
 * Only where the money came from stays private.
 */
import type { Address } from "viem";
import { moveRevertedNotes, type ClaimEnv } from "./claimSweep";
import {
  cancelCashOut,
  appCashOutEnv,
  reconcileCashOuts,
  releaseGoneCashOut,
  scheduledCashOutNotes,
  settleGoneCashOut,
  type CashOutEnv,
} from "./cashOutLater";
import {
  cancelledPiece,
  runPrivateCashOut,
  unscheduledPieces,
  type PieceProgress,
  type PrivateCashOutDeps,
  type PrivateCashOutResult,
  type TopUpRun,
} from "./cashOutPrivately";
import { freshPath, splitNote } from "./cashOutSplit";
import { readDemo } from "./demoFlag";
import { getAllNotes } from "./noteVault";
import { DATED_OFF_MESSAGE, DAY_MS, MAX_DATED_DAYS, datedOff, dayOf, nextSendDay } from "./relay/scheduled";
import { activeSpendableNotes, notesToMove, proofLoose, updateLocalNote, withdrawFeeOf, type LocalNote } from "./shield";
import { supportsNativeShield } from "./tokens";
import { topUpsSetAside } from "./vaultHub";

/** How often, in days. */
export const TOP_UP_EVERY = { week: 7, "2weeks": 14 } as const;
export type TopUpEvery = keyof typeof TOP_UP_EVERY;
export const TOP_UPS_MIN = 2;
export const TOP_UPS_MAX = 12;
/** The first top-up goes the day after, so it never lands next to its own setup. */
const FIRST_AFTER_DAYS = 1;
/** The smallest top-up, in whole units: each one is two relay transactions. */
const MIN_UNITS = 1n;
/** A rough second count per top-up, a split and a proof: what the screen says to expect. */
const SECONDS_PER_TOP_UP = 50;

/** The most top-ups a series can have at this pace: the relay holds one for up to MAX_DATED_DAYS. */
export function mostTopUps(every: TopUpEvery): number {
  return Math.min(TOP_UPS_MAX, Math.floor((MAX_DATED_DAYS - FIRST_AFTER_DAYS) / TOP_UP_EVERY[every]) + 1);
}

/** The UTC days of a series set up at `now`, first to last. */
export function topUpDays(now: number, every: TopUpEvery, count: number): number[] {
  const first = dayOf(now) + FIRST_AFTER_DAYS * DAY_MS;
  return Array.from({ length: count }, (_, i) => first + i * TOP_UP_EVERY[every] * DAY_MS);
}

/** What a series costs, in base units: the whole total is set aside, and the fee comes out of each top-up as it goes. */
export function topUpTotals(amount: bigint, count: number, feeBps: number): { total: bigint; feeEach: bigint; agentGets: bigint } {
  const feeEach = withdrawFeeOf(amount, feeBps);
  return { total: amount * BigInt(count), feeEach, agentGets: amount - feeEach };
}

/** Why this can't be one top-up, or null. */
export function topUpAmountProblem(amount: bigint, decimals: number): string | null {
  return amount < MIN_UNITS * 10n ** BigInt(decimals) ? `A top-up is at least ${MIN_UNITS}.` : null;
}

/** How long setting a series up takes, in whole minutes. */
export function topUpMinutes(count: number): number {
  return Math.ceil((count * SECONDS_PER_TOP_UP) / 60);
}

/** Whether the agent needs gas of its own here, in plain words. Tempo pays gas in stablecoins, so there it needs none. */
export function agentGasLine(net: { chainId: number; family: string; label: string }): string | null {
  if (net.family === "tempo") return null;
  return supportsNativeShield(net.chainId)
    ? `The agent needs its own ETH for gas on ${net.label}. Top-ups send stablecoins only.`
    : `The agent needs its own ETH for gas on ${net.label}. Top-ups send stablecoins only, and ETH isn't held in the vault there.`;
}

// ---------------------------------------------------------------- picking the note

/** Notes a series can be split from: in this asset, spendable, and not a piece still waiting to be scheduled. */
function sourceNotes(notes: LocalNote[], asset: string): LocalNote[] {
  const want = asset.toLowerCase();
  const waiting = new Set(unscheduledPieces(notes).map((n) => n.id));
  return activeSpendableNotes(notes).filter(
    (n) => n.asset.toLowerCase() === want && n.bound && (n.scheme === "poseidon" || !n.scheme) && !waiting.has(n.id)
  );
}

/** The most one series can set aside: a cash out spends one note, so a series comes out of one. */
export function largestTopUpNote(notes: LocalNote[], asset: string): bigint {
  return sourceNotes(notes, asset).reduce((max, n) => (BigInt(n.amountWei) > max ? BigInt(n.amountWei) : max), 0n);
}

/** The smallest note that covers `total`, so big balances stay whole; null when none does. */
export function pickTopUpNote(notes: LocalNote[], asset: string, total: bigint): LocalNote | null {
  return (
    sourceNotes(notes, asset)
      .filter((n) => BigInt(n.amountWei) >= total)
      .sort((a, b) => (BigInt(a.amountWei) < BigInt(b.amountWei) ? -1 : 1))[0] ?? null
  );
}

// ---------------------------------------------------------------- setting up

type RunArgs = {
  note: LocalNote;
  owner: Address;
  onStatus?: (s: string) => void;
  onPiece?: (i: number, p: Partial<PieceProgress>) => void;
  deps?: Partial<PrivateCashOutDeps>;
};

function run(a: RunArgs, agent: Address, amount: bigint, topUp: TopUpRun): Promise<PrivateCashOutResult> {
  if (datedOff(a.note.chainId)) throw new Error(DATED_OFF_MESSAGE);
  const n = topUp.slots.length;
  return runPrivateCashOut({
    ...a,
    pieces: Array.from({ length: n }, () => amount),
    to: Array.from({ length: n }, () => agent),
    // a tag needs a window; each top-up goes on its own day instead
    window: "day",
    topUp,
  });
}

/**
 * Sets a series up: `count` top-ups of `amount` to `agent`, split from `note`,
 * each scheduled for its day. Resolves with what was scheduled and, when it
 * stopped early, where and why (lib/cashOutPrivately).
 */
export function setUpTopUps(
  a: RunArgs & { agent: Address; amount: bigint; every: TopUpEvery; count: number; now?: number }
): Promise<PrivateCashOutResult> {
  if (a.count < TOP_UPS_MIN || a.count > mostTopUps(a.every)) {
    throw new Error(`Pick ${TOP_UPS_MIN} to ${mostTopUps(a.every)} top-ups.`);
  }
  const days = topUpDays(a.now ?? Date.now(), a.every, a.count);
  return run(a, a.agent, a.amount, {
    slots: days.map((day, i) => ({ piece: i + 1, day })),
    of: a.count,
    everyDays: TOP_UP_EVERY[a.every],
    most: TOP_UPS_MAX,
  });
}

/** Sets up the slots a stopped series never reached, in the same series, from `a.note`. */
export function finishTopUps(a: RunArgs & { series: TopUpSeries; now?: number }): Promise<PrivateCashOutResult> {
  const now = a.now ?? Date.now();
  const { series } = a;
  return run(a, series.to, series.amount, {
    plan: series.id,
    slots: series.missing.map((m) => ({ piece: m.piece, day: nextSendDay(m.day, now) })),
    of: series.of,
    everyDays: series.everyDays,
    most: TOP_UPS_MAX,
  });
}

// ---------------------------------------------------------------- what shows

export type TopUpState =
  /** Waiting with the relay for its day. */
  | "upcoming"
  /** The relay is sending it, or sent it and the chain has not shown it yet. */
  | "going"
  /** Being set aside: the split has not shown on the chain yet. */
  | "landing"
  /** In the private balance, not handed to the relay yet. */
  | "unscheduled"
  | "sent"
  /** It did not go out. Nothing moved, and it is back in the balance. */
  | "returned"
  /** Cancelled, or kept in the balance instead. */
  | "cancelled";

export function topUpState(n: LocalNote): TopUpState {
  const ended = n.cashOutPlan?.topUp?.ended;
  const mark = n.cashOut;
  if (ended === "cancelled" || ended === "kept" || mark?.state === "cancelled") return "cancelled";
  if (ended === "returned" || mark?.state === "expired" || mark?.state === "failed") return "returned";
  if (mark) return n.status === "recovered" ? "sent" : mark.state === "sent" ? "going" : "upcoming";
  // its proof went to the relay and never became a job: refused, or the reply was lost
  if (n.proofOutAt) return "returned";
  // spent some other way before it was ever scheduled
  if (n.status === "recovered") return "cancelled";
  return n.sweepPending ? "landing" : "unscheduled";
}

/** Still ahead: the rest are over. */
export function topUpAhead(state: TopUpState): boolean {
  return state === "upcoming" || state === "going" || state === "landing" || state === "unscheduled";
}

export type TopUpRow = {
  note: LocalNote;
  state: TopUpState;
  /** Its place in the series, from 1. */
  piece: number;
  of: number;
  /** When it goes or went (ms): the relay's time once there is one, else midday on its day. */
  at: number;
  /** On its way back to a fresh note, which ends its proof. Out of the balance until then. */
  moving: boolean;
};

/** Every top-up in these notes, soonest first. */
export function topUpRows(notes: LocalNote[]): TopUpRow[] {
  return notes
    .filter((n) => n.cashOutPlan?.topUp)
    .map((note) => {
      const tag = note.cashOutPlan!;
      return {
        note,
        state: topUpState(note),
        piece: tag.piece,
        of: tag.of,
        at: note.cashOut?.at ?? tag.topUp!.day + DAY_MS / 2,
        moving: proofLoose(note),
      };
    })
    .sort((a, b) => a.at - b.at);
}

export type TopUpSeries = {
  id: string;
  to: Address;
  asset: Address;
  /** Each top-up, in base units. */
  amount: bigint;
  everyDays: number;
  of: number;
  rows: TopUpRow[];
  /** How many the relay has, or has sent: a piece still to schedule is not one of them. */
  scheduled: number;
  /** A split may still be landing: nothing is offered until the sync settles it, a run never guesses past that. */
  settling: boolean;
  /** Slots a stopped run never reached whose day has not passed: their money is still in the balance. */
  missing: { piece: number; day: number }[];
};

/** The series in these notes, soonest first, with the slots still to set up. */
export function topUpSeries(notes: LocalNote[], now: number): TopUpSeries[] {
  const byPlan = new Map<string, TopUpRow[]>();
  for (const r of topUpRows(notes)) {
    const id = r.note.cashOutPlan!.plan;
    byPlan.set(id, [...(byPlan.get(id) ?? []), r]);
  }
  return [...byPlan.entries()].map(([id, rows]) => {
    const anchor = rows[0]!.note;
    const tag = anchor.cashOutPlan!;
    const { day, everyDays } = tag.topUp!;
    // one that came back ahead of its day can be set up again; a cancelled one stays cancelled
    const known = new Set(rows.filter((r) => r.state !== "returned").map((r) => r.piece));
    const missing: TopUpSeries["missing"] = [];
    for (let piece = 1; piece <= tag.of; piece++) {
      const at = day + (piece - tag.piece) * everyDays * DAY_MS;
      // a passed day is gone for good (and an old row may simply have been trimmed from the history)
      if (!known.has(piece) && at + DAY_MS > now) missing.push({ piece, day: at });
    }
    return {
      id,
      to: tag.to,
      asset: anchor.asset,
      amount: BigInt(anchor.amountWei),
      everyDays,
      of: tag.of,
      rows,
      scheduled: rows.filter((r) => r.state === "upcoming" || r.state === "going" || r.state === "sent").length,
      settling: rows.some((r) => r.state === "landing"),
      missing,
    };
  });
}

/** What is set aside now, by asset: money waiting with the relay, out of the balance. A piece not scheduled is still in it. */
export function topUpSetAside(rows: TopUpRow[]): Map<string, bigint> {
  return topUpsSetAside(rows.filter((r) => topUpAhead(r.state)).map((r) => r.note));
}

function dayWords(at: number): string {
  return new Date(at).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/** "Nov 14": a day in the owner's own calendar. */
export function topUpDayLabel(at: number): string {
  return dayWords(at);
}

/** The second line of a row: when, in plain words. */
export function topUpWhen(r: Pick<TopUpRow, "state" | "at"> & { moving?: boolean }, now: number): string {
  const day = dayWords(r.at);
  const clock = new Date(r.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  switch (r.state) {
    case "upcoming":
      return r.at <= now ? "Going out now" : `${day}, about ${clock}`;
    case "going":
      return "On its way";
    case "landing":
      return `${day}, still being set aside`;
    case "unscheduled":
      return `${day}, not scheduled yet`;
    case "sent":
      return `Sent ${day}`;
    case "returned":
      return r.moving ? "Didn't go out. Moving back to your balance" : `Didn't go out on ${day}. Nothing moved`;
    case "cancelled":
      return r.moving ? "Cancelled. Moving back to your balance" : `Cancelled, was ${day}`;
  }
}

// ---------------------------------------------------------------- after setup

/**
 * Cancels a waiting top-up. Its row stays as cancelled, and its note moves to a
 * fresh one (moveLooseProofs) before it can be spent. Returns what to tell the
 * owner when it could not be cancelled, else null.
 */
export async function cancelTopUp(n: LocalNote, env?: CashOutEnv): Promise<string | null> {
  const mark = n.cashOut;
  if (!mark) return null;
  const result = await cancelCashOut(mark.job);
  if (result === "cancelled") {
    await cancelledPiece(n.id);
    return null;
  }
  if (result === "over") {
    // It already ended without going out: back in the balance once the chain agrees.
    await reconcileCashOuts(env).catch(() => false);
    return null;
  }
  if (result === "going") {
    updateLocalNote(n.id, { cashOut: { ...mark, state: "sent" } });
    return "It is already going out, so it can't be cancelled.";
  }
  if (result === "gone") {
    if (await releaseGoneCashOut(n, env).catch(() => false)) {
      await cancelledPiece(n.id);
      return null;
    }
    return "The relay no longer holds this top-up, and the network could not confirm it is unspent. Refresh in a moment.";
  }
  return "The relay could not be reached. Try Cancel again in a moment.";
}

let demoMoving = false;

/** The recording demo has no tree to prove a move against: the app's own whole-note split, on the pretend relay. */
async function demoMoveNotes(): Promise<void> {
  if (demoMoving) return;
  demoMoving = true;
  try {
    for (const n of notesToMove(getAllNotes())) {
      const at = await freshPath(n.commitment).catch(() => null);
      if (!at) continue;
      await splitNote({
        note: n,
        amount: BigInt(n.amountWei),
        allowWhole: true,
        path: at.path,
        owner: n.from as Address,
        relayOn: true,
        sendWithWallet: () => Promise.reject(new Error("This move goes through the Gloam relay.")),
        onStatus: () => {},
      }).catch(() => {});
    }
  } finally {
    demoMoving = false;
  }
}

/** Starts moving every note whose proof is still out, so a cancel takes effect now, not at the next sync. */
export function moveLooseProofs(env?: ClaimEnv): Promise<void> {
  return readDemo() ? demoMoveNotes() : moveRevertedNotes(env);
}

/**
 * Brings every top-up on the active network up to date. reconcileCashOuts
 * leaves a job the relay no longer holds to the chain, which is right for a
 * cash out someone is waiting on. A series runs for months with the app closed
 * for longer than a finished job is kept, so a top-up past its time and gone
 * from the relay is settled from the chain here. True when a note changed.
 */
export async function reconcileTopUps(env?: CashOutEnv): Promise<boolean> {
  if (!env && typeof window === "undefined") return false;
  const e = env ?? appCashOutEnv();
  let changed = await reconcileCashOuts(e);
  for (const n of scheduledCashOutNotes()) {
    if (!n.cashOutPlan?.topUp || n.cashOut!.at > e.now()) continue;
    if ((await e.status(n.cashOut!.job)) === "gone" && (await settleGoneCashOut(n, e))) changed = true;
  }
  return changed;
}
