/**
 * Self-test: $GLOAM holder votes (lib/vote, /api/vote).
 *
 *  - The config: every vote is valid, a published vote has its snapshot, the
 *    standing exclusions name the team and Gloam's own contracts
 *  - The Transfer-log replay behind every snapshot
 *  - Votes signed with throwaway test keys against a test vote and snapshot:
 *    weights from the snapshot, excluded and empty wallets refused, a changed
 *    vote replaces the old one (last signature wins), an older signature never
 *    lands over a newer one, a double send is harmless, tampered and
 *    mis-addressed signatures fail, the window and the clock are enforced,
 *    smart wallets go through the contract check only when ecrecover fails
 *  - A recount from the published list matches the live totals, and catches a
 *    tampered weight, a bad signature and a stale duplicate
 *  - The real routes: drafts stay hidden without GLOAM_VOTE_PREVIEW, unknown
 *    votes are 404, bad input is refused, the vote endpoint is rate limited
 *  - The holder check: an eligible holder, a wallet with nothing at the
 *    snapshot and a team wallet each come back as they should; a connected
 *    wallet is recorded once (first seen kept, last seen moved on), its
 *    balances worked out on the server whatever the browser sends, its signed
 *    votes noted, and the endpoint is rate limited
 *
 * Uses the in-process store (GLOAM_PARTNERS_STORE=memory). Nothing is sent to
 * any chain.
 *
 * Run from app/:  ../mcp/node_modules/.bin/tsx scripts/selftest-vote.mts
 */
import assert from "node:assert/strict";
import Module from "node:module";
import { fileURLToPath } from "node:url";
import { getAddress, isAddress, type Hex } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

process.env.GLOAM_PARTNERS_STORE = "memory";
process.env.GLOAM_VOTE_NO_ENS = "1";
process.env.GLOAM_VOTE_NO_CHAIN = "1";
delete process.env.UPSTASH_REDIS_REST_URL;
delete process.env.UPSTASH_REDIS_REST_TOKEN;
delete process.env.GLOAM_VOTE_PREVIEW;
const stub = fileURLToPath(new URL("./server-only-stub.cjs", import.meta.url));
const M = Module as unknown as { _resolveFilename: (req: string, ...rest: unknown[]) => string };
const resolve = M._resolveFilename;
M._resolveFilename = function (req: string, ...rest: unknown[]) {
  return req === "server-only" ? stub : resolve.call(this, req, ...rest);
};

const { VOTES } = await import("../src/lib/vote/config");
const core = await import("../src/lib/vote/core");
const { EXCLUDED, excludedFor } = await import("../src/lib/vote/excluded");
const { SNAPSHOTS } = await import("../src/lib/vote/snapshots");
const registry = await import("../src/lib/vote/registry");
const { submitBallot, VoteError } = await import("../src/lib/vote/submit");
const { listBallots, clearBallotCache, BallotBusyError } = await import("../src/lib/vote/store");
const { ballotsCsv } = await import("../src/lib/vote/results");
const { kv, resetMemoryKv } = await import("../src/lib/partnersKv");
const directory = await import("../src/lib/contractDirectory");
const { VAULT_SWAP_ROUTERS, VAULT_SWAP_V2_ROUTER } = await import("../src/lib/vaultSwap");

type VoteConfig = (typeof VOTES)[number];
type Ballot = import("../src/lib/vote/core").Ballot;
type VoteSnapshot = import("../src/lib/vote/core").VoteSnapshot;

let passed = 0;
async function test(name: string, fn: () => Promise<void> | void) {
  resetMemoryKv();
  clearBallotCache();
  (globalThis as { __gloamMcpRate?: Map<string, unknown> }).__gloamMcpRate?.clear();
  await fn();
  passed++;
  console.log(`ok  ${name}`);
}

async function rejects(p: Promise<unknown>, code: string) {
  try {
    await p;
  } catch (e) {
    assert.ok(e instanceof VoteError, `expected VoteError ${code}, got ${String(e)}`);
    assert.equal((e as InstanceType<typeof VoteError>).code, code);
    return;
  }
  assert.fail(`expected VoteError ${code}, but it went through`);
}

// ---------------------------------------------------------------- fixtures

const ONE = 10n ** 18n;
const alice = privateKeyToAccount(generatePrivateKey());
const bob = privateKeyToAccount(generatePrivateKey());
const carol = privateKeyToAccount(generatePrivateKey()); // holds nothing
const team = privateKeyToAccount(generatePrivateKey()); // holds a lot, excluded by the test vote
const smart = getAddress("0x5fbc62072701b34e9a2c272ba0f9275bdf5dde46"); // stands in for a smart wallet

const START = Date.parse("2030-01-01T00:00:00Z");
const END = Date.parse("2030-01-08T00:00:00Z");
const NOW = START + 3 * 86_400_000;
const nowSec = Math.floor(NOW / 1000);

const testVote: VoteConfig = {
  id: "selftest-vote",
  published: true,
  question: "Test question?",
  description: "Test.",
  options: ["Red", "Green", "Blue"],
  snapshotBlock: 100_000_000,
  start: new Date(START).toISOString().replace(".000Z", "Z"),
  end: new Date(END).toISOString().replace(".000Z", "Z"),
  exclude: [{ address: team.address, reason: "Test team wallet" }],
};

