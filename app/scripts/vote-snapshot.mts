/**
 * Takes the $GLOAM balance snapshot for a holder vote.
 *
 * Every holder's balance at one Robinhood Chain mainnet block, worked out from
 * the token's Transfer logs since launch, then checked against balanceOf at
 * that block (read with blockNumber) for every holder. The public RPC keeps
 * state for only a few minutes of blocks, so run this right after picking the
 * block: with no block given it takes one a few seconds old, and the check
 * runs. Writes src/lib/vote/snapshots/<id>.json and the index next to it.
 *
 * Creating and opening a vote:
 *   1. In src/lib/vote/config.ts, add the vote with `published: false` and `snapshotBlock: 0`.
 *   2. From app/:  ../mcp/node_modules/.bin/tsx scripts/vote-snapshot.mts <id>
 *   3. Put the block it prints into `snapshotBlock`, set `start` and `end` (UTC).
 *   4. Preview it: GLOAM_VOTE_PREVIEW=1 pnpm dev, then open /vote/<id>.
 *   5. Set `published: true`, commit the config and the snapshot, ship.
 *
 * Options:
 *   --block <n>       use this block (the balanceOf check needs it to be recent)
 *   --rpc <url>       another Robinhood Chain mainnet RPC (an archive node checks any block)
 *   --allow-unchecked write the snapshot even when balanceOf at the block can't be read
 *
 * Reads only. Nothing is signed or sent.
 */
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createPublicClient, erc20Abi, http, type Address } from "viem";
import { robinhood } from "../src/lib/chain";
import { VOTES } from "../src/lib/vote/config";
import {
  GLOAM_FIRST_BLOCK,
  GLOAM_TOKEN_ADDRESS,
  TRANSFER_TOPIC,
  VOTE_CHAIN_ID,
  configProblems,
  eligibleTotal,
  formatGloam,
  replayTransfers,
  type TransferLog,
  type VoteSnapshot,
} from "../src/lib/vote/core";
import { excludedFor } from "../src/lib/vote/excluded";

const args = process.argv.slice(2);
const flag = (name: string) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const VALUE_FLAGS = new Set(["--block", "--rpc"]);
const id = args.find((a, i) => !a.startsWith("--") && !VALUE_FLAGS.has(args[i - 1] ?? ""));
if (!id) {
  console.error("Usage: tsx scripts/vote-snapshot.mts <vote id> [--block <n>] [--rpc <url>] [--allow-unchecked]");
  process.exit(1);
}
const vote = VOTES.find((v) => v.id === id);
if (!vote) {
  console.error(`No vote "${id}" in src/lib/vote/config.ts.`);
  process.exit(1);
}
const problems = configProblems({ ...vote, published: false });
if (problems.length) {
  console.error(`Fix the vote config first:\n- ${problems.join("\n- ")}`);
  process.exit(1);
}

const rpcUrl = flag("--rpc") ?? robinhood.rpcUrls.default.http[0]!;
const client = createPublicClient({ chain: robinhood, transport: http(rpcUrl, { timeout: 30_000, retryCount: 3 }) });
if ((await client.getChainId()) !== VOTE_CHAIN_ID) {
  console.error(`${rpcUrl} is not Robinhood Chain mainnet.`);
  process.exit(1);
}

const head = Number(await client.getBlockNumber());
const asked = flag("--block") ? Number(flag("--block")) : vote.snapshotBlock || head - 20;
if (!Number.isSafeInteger(asked) || asked < GLOAM_FIRST_BLOCK || asked > head) {
  console.error(`Block ${asked} is not between ${GLOAM_FIRST_BLOCK} and the head (${head}).`);
  process.exit(1);
}
const block = await client.getBlock({ blockNumber: BigInt(asked) });
console.log(`Block ${asked} (${new Date(Number(block.timestamp) * 1000).toISOString()}), head ${head}.`);

/** Transfer logs in [from, to], halving the range whenever the RPC says it is too much. */
async function transferLogs(from: number, to: number): Promise<TransferLog[]> {
  try {
    return (await client.request({
      method: "eth_getLogs",
      params: [{ address: GLOAM_TOKEN_ADDRESS, fromBlock: `0x${from.toString(16)}`, toBlock: `0x${to.toString(16)}`, topics: [TRANSFER_TOPIC] }],
    })) as TransferLog[];
  } catch (e) {
    const text = String((e as Error)?.message ?? e);
    if (from === to || !/limit|narrow|range|too many|exceed/i.test(text)) throw e;
    const mid = Math.floor((from + to) / 2);
    return [...(await transferLogs(from, mid)), ...(await transferLogs(mid + 1, to))];
  }
}

