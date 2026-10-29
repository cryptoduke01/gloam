/**
 * Works out the final count of a close-weighted holder vote by hand: every
 * voter's $GLOAM at the closing block (the first block at or after the vote's
 * end), from the GLOAM Transfer logs replayed from the vote's checked
 * snapshot, then the count it gives. The site does the same on the first
 * results request after the close, so this is only needed to check it, or to
 * store it without waiting for a visitor.
 *
 * From app/:
 *   ../mcp/node_modules/.bin/tsx scripts/vote-final.mts <vote id> [<vote id> ...]           prints the count
 *   ../mcp/node_modules/.bin/tsx scripts/vote-final.mts <vote id> --store                   stores it too (needs
 *       UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN for production; a stored count is never replaced)
 *
 * Options:
 *   --rpc <url>   another Robinhood Chain mainnet RPC (an archive node also checks balanceOf at the block later on)
 *
 * Reads the chain and the ballots. Writes nothing on chain.
 */
import Module from "node:module";
import { fileURLToPath } from "node:url";

const stub = fileURLToPath(new URL("./server-only-stub.cjs", import.meta.url));
const M = Module as unknown as { _resolveFilename: (req: string, ...rest: unknown[]) => string };
const resolve = M._resolveFilename;
M._resolveFilename = function (req: string, ...rest: unknown[]) {
  return req === "server-only" ? stub : resolve.call(this, req, ...rest);
};

const { VOTES } = await import("../src/lib/vote/config");
const { configProblems, formatGloam, percentOf, weightingOf } = await import("../src/lib/vote/core");
const { rpcVoteChain, setVoteChain } = await import("../src/lib/vote/chainReads");
const { computeFinal, ensureFinal, finalDue, storedFinal } = await import("../src/lib/vote/final");
const { excludedForVote, snapshotFor } = await import("../src/lib/vote/registry");
const { listBallots } = await import("../src/lib/vote/store");
const { smartWalletCheck } = await import("../src/lib/vote/submit");
const { kvBackend } = await import("../src/lib/partnersKv");

const args = process.argv.slice(2);
const rpcAt = args.indexOf("--rpc");
const rpc = rpcAt >= 0 ? args[rpcAt + 1] : undefined;
const store = args.includes("--store");
const ids = args.filter((a, i) => !a.startsWith("--") && args[i - 1] !== "--rpc");
if (ids.length === 0) {
  console.error("Usage: tsx scripts/vote-final.mts <vote id> [<vote id> ...] [--store] [--rpc <url>]");
  process.exit(1);
}
if (kvBackend() === "none") {
  console.error("No vote store: set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN (or GLOAM_PARTNERS_STORE=memory for a dry run with no ballots).");
  process.exit(1);
}
const chain = rpcVoteChain(rpc);
setVoteChain(chain);

let failed = false;
for (const id of ids) {
  const v = VOTES.find((x) => x.id === id);
  if (!v || configProblems(v).length) {
    console.error(`${id}: no valid vote with that id in src/lib/vote/config.ts.`);
    failed = true;
    continue;
  }
  if (weightingOf(v) !== "close") {
    console.error(`${id}: weighs the snapshot, so it has no count at close.`);
    failed = true;
    continue;
  }
  const excluded = excludedForVote(v);
  const snapshot = snapshotFor(v);
  const stored = await storedFinal(v.id);
  const f = store
    ? finalDue(v)
      ? await ensureFinal(v, excluded, snapshot, { chain, contractCheck: smartWalletCheck })
      : null
    : stored ?? (await computeFinal(v, await listBallots(v.id), excluded, snapshot, { chain, contractCheck: smartWalletCheck }));
  if (!f) {
    console.error(`${id}: not counted. ${finalDue(v) ? "Another run holds the lock, or the chain didn't answer (see above). Try again." : `It counts from 2 minutes after ${v.end}.`}`);
    failed = true;
    continue;
  }
  const total = BigInt(f.totals.weight);
  console.log(`\n${v.question}  (${v.id})`);
  console.log(`  Closing block ${f.closeBlock} (${new Date(f.closeBlockTime * 1000).toISOString()}), ${f.logs} Transfer logs replayed from block ${f.replayFrom || "launch"}.`);
  console.log(`  balanceOf check: ${f.checked ? `${f.checked.balanceOf} voters, ${f.checked.mismatches} mismatches` : "state at the block is gone from this RPC, replay only"}.`);
  for (const o of f.totals.options) console.log(`  ${percentOf(BigInt(o.weight), total).toFixed(1).padStart(5)}%  ${o.label}: ${formatGloam(o.weight)} GLOAM, ${o.wallets} wallets`);
  console.log(`  ${f.totals.wallets} wallets, ${formatGloam(f.totals.weight)} GLOAM of ${formatGloam(f.eligible.weight)} eligible (${f.eligible.wallets} holders).`);
  for (const p of f.problems) console.log(`  Not counted: ${p.voter} (${p.problem})`);
  console.log(stored ? "  Already stored; this is the stored count." : store ? "  Stored." : "  Not stored (pass --store).");
}
process.exit(failed ? 1 : 0);