const snapshot: VoteSnapshot = {
  voteId: testVote.id,
  chainId: 4663,
  token: core.GLOAM_TOKEN_ADDRESS,
  block: testVote.snapshotBlock,
  blockHash: `0x${"ab".repeat(32)}`,
  blockTime: nowSec - 86_400,
  takenAt: new Date(NOW).toISOString(),
  balances: {
    [alice.address.toLowerCase()]: (100n * ONE).toString(),
    [bob.address.toLowerCase()]: (50n * ONE).toString(),
    [team.address.toLowerCase()]: (1000n * ONE).toString(),
    [smart.toLowerCase()]: (7n * ONE).toString(),
    [directory.GLOAM_TREASURY.toLowerCase()]: (9n * ONE).toString(),
  },
  checked: { balanceOf: 5, mismatches: 0 },
};
const excluded = excludedFor(testVote.exclude);

async function sign(account: typeof alice, option: number, timestamp = nowSec, v: VoteConfig = testVote, voter = account.address) {
  const message = core.voteMessage(v, option, voter, timestamp);
  const signature = await account.signTypedData(core.voteTypedData(message));
  return { voter, option, timestamp, signature };
}

const ctx = (extra: Partial<Parameters<typeof submitBallot>[1]> = {}) => ({ vote: testVote, snapshot, excluded, now: NOW, ...extra });

// ---------------------------------------------------------------- config

await test("every configured vote is valid, and a published one has its snapshot", () => {
  assert.ok(VOTES.length >= 1);
  const ids = new Set<string>();
  for (const v of VOTES) {
    assert.deepEqual(core.configProblems(v), [], `${v.id}: ${core.configProblems(v).join("; ")}`);
    assert.ok(!ids.has(v.id), `duplicate id ${v.id}`);
    ids.add(v.id);
    if (v.published) assert.ok(registry.snapshotFor(v), `${v.id} is published without a matching snapshot`);
  }
  for (const [id, s] of Object.entries(SNAPSHOTS)) {
    assert.equal(s.voteId, id);
    assert.equal(s.chainId, 4663);
    assert.equal(s.token.toLowerCase(), core.GLOAM_TOKEN_ADDRESS.toLowerCase());
    if (s.checked) assert.equal(s.checked.mismatches, 0);
  }
});

await test("the first three votes are published with one window and one snapshot block", () => {
  const first = ["private-swaps-next", "next-chain", "first-integration"].map((id) => VOTES.find((v) => v.id === id));
  for (const v of first) {
    assert.ok(v, "configured");
    assert.equal(v.published, true);
    assert.ok(registry.snapshotFor(v), `${v.id} has its snapshot`);
    assert.equal(registry.snapshotFor(v)!.checked?.mismatches, 0, "balanceOf check passed");
    for (const text of [v.question, v.description, ...v.options]) {
      assert.doesNotMatch(text, /\u2014|\u2013/, "no dashes");
      assert.doesNotMatch(text, /price|moon|pump|airdrop/i, "no price talk");
    }
    assert.match(v.description, /advisory/);
  }
  assert.equal(new Set(first.map((v) => `${v!.snapshotBlock} ${v!.start} ${v!.end}`)).size, 1);
  assert.equal(first[0]!.end, "2026-11-01T23:00:00Z");
  assert.equal(core.whenPhrase(first[0]!.end), "Sunday 1 Nov at 11pm UTC");
  for (const v of first) {
    assert.equal(v!.details?.length, v!.options.length, `${v!.id}: one detail per option`);
    for (const d of v!.details ?? []) assert.doesNotMatch(d, /\u2014|\u2013|price|moon|pump/i);
  }
});

await test("config problems are caught", () => {
  const bad = (patch: Partial<VoteConfig>) => core.configProblems({ ...testVote, ...patch }).length > 0;
  assert.ok(bad({ id: "Bad Id" }));
  assert.ok(bad({ options: ["Only one"] }));
  assert.ok(bad({ options: ["a", "b", "c", "d", "e", "f"] }));
  assert.ok(bad({ options: ["Same", "same"] }));
  assert.ok(bad({ start: testVote.end, end: testVote.start }));
  assert.ok(bad({ start: "2030-01-01T00:00:00+01:00" }));
  assert.ok(bad({ snapshotBlock: 0 })); // published with no snapshot
  assert.ok(bad({ snapshotBlock: 5 }));
  assert.ok(!bad({ published: false, snapshotBlock: 0 }));
  assert.ok(bad({ details: ["only one"] }));
  assert.ok(bad({ details: ["a", "", "c"] }));
  assert.ok(!bad({ details: ["a", "b", "c"] }));
  assert.ok(bad({ id: "me" }), "reserved for /api/vote/me");
});

