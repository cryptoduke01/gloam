import { NextResponse } from "next/server";
import { webhookSecretOk } from "@/lib/telegramBot/rules";
import { runDueJobs, takeNotices } from "@/lib/relay/scheduled";
import { deliverNotices } from "@/lib/relay/webhook";
import { scheduledStore, scheduledStoreReady } from "@/lib/relay/scheduledStore";
import { networkForChain, readSpendState, relayGasHigh, sendUnshieldNow } from "@/lib/relay/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Jobs sealed again under the current key each pass, while an old key is kept. */
const RESEAL_PER_PASS = 25;

/**
 * Sends the scheduled cash outs that are due (lib/relay/scheduled). Vercel's
 * cron calls it every minute (vercel.json) with `Authorization: Bearer
 * <CRON_SECRET>`; without CRON_SECRET nothing gets in. A job due on a chain
 * where gas is over the relay's ceiling (Ethereum) waits for it to come down.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret || !webhookSecretOk(req.headers.get("authorization"), `Bearer ${secret}`)) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  // Without the shared store there is nothing to run: never treat that as "no jobs".
  if (!scheduledStoreReady()) return NextResponse.json({ ok: false, code: "later_off" }, { status: 503 });
  const store = scheduledStore();
  const results = await runDueJobs(store, {
    now: () => Date.now(),
    readChain: (job) => readSpendState(networkForChain(job.chainId), job.root, job.nullifier),
    gasHigh: (job) => relayGasHigh(networkForChain(job.chainId)),
    send: (job) =>
      sendUnshieldNow(networkForChain(job.chainId), {
        proof: job.proof,
        root: job.root,
        nullifier: job.nullifier,
        asset: job.asset,
        to: job.to,
        amount: job.amount,
      }),
  });
  // counts only: no ids, amounts or addresses in the logs
  const tally: Record<string, number> = {};
  for (const r of results) tally[r.status] = (tally[r.status] ?? 0) + 1;
  if (results.length) console.info("gloam_cashout_later_run", JSON.stringify(tally));
  // After every job is settled, and inside the function's limit: a notice can't touch a job.
  const notices = await takeNotices(store, results, Date.now()).catch(() => []);
  if (notices.length) console.info("gloam_cashout_later_notices", JSON.stringify(await deliverNotices(notices)));
  // While an old key is kept. It logs nothing once there is nothing left to re-seal.
  const resealed = (await store.reseal?.(RESEAL_PER_PASS).catch(() => 0)) ?? 0;
  if (resealed) console.info("gloam_cashout_later_resealed", JSON.stringify({ resealed }));
  return NextResponse.json({ ok: true, data: tally });
}
