/*
 * Recording demo: payroll runs played back in the browser (switch in
 * lib/demoFlag.ts). Paced by hand rather than through the stand-in prover, so
 * a whole team pays out in the time a viewer will sit through.
 */

import type { Address } from "viem";
import type { PayrollBatch, PayrollRow, PayrollRowStatus } from "@/lib/payroll";
import { DEMO_ADDRESS, randomHex, sleep, spendDemoNotes } from "./store";

function randomCode(): string {
  const b = new Uint8Array(24);
  crypto.getRandomValues(b);
  return btoa(String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Each person's steps and roughly how long each one holds on screen (ms). */
function stepsFor(row: PayrollRow): [PayrollRowStatus, number][] {
  const steps: [PayrollRowStatus, number][] = [
    ["preparing", 1100],
    ["sending", 700],
    ["confirming", 900],
  ];
  if (row.kind === "gloam") steps.push(["notifying", 550]);
  return steps;
}

/** Plays a run the way the real engine reports it, one person at a time, paying from the private balance. */
export async function simulatePayroll(
  batch: PayrollBatch,
  deps: { onUpdate: (b: PayrollBatch) => void; shouldStop: () => boolean }
): Promise<PayrollBatch> {
  const b: PayrollBatch = { ...batch, status: "running", rows: batch.rows.map((r) => ({ ...r })) };
  const emit = () => deps.onUpdate({ ...b, rows: b.rows.map((r) => ({ ...r })) });
  emit();
  await sleep(500);
  for (let i = 0; i < b.rows.length; i++) {
    const row = b.rows[i]!;
    if (row.status === "paid") continue;
    if (deps.shouldStop()) {
      b.status = "paused";
      emit();
      return b;
    }
    for (const [status, ms] of stepsFor(row)) {
      row.status = status;
      emit();
      // A little unevenness so it reads as real work, not a metronome.
      await sleep(ms + ((i * 137 + ms) % 260));
    }
    row.status = "paid";
    row.txHash = randomHex(32);
    if (row.kind === "gloam") row.memoPosted = true;
    else row.ticket = randomCode();
    spendDemoNotes(b.chainId, b.asset, [BigInt(row.amount)]);
    emit();
    await sleep(250);
  }
  b.status = "done";
  emit();
  return b;
}

/** One finished run from last month, so the history card is not empty. */
export function demoHistory(args: {
  chainId: number;
  pool: Address;
  asset: Address;
  decimals: number;
}): PayrollBatch[] {
  const unit = 10n ** BigInt(args.decimals);
  const people: [string, PayrollRow["kind"], number][] = [
    ["Duke", "gloam", 6000],
    ["Yomi", "gloam", 4800],
    ["Robin", "link", 4200],
    ["Romeo", "gloam", 3600],
    ["Kris", "link", 2900],
  ];
  const stamp = Date.UTC(2026, 8, 1, 9, 0, 0);
  return [
    {
      id: "pr-demo-sep",
      title: "Payroll Sep 1",
      createdAt: stamp,
      chainId: args.chainId,
      pool: args.pool,
      asset: args.asset,
      employer: DEMO_ADDRESS,
      relay: true,
      status: "done",
      rows: people.map(([name, kind, amt], i) => ({
        id: `${stamp}-${i}`,
        name,
        recipient: "",
        kind,
        amount: (BigInt(amt) * unit).toString(),
        status: "paid",
        txHash: randomHex(32),
        memoPosted: kind === "gloam",
        ticket: kind === "link" ? randomCode() : undefined,
      })),
    },
  ];
}