await test("the standing exclusions name the team wallets, the vault, the swap routers and the pools", () => {
  const ex = excludedFor();
  const has = (a: string) => ex.has(a.toLowerCase());
  for (const e of EXCLUDED) assert.ok(isAddress(e.address), e.address);
  assert.ok(has("0x76b7E410a227c888aBD2Bdc24Ee32E094B0FD4D8"), "owner");
  assert.ok(has(directory.GLOAM_TREASURY), "treasury");
  assert.ok(has(directory.GLOAM_DEPLOYER), "deployer");
  for (const r of directory.GLOAM_RELAYERS) assert.ok(has(r), "relayer");
  assert.ok(has("0x39e28cde55cab798874746ac52cb4b5cc99a0194"), "vault");
  for (const r of [...Object.values(VAULT_SWAP_ROUTERS), ...Object.values(VAULT_SWAP_V2_ROUTER)]) if (r) assert.ok(has(r), `router ${r}`);
  assert.ok(has("0x8366a39cc670b4001a1121b8f6a443a643e40951"), "v4 PoolManager");
  assert.ok(has("0x0000000000000000000000000000000000000000"), "zero");
  // a vote's own extras add to the list, never replace it
  assert.ok(excluded.has(team.address.toLowerCase()) && excluded.has(directory.GLOAM_TREASURY.toLowerCase()));
});

// ---------------------------------------------------------------- snapshot replay

await test("replaying Transfer logs gives each holder's balance at a block", () => {
  const word = (a: string) => `0x${a.slice(2).toLowerCase().padStart(64, "0")}`;
  const zero = "0x0000000000000000000000000000000000000000";
  const log = (block: number, from: string, to: string, amount: bigint) => ({
    blockNumber: `0x${block.toString(16)}`,
    topics: [core.TRANSFER_TOPIC, word(from), word(to)],
    data: `0x${amount.toString(16).padStart(64, "0")}`,
  });
  const logs = [
    log(10, zero, alice.address, 500n),
    log(11, alice.address, bob.address, 200n),
    log(12, bob.address, carol.address, 200n),
    log(13, alice.address, zero, 50n),
  ];
  const at11 = core.replayTransfers(logs, 11);
  assert.equal(at11.get(alice.address.toLowerCase()), 300n);
  assert.equal(at11.get(bob.address.toLowerCase()), 200n);
  assert.equal(at11.has(zero), false);
  const at13 = core.replayTransfers(logs, 13);
  assert.equal(at13.get(alice.address.toLowerCase()), 250n);
  assert.equal(at13.has(bob.address.toLowerCase()), false, "an emptied holder drops out");
  assert.equal(at13.get(carol.address.toLowerCase()), 200n);
  assert.equal([...at13.values()].reduce((s, b) => s + b, 0n), 450n, "minted less burned");
});

// ---------------------------------------------------------------- voting

await test("a vote counts with the wallet's snapshot balance", async () => {
  const { ballot, changed } = await submitBallot(await sign(alice, 0), ctx());
  assert.equal(changed, false);
  assert.equal(ballot.weight, (100n * ONE).toString());
  assert.equal(ballot.choice, "Red");
  await submitBallot(await sign(bob, 1), ctx());
  const t = core.tally(testVote, await listBallots(testVote.id));
  assert.equal(t.wallets, 2);
  assert.equal(t.weight, 150n * ONE);
  assert.equal(t.options[0]!.weight, 100n * ONE);
  assert.equal(t.options[1]!.weight, 50n * ONE);
  assert.equal(t.options[2]!.wallets, 0);
});

await test("last signature wins: a changed vote replaces the old one", async () => {
  await submitBallot(await sign(alice, 0, nowSec - 60), ctx());
  await submitBallot(await sign(bob, 1, nowSec - 60), ctx());
  const r = await submitBallot(await sign(alice, 2, nowSec - 10), ctx());
  assert.equal(r.changed, true);
  const ballots = await listBallots(testVote.id);
  assert.equal(ballots.length, 2, "one ballot per wallet");
  const t = core.tally(testVote, ballots);
  assert.equal(t.options[0]!.weight, 0n);
  assert.equal(t.options[1]!.weight, 50n * ONE);
  assert.equal(t.options[2]!.weight, 100n * ONE);
  assert.equal(t.wallets, 2);
});

await test("an older signature never lands over a newer one, and a double send is harmless", async () => {
  const older = await sign(alice, 0, nowSec - 120);
  const newer = await sign(alice, 1, nowSec - 30);
  await submitBallot(newer, ctx());
  await rejects(submitBallot(older, ctx()), "newer");
  const again = await submitBallot(newer, ctx());
  assert.equal(again.changed, false);
  const [b] = await listBallots(testVote.id);
  assert.equal(b!.option, 1);
  // the same timestamp with another choice is not newer either
  await rejects(submitBallot(await sign(alice, 2, nowSec - 30), ctx()), "newer");
});

await test("two saves for one wallet never cross", async () => {
  await kv([["SET", `gloam:vote:v1:${testVote.id}:lock:${alice.address.toLowerCase()}`, "1", "NX", "EX", 10]]);
  await assert.rejects(submitBallot(await sign(alice, 0), ctx()), (e) => e instanceof BallotBusyError);
  // two at once: whichever lands, an older signature never ends up over a newer one
  resetMemoryKv();
  const a = await sign(alice, 0, nowSec - 50);
  const b = await sign(alice, 2, nowSec - 40);
  const [ra, rb] = await Promise.allSettled([submitBallot(a, ctx()), submitBallot(b, ctx())]);
  assert.ok(ra.status === "fulfilled" || rb.status === "fulfilled");
  const [stored] = await listBallots(testVote.id);
  if (rb.status === "fulfilled") assert.equal(stored!.option, 2);
  // and the older one can't land afterwards
  if (rb.status === "fulfilled") await rejects(submitBallot(a, ctx()), "newer");
});