const SPAN = 9_000_000;
const logs: TransferLog[] = [];
for (let from = GLOAM_FIRST_BLOCK; from <= asked; from += SPAN) {
  logs.push(...(await transferLogs(from, Math.min(asked, from + SPAN - 1))));
}
const balances = replayTransfers(logs, asked);
console.log(`${logs.length} Transfer logs, ${balances.size} holders.`);

// balanceOf at the block for every holder, plus totalSupply
const holders = [...balances.keys()] as Address[];
let checked: VoteSnapshot["checked"] = null;
try {
  let mismatches = 0;
  const BATCH = 400;
  for (let i = 0; i < holders.length; i += BATCH) {
    const slice = holders.slice(i, i + BATCH);
    const res = await client.multicall({
      contracts: slice.map((a) => ({ address: GLOAM_TOKEN_ADDRESS, abi: erc20Abi, functionName: "balanceOf" as const, args: [a] as const })),
      blockNumber: BigInt(asked),
      allowFailure: false,
    });
    res.forEach((onChain, j) => {
      if (onChain !== balances.get(slice[j]!.toLowerCase())) {
        mismatches++;
        console.error(`MISMATCH ${slice[j]}: balanceOf ${onChain}, from logs ${balances.get(slice[j]!.toLowerCase())}`);
      }
    });
  }
  const supply = await client.readContract({ address: GLOAM_TOKEN_ADDRESS, abi: erc20Abi, functionName: "totalSupply", blockNumber: BigInt(asked) });
  const sum = [...balances.values()].reduce((s, b) => s + b, 0n);
  if (supply !== sum) {
    mismatches++;
    console.error(`MISMATCH totalSupply ${supply}, balances add up to ${sum}`);
  }
  checked = { balanceOf: holders.length, mismatches };
  console.log(`balanceOf at block ${asked}: ${holders.length} holders checked, ${mismatches} mismatches.`);
  if (mismatches) {
    console.error("The snapshot does not match the chain. Nothing written.");
    process.exit(1);
  }
} catch (e) {
  const text = String((e as Error)?.message ?? e);
  console.error(`balanceOf at block ${asked} could not be read (${text.split("\n")[0]}).`);
  if (!args.includes("--allow-unchecked")) {
    console.error("Run it again without --block to take a fresh one, use an archive RPC with --rpc, or pass --allow-unchecked.");
    process.exit(1);
  }
}

const snapshot: VoteSnapshot = {
  voteId: vote.id,
  chainId: VOTE_CHAIN_ID,
  token: GLOAM_TOKEN_ADDRESS,
  block: asked,
  blockHash: block.hash!,
  blockTime: Number(block.timestamp),
  takenAt: new Date().toISOString(),
  balances: Object.fromEntries([...balances].sort((a, b) => (b[1] > a[1] ? 1 : b[1] < a[1] ? -1 : 0)).map(([a, b]) => [a, b.toString()])),
  checked,
};

const dir = join(dirname(fileURLToPath(import.meta.url)), "../src/lib/vote/snapshots");
mkdirSync(dir, { recursive: true });
writeFileSync(join(dir, `${vote.id}.json`), JSON.stringify(snapshot, null, 1) + "\n");

// the index imports every snapshot in the folder
const files = readdirSync(dir).filter((f) => f.endsWith(".json")).sort();
const ident = (i: number) => `s${i}`;
const index = [
  "// Written by scripts/vote-snapshot.mts. Do not edit by hand: run the script again.",
  'import type { VoteSnapshot } from "../core";',
  ...files.map((f, i) => `import ${ident(i)} from "./${f}";`),
  "",
  "export const SNAPSHOTS: Record<string, VoteSnapshot> = {",
  ...files.map((f, i) => `  ${JSON.stringify(f.replace(/\.json$/, ""))}: ${ident(i)} as VoteSnapshot,`),
  "};",
  "",
].join("\n");
writeFileSync(join(dir, "index.ts"), index);
JSON.parse(readFileSync(join(dir, `${vote.id}.json`), "utf8"));

const excluded = excludedFor(vote.exclude);
const eligible = eligibleTotal(snapshot, excluded);
const left = [...excluded.values()].filter((e) => balances.has(e.address.toLowerCase()));
console.log("");
console.log(`Snapshot written: src/lib/vote/snapshots/${vote.id}.json`);
console.log(`Eligible: ${eligible.wallets} wallets holding ${formatGloam(eligible.weight)} GLOAM.`);
for (const e of left) console.log(`Not counted: ${e.address} ${formatGloam(balances.get(e.address.toLowerCase())!)} GLOAM (${e.reason})`);
console.log("");
console.log(`Now set snapshotBlock: ${asked} for "${vote.id}" in src/lib/vote/config.ts.`);