await test("excluded and empty wallets have no vote", async () => {
  await rejects(submitBallot(await sign(team, 0), ctx()), "excluded");
  await rejects(submitBallot(await sign(carol, 0), ctx()), "no_balance");
  assert.equal((await listBallots(testVote.id)).length, 0);
});

await test("tampered and mis-addressed signatures fail", async () => {
  // bob signs, but says alice voted
  const forged = await sign(bob, 0, nowSec, testVote, alice.address);
  await rejects(submitBallot(forged, ctx()), "bad_signature");
  // alice signs Red, the request says Blue
  const s = await sign(alice, 0);
  await rejects(submitBallot({ ...s, option: 2 }, ctx()), "bad_signature");
  // a signature for another vote
  const other = { ...testVote, id: "another-vote" };
  await rejects(submitBallot(await sign(alice, 0, nowSec, other), ctx()), "bad_signature");
  // a signature over a different label for the same option
  const relabeled = { ...testVote, options: ["Crimson", "Green", "Blue"] };
  await rejects(submitBallot(await sign(alice, 0, nowSec, relabeled), ctx()), "bad_signature");
  // a different timestamp than the one signed
  await rejects(submitBallot({ ...s, timestamp: s.timestamp - 1 }, ctx()), "bad_signature");
  assert.equal((await listBallots(testVote.id)).length, 0);
});

await test("the voting window and the signing time are enforced", async () => {
  await rejects(submitBallot(await sign(alice, 0, Math.floor(START / 1000) - 10), ctx({ now: START - 5_000 })), "not_open");
  await rejects(submitBallot(await sign(alice, 0, Math.floor(END / 1000)), ctx({ now: END })), "closed");
  await rejects(submitBallot(await sign(alice, 0, nowSec - core.SIGNED_MAX_AGE_SEC - 5), ctx()), "stale");
  await rejects(submitBallot(await sign(alice, 0, nowSec + core.SIGNED_MAX_AHEAD_SEC + 5), ctx()), "stale");
  // the last second of the window still counts
  await submitBallot(await sign(alice, 0, Math.floor(END / 1000) - 1), ctx({ now: END - 1_000 }));
});

await test("bad input is refused before any check", async () => {
  const s = await sign(alice, 0);
  await rejects(submitBallot({ ...s, voter: "0x1234" }, ctx()), "bad_voter");
  await rejects(submitBallot({ ...s, option: 3 }, ctx()), "bad_option");
  await rejects(submitBallot({ ...s, option: -1 }, ctx()), "bad_option");
  await rejects(submitBallot({ ...s, option: "0" }, ctx()), "bad_option");
  await rejects(submitBallot({ ...s, timestamp: 1.5 }, ctx()), "bad_timestamp");
  await rejects(submitBallot({ ...s, signature: "0x1234" }, ctx()), "bad_signature");
  await rejects(submitBallot({ ...s, signature: `0x${"z".repeat(130)}` }, ctx()), "bad_signature");
  await rejects(submitBallot({ ...s, signature: `0x${"ab".repeat(4000)}` }, ctx()), "bad_signature");
  await rejects(submitBallot(null, ctx()), "bad_voter");
});

await test("smart wallets go through the contract check, and only when ecrecover fails", async () => {
  let asked = 0;
  const contractCheck = async (m: { voter: string }, sig: Hex) => {
    asked++;
    return m.voter === smart && sig === `0x${"11".repeat(65)}`;
  };
  await submitBallot(await sign(alice, 1), ctx({ contractCheck }));
  assert.equal(asked, 0, "an EOA never needs the RPC");
  const sw = { voter: smart, option: 1, timestamp: nowSec, signature: `0x${"11".repeat(65)}` as Hex };
  const r = await submitBallot(sw, ctx({ contractCheck }));
  assert.equal(r.ballot.weight, (7n * ONE).toString());
  assert.equal(asked, 1);
  await rejects(submitBallot({ ...sw, signature: `0x${"22".repeat(65)}` as Hex, timestamp: nowSec + 1 }, ctx({ contractCheck })), "bad_signature");
  // without a contract check, a smart wallet signature fails closed
  await rejects(submitBallot({ ...sw, timestamp: nowSec + 2 }, ctx()), "bad_signature");
});

// ---------------------------------------------------------------- recount

await test("a recount from the published list matches the live totals", async () => {
  await submitBallot(await sign(alice, 0, nowSec - 100), ctx());
  await submitBallot(await sign(bob, 2, nowSec - 90), ctx());
  await submitBallot(await sign(alice, 1, nowSec - 80), ctx());
  const published: Ballot[] = JSON.parse(JSON.stringify(await listBallots(testVote.id)));
  const live = core.tally(testVote, published);
  const r = await core.recount(testVote, snapshot, excluded, published);
  assert.deepEqual(r.problems, []);
  assert.equal(r.tally.weight, live.weight);
  assert.deepEqual(r.tally.options.map((o) => o.weight), live.options.map((o) => o.weight));
  assert.deepEqual(r.tally.options.map((o) => o.wallets), [0, 1, 1]);
  // the CSV carries every signature
  const csv = ballotsCsv(published);
  for (const b of published) assert.ok(csv.includes(b.signature) && csv.includes(b.voter));
});

await test("a recount catches tampering and keeps each wallet's latest vote", async () => {
  await submitBallot(await sign(alice, 1, nowSec - 80), ctx());
  await submitBallot(await sign(bob, 2, nowSec - 70), ctx());
  const published: Ballot[] = JSON.parse(JSON.stringify(await listBallots(testVote.id)));
  const oldAlice = await sign(alice, 0, nowSec - 500);
  const tampered: Ballot[] = [
    // alice's weight inflated: the snapshot's weight is used, and the gap reported
    { ...published.find((b) => b.voter === alice.address)!, weight: (999n * ONE).toString() },
    // bob's signature broken: dropped
    { ...published.find((b) => b.voter === bob.address)!, signature: `0x${"00".repeat(65)}` as Hex },
    // an older alice ballot slipped in: ignored, the latest counts
    { ...oldAlice, choice: "Red", weight: (100n * ONE).toString(), receivedAt: NOW } as Ballot,
    // the team wallet, signed for real: excluded
    { ...(await sign(team, 0)), choice: "Red", weight: (1000n * ONE).toString(), receivedAt: NOW } as Ballot,
  ];
  const r = await core.recount(testVote, snapshot, excluded, tampered);
  assert.equal(r.tally.weight, 100n * ONE);
  assert.equal(r.tally.options[1]!.weight, 100n * ONE);
  assert.equal(r.counted.length, 1);
  const why = (a: string) => r.problems.filter((p) => p.voter === a).map((p) => p.problem).join("; ");
  assert.match(why(alice.address), /listed weight/);
  assert.match(why(bob.address), /signature/);
  assert.match(why(team.address), /excluded/);
  // a snapshot for another block is flagged
  const wrong = await core.recount(testVote, { ...snapshot, block: 1 }, excluded, published);
  assert.ok(wrong.problems.some((p) => /snapshot is block/.test(p.problem)));
});

// ---------------------------------------------------------------- registry and routes

await test("drafts stay hidden unless preview is on, and a snapshot must match its vote", () => {
  const draft = { ...testVote, published: false };
  assert.equal(registry.findVote(draft.id, [draft]), null);
  assert.equal(registry.findVote(testVote.id, [testVote])?.id, testVote.id);
  assert.equal(registry.findVote("nope", [testVote]), null);
  process.env.GLOAM_VOTE_PREVIEW = "1";
  try {
    assert.equal(registry.findVote(draft.id, [draft])?.id, draft.id);
    assert.equal(registry.acceptingVotes(draft, snapshot, NOW), true);
  } finally {
    delete process.env.GLOAM_VOTE_PREVIEW;
  }
  assert.equal(registry.acceptingVotes(draft, snapshot, NOW), false);
  assert.equal(registry.acceptingVotes(testVote, null, NOW), false);
  assert.equal(registry.acceptingVotes(testVote, snapshot, END), false);
  assert.equal(registry.snapshotFor(testVote, { [testVote.id]: snapshot })?.block, snapshot.block);
  assert.equal(registry.snapshotFor(testVote, { [testVote.id]: { ...snapshot, block: 5 } }), null);
  assert.equal(registry.snapshotFor(testVote, { [testVote.id]: { ...snapshot, voteId: "x" } }), null);
  assert.equal(registry.snapshotFor(testVote, { [testVote.id]: { ...snapshot, checked: { balanceOf: 5, mismatches: 1 } } }), null);
  assert.equal(registry.snapshotFor(testVote, {}), null);
});

const route = await import("../src/app/api/vote/[id]/route");
const ballotsRoute = await import("../src/app/api/vote/[id]/ballots/route");
const params = (id: string) => ({ params: Promise.resolve({ id }) });
const req = (id: string, init?: RequestInit, query = "") =>
  new Request(`http://localhost/api/vote/${id}${query}`, { ...init, headers: { "x-forwarded-for": "203.0.113.7", "content-type": "application/json", ...(init?.headers ?? {}) } });

await test("routes: unknown votes are 404", async () => {
  for (const id of ["does-not-exist"]) {
    assert.equal((await route.GET(req(id), params(id))).status, 404);
    assert.equal((await route.POST(req(id, { method: "POST", body: "{}" }), params(id))).status, 404);
    assert.equal((await ballotsRoute.GET(req(`${id}/ballots`), params(id))).status, 404);
  }
});

await test("routes: in preview a draft shows, and takes no votes until its snapshot and window are in", async () => {
  const draft = VOTES.find((v) => !v.published);
  if (!draft) return;
  process.env.GLOAM_VOTE_PREVIEW = "1";
  try {
    const res = await route.GET(req(draft.id), params(draft.id));
    assert.equal(res.status, 200);
    const body = (await res.json()) as { data: { draft: boolean; options: string[]; accepting: boolean; snapshotReady: boolean } };
    assert.equal(body.data.draft, true);
    assert.deepEqual(body.data.options, draft.options);
    if (!registry.snapshotFor(draft) || !core.inWindow(draft)) {
      assert.equal(body.data.accepting, false);
      const post = await route.POST(req(draft.id, { method: "POST", body: JSON.stringify(await sign(alice, 0, nowSec, draft)) }), params(draft.id));
      assert.equal(post.status, 409);
    }
    assert.equal((await route.GET(req(draft.id, undefined, "?address=0x12"), params(draft.id))).status, 400);
    const csv = await ballotsRoute.GET(req(`${draft.id}/ballots`, undefined, "?format=csv"), params(draft.id));
    assert.equal(csv.status, 200);
    assert.match(csv.headers.get("content-type") ?? "", /text\/csv/);
  } finally {
    delete process.env.GLOAM_VOTE_PREVIEW;
  }
});

await test("routes: the vote endpoint is rate limited per IP", async () => {
  let last = 0;
  for (let i = 0; i < 25; i++) last = (await route.POST(req("does-not-exist", { method: "POST", body: "{}" }), params("does-not-exist"))).status;
  assert.equal(last, 429);
});

// ---------------------------------------------------------------- Glim

await test("Glim says nothing about votes until one is published, then gives the link and the rules", async () => {
  const { voteFacts } = await import("../src/lib/vote/glim");
  assert.equal(voteFacts([{ ...testVote, published: false }]), null);
  const text = voteFacts([testVote], NOW)!;
  assert.match(text, /gloam\.trade\/vote\/selftest-vote/);
  assert.match(text, /open until 8 Jan 2030, 00:00 UTC/);
  assert.match(text, /never tell anyone how to vote/);
  assert.match(text, /can't be counted in an open vote/);
  assert.doesNotMatch(text, /\u2014/, "no em dashes");
  assert.match(voteFacts([testVote], END)!, /closed/);
  if (!VOTES.some((v) => v.published)) assert.equal(voteFacts(), null, "nothing published, nothing said");
  else for (const v of VOTES.filter((x) => x.published)) assert.ok(voteFacts()!.includes(`gloam.trade/vote/${v.id}`));
});

await test("routes: every published vote answers with its own snapshot and options", async () => {
  for (const v of VOTES.filter((x) => x.published)) {
    const res = await route.GET(req(v.id), params(v.id));
    assert.equal(res.status, 200);
    const body = (await res.json()) as { data: { id: string; options: string[]; snapshotReady: boolean; snapshotBlock: number; eligible: { wallets: number } } };
    assert.equal(body.data.id, v.id);
    assert.deepEqual(body.data.options, v.options);
    assert.equal(body.data.snapshotReady, true);
    assert.equal(body.data.snapshotBlock, v.snapshotBlock);
    assert.ok(body.data.eligible.wallets > 100);
  }
});

// ---------------------------------------------------------------- three votes at once

await test("three votes at once: separate tallies, separate last-vote-wins, no signature crosses over", async () => {
  const three = ["swaps", "chain", "apps"].map((id, i) => ({ ...testVote, id: `three-${id}`, options: [`${id} A`, `${id} B`, `${id} C`, `${id} D`].slice(0, 3 + (i % 2)) }));
  const c = (v: VoteConfig) => ctx({ vote: v, snapshot: { ...snapshot, voteId: v.id } });
  const [a, b, d] = three as [VoteConfig, VoteConfig, VoteConfig];
  // alice votes in all three; bob only in two; alice changes her mind in one
  await submitBallot(await sign(alice, 0, nowSec - 100, a), c(a));
  await submitBallot(await sign(alice, 1, nowSec - 100, b), c(b));
  await submitBallot(await sign(alice, 2, nowSec - 100, d), c(d));
  await submitBallot(await sign(bob, 1, nowSec - 90, a), c(a));
  await submitBallot(await sign(bob, 3, nowSec - 90, b), c(b));
  const changed = await submitBallot(await sign(alice, 2, nowSec - 50, b), c(b));
  assert.equal(changed.changed, true);
  // a signature for one vote never counts in another
  await rejects(submitBallot(await sign(bob, 0, nowSec - 40, a), c(d)), "bad_signature");
  // an older alice ballot in vote a is refused there, though she signed later in vote b
  await rejects(submitBallot(await sign(alice, 2, nowSec - 120, a), c(a)), "newer");

  const ta = core.tally(a, await listBallots(a.id));
  const tb = core.tally(b, await listBallots(b.id));
  const td = core.tally(d, await listBallots(d.id));
  assert.deepEqual(ta.options.map((o) => o.weight), [100n * ONE, 50n * ONE, 0n]);
  assert.deepEqual(tb.options.map((o) => o.weight), [0n, 0n, 100n * ONE, 50n * ONE]);
  assert.deepEqual(td.options.map((o) => o.weight), [0n, 0n, 100n * ONE]);
  assert.deepEqual([ta.wallets, tb.wallets, td.wallets], [2, 2, 1]);
  // each recounts clean on its own
  for (const v of three) {
    const r = await core.recount(v, snapshot, excluded, await listBallots(v.id));
    assert.deepEqual(r.problems, []);
  }
  // alice's standing differs per vote
  const { voterStanding } = await import("../src/lib/vote/results");
  assert.equal((await voterStanding(a, snapshot, excluded, alice.address)).ballot?.option, 0);
  assert.equal((await voterStanding(b, snapshot, excluded, alice.address)).ballot?.option, 2);
  assert.equal((await voterStanding(d, snapshot, excluded, bob.address)).ballot, null);
});

await test("routes: /api/vote lists every published vote, /api/vote/me gives one wallet's standing in each", async () => {
  const listRoute = await import("../src/app/api/vote/route");
  const meRoute = await import("../src/app/api/vote/me/route");
  const list = await listRoute.GET(new Request("http://localhost/api/vote", { headers: { "x-forwarded-for": "203.0.113.9" } }));
  assert.equal(list.status, 200);
  const lj = (await list.json()) as { data: { votes: { id: string; details: string[] }[] } };
  assert.deepEqual(lj.data.votes.map((v) => v.id).sort(), VOTES.filter((v) => v.published).map((v) => v.id).sort());
  for (const v of lj.data.votes) assert.equal(v.details.length, VOTES.find((x) => x.id === v.id)!.options.length);

  const meReq = (q: string) => new Request(`http://localhost/api/vote/me${q}`, { headers: { "x-forwarded-for": "203.0.113.9" } });
  assert.equal((await meRoute.GET(meReq("?address=nope"))).status, 400);
  assert.equal((await meRoute.GET(meReq(""))).status, 400);
  // the largest eligible holder in the snapshot: weight, share, nothing cast yet
  const pub = VOTES.find((v) => v.published)!;
  const snap = registry.snapshotFor(pub)!;
  const ex = registry.excludedForVote(pub);
  const [top] = Object.entries(snap.balances).filter(([a]) => !ex.has(a));
  const res = await meRoute.GET(meReq(`?address=${top![0]}`));
  assert.equal(res.status, 200);
  const mj = (await res.json()) as { data: { name: string | null; votes: Record<string, { weight: string; eligibleWallets: number; ballot: unknown; excluded: string | null }> } };
  assert.equal(mj.data.name, null);
  for (const v of VOTES.filter((x) => x.published)) {
    const st = mj.data.votes[v.id]!;
    assert.equal(st.weight, top![1]);
    assert.equal(st.excluded, null);
    assert.equal(st.ballot, null);
    assert.equal(st.eligibleWallets, core.eligibleTotal(snap, ex).wallets);
  }
  // a team wallet comes back excluded with weight 0
  const team = (await (await meRoute.GET(meReq("?address=0x76b7E410a227c888aBD2Bdc24Ee32E094B0FD4D8"))).json()) as typeof mj;
  for (const st of Object.values(team.data.votes)) {
    assert.equal(st.weight, "0");
    assert.match(st.excluded ?? "", /Team/);
  }
});

// ---------------------------------------------------------------- holder check and connected holders

const holders = await import("../src/lib/vote/holders");
const seenRoute = await import("../src/app/api/vote/seen/route");
const seenReq = (body: unknown, ip = "203.0.113.20") =>
  new Request("http://localhost/api/vote/seen", { method: "POST", body: typeof body === "string" ? body : JSON.stringify(body), headers: { "x-forwarded-for": ip } });
const pubVotes = VOTES.filter((v) => v.published);
const pubSnap = registry.snapshotFor(pubVotes[0]!)!;
const pubEx = registry.excludedForVote(pubVotes[0]!);
const [topHolder, topWei] = Object.entries(pubSnap.balances).find(([a]) => !pubEx.has(a))!;
const TEAM_WALLET = "0x76b7E410a227c888aBD2Bdc24Ee32E094B0FD4D8";

await test("holder check: eligible, nothing at the snapshot, and a team wallet", async () => {
  const yes = await holders.holderFacts(getAddress(topHolder));
  assert.equal(yes.snapshot, topWei);
  assert.equal(yes.eligible, true);
  assert.equal(yes.excluded, null);
  assert.deepEqual(yes.signed, []);

  const zero = await holders.holderFacts(carol.address);
  assert.equal(zero.snapshot, "0");
  assert.equal(zero.eligible, false);
  assert.equal(zero.excluded, null);

  const teamFacts = await holders.holderFacts(getAddress(TEAM_WALLET));
  assert.equal(teamFacts.eligible, false);
  assert.match(teamFacts.excluded ?? "", /Team/);
});

await test("connected holders: one record per wallet, first seen kept, last seen moved on", async () => {
  const facts = await holders.holderFacts(getAddress(topHolder));
  const first = await holders.recordHolder(facts, 5n * ONE, 1_000);
  assert.ok(first);
  assert.equal(first.visits, 1);
  // the same wallet again later, typed in lower case, with a failed chain read
  const again = await holders.recordHolder({ ...facts, address: topHolder.toLowerCase() }, null, 9_000);
  assert.equal(again!.firstSeen, 1_000);
  assert.equal(again!.lastSeen, 9_000);
  assert.equal(again!.visits, 2);
  assert.equal(again!.current, (5n * ONE).toString(), "a failed read keeps the last balance");
  assert.equal(again!.currentAt, 1_000);
  const list = await holders.listHolders();
  assert.equal(list.length, 1);
  assert.equal(list[0]!.address, getAddress(topHolder));
  // a newer read replaces it
  const third = await holders.recordHolder(facts, 7n * ONE, 12_000);
  assert.equal(third!.current, (7n * ONE).toString());
  assert.equal(third!.currentAt, 12_000);
});

await test("connected holders: the signed votes are noted, and stay noted", async () => {
  const v = pubVotes[0]!;
  const { saveBallot } = await import("../src/lib/vote/store");
  await saveBallot(v.id, { voter: getAddress(topHolder), option: 0, choice: v.options[0]!, weight: topWei, timestamp: nowSec, signature: `0x${"cd".repeat(65)}`, receivedAt: NOW });
  const rec = await holders.recordHolder(await holders.holderFacts(getAddress(topHolder)), null, 2_000);
  assert.deepEqual(rec!.signed, [v.id]);
  const csv = holders.holdersCsv([{ ...rec!, voted: rec!.signed }]);
  assert.ok(csv.startsWith('"wallet","first_seen_utc"'));
  assert.ok(csv.includes(getAddress(topHolder)) && csv.includes(topWei) && csv.includes('"yes"'));
});

await test("the seen route: balances from the server only, bad input refused, rate limited", async () => {
  // whatever balance the browser claims is ignored
  const res = await seenRoute.POST(seenReq({ address: carol.address, snapshot: (999n * ONE).toString(), current: (999n * ONE).toString(), eligible: true }));
  assert.equal(res.status, 200);
  const j = (await res.json()) as { data: { current: string | null; recorded: boolean } };
  assert.equal(j.data.current, null, "no chain read in the self-test");
  assert.equal(j.data.recorded, true);
  const rec = await holders.getHolder(carol.address);
  assert.equal(rec!.snapshot, "0");
  assert.equal(rec!.current, null);
  assert.equal(rec!.eligible, false);
  // a team wallet is recorded as excluded
  await seenRoute.POST(seenReq({ address: TEAM_WALLET }));
  const t = await holders.getHolder(TEAM_WALLET);
  assert.equal(t!.eligible, false);
  assert.match(t!.excluded ?? "", /Team/);
  // twice is still one record
  await seenRoute.POST(seenReq({ address: carol.address }));
  assert.equal((await holders.listHolders()).length, 2);
  assert.equal((await holders.getHolder(carol.address))!.visits, 2);

  for (const bad of [{}, { address: "nope" }, { address: 42 }, "not json"]) assert.equal((await seenRoute.POST(seenReq(bad))).status, 400);
  assert.equal((await seenRoute.POST(seenReq({ address: `0x${"1".repeat(40)}`, pad: "x".repeat(600) }))).status, 413);
  assert.equal("GET" in seenRoute, false, "the records are never served from a public route");
  let last = 0;
  for (let i = 0; i < 25; i++) last = (await seenRoute.POST(seenReq({ address: alice.address }, "203.0.113.21"))).status;
  assert.equal(last, 429);
});

// ---------------------------------------------------------------- display

await test("amounts and shares read plainly", () => {
  assert.equal(core.formatGloam(0n), "0");
  assert.equal(core.formatGloam(1n), "<0.01");
  assert.equal(core.formatGloam(1234n * ONE + ONE / 2n), "1,234.5");
  assert.equal(core.formatGloam((ONE * 5n) / 100n), "0.05");
  assert.equal(core.formatGloam((54_550n * ONE).toString()), "54,550");
  assert.equal(core.percentOf(1n, 3n), 33.3);
  assert.equal(core.percentOf(0n, 0n), 0);
  assert.equal(core.sharePercent(1240n * ONE, 447_743n * ONE), "0.27%");
  assert.equal(core.sharePercent(1n, 447_743n * ONE), "<0.01%");
  assert.equal(core.sharePercent(0n, 5n), "0%");
  assert.equal(core.sharePercent(5n, 0n), "0%");
  assert.equal(core.sharePercent(1n, 4n), "25%");
  assert.equal(core.whenPhrase("2026-11-02T00:00:00Z"), "Sunday 1 Nov at midnight UTC");
  assert.equal(core.whenPhrase("2026-10-29T16:15:00Z"), "Thursday 29 Oct at 4:15pm UTC");
  assert.equal(core.whenPhrase("2026-11-01T23:00:00Z"), "Sunday 1 Nov at 11pm UTC");
  assert.equal(core.whenPhrase("2026-11-01T12:00:00Z"), "Sunday 1 Nov at noon UTC");
  assert.equal(core.whenPhrase("2026-11-01T09:30:00Z"), "Sunday 1 Nov at 9:30am UTC");
  assert.equal(core.timeLeft(30_000), "less than a minute");
  assert.equal(core.timeLeft(60_000), "1 minute");
  assert.equal(core.timeLeft(12 * 60_000), "12 minutes");
  assert.equal(core.timeLeft(3_600_000), "1 hour");
  assert.equal(core.timeLeft(5 * 3_600_000 + 12 * 60_000), "5 hours, 12 minutes");
  assert.equal(core.timeLeft(2 * 86_400_000 + 7 * 3_600_000 + 59_000), "2 days, 7 hours");
  assert.equal(core.timeLeft(86_400_000), "1 day");
});

console.log(`\n${passed} passed`);
