/**
 * SDK self-test: keepTree, the tree kept between reads.
 *
 * The tree a read gives must be the tree a full rebuild gives, every time. The
 * mock chain works out true roots with the real Poseidon tree, per block, so each
 * read is checked against syncTree over the same chain. The cases are the ways a
 * kept tree goes wrong: a leaf a read missed, a reorg, a node behind, a failed read,
 * another chain with the same vault address, and readers sharing one tree.
 *
 * Run after build:  node test/keepTree.selftest.mjs
 */
import { IncrementalMerkleTreePoseidon, fieldToHex, hexToField, keepTree, syncTree } from "../dist/index.js";

let checks = 0;
function assert(cond, msg) {
  if (!cond) {
    console.error("FAIL:", msg);
    process.exit(1);
  }
  checks++;
}

const POOL = "0x39e28cde55cab798874746ac52cb4b5cc99a0194";
const OTHER_POOL = "0x465EbfcdE1e384C7B1e8388E1aFEA95438c7A0ef";
let unique = 1;
const leaf = () => `0x${(unique++).toString(16).padStart(64, "0")}`;

/** A pool: blocks of events, a true root at each block, and a record of what was asked. */
function mockChain(chainId = 4663) {
  const blocks = new Map(); // block -> [{ name, args, logIndex }]
  let head = 1000n;
  const chain = {
    asked: [],
    rootReads: 0,
    /** Hide these event names from getLogs for this many reads. */
    hide: { names: [], reads: 0 },
    /** A getLogs call for this event throws. */
    failLogs: null,
    failRoot: false,
    /** getBlockNumber answers this instead of the head. */
    behind: null,
    delayMs: 0,
    /** A block lands just after the next head is read, as one will on a busy chain. */
    mineAfterHead: false,
    mine(...events) {
      head += 1n;
      blocks.set(head, events.map((e, i) => ({ ...e, logIndex: i })));
      return head;
    },
    shield(c = leaf()) {
      chain.mine({ name: "Shielded", args: { commitment: c, asset: "0x0", amount: 1n, from: "0x0" } });
      return c;
    },
    transfer(a = leaf(), b = leaf()) {
      chain.mine({ name: "Transferred", args: { newCommitments: [a, b] } });
      return [a, b];
    },
    swap(a = leaf(), b = leaf()) {
      chain.mine({ name: "SealedSwapped", args: { newCommitmentOut: a, newCommitmentChange: b, assetOut: "0x0" } });
      return [a, b];
    },
    /** Drop every block from `from` up, as a reorg would, then build on the new tip. */
    reorg(from) {
      for (const b of [...blocks.keys()]) if (b >= from) blocks.delete(b);
    },
    async rootAt(block) {
      const tree = new IncrementalMerkleTreePoseidon();
      await tree.init();
      for (const b of [...blocks.keys()].sort((x, y) => (x < y ? -1 : 1))) {
        if (b > block) break;
        for (const e of blocks.get(b)) {
          const out = e.name === "Shielded" ? [e.args.commitment] : e.name === "Transferred" ? e.args.newCommitments : [e.args.newCommitmentOut, e.args.newCommitmentChange];
          for (const c of out) await tree.insert(hexToField(c));
        }
      }
      return fieldToHex(tree.currentRoot);
    },
    client: {
      async getChainId() {
        return chainId;
      },
      async getBlockNumber() {
        const now = chain.behind ?? head;
        if (chain.mineAfterHead) {
          chain.mineAfterHead = false;
          chain.shield();
        }
        return now;
      },
      async getLogs({ event, fromBlock, toBlock }) {
        chain.asked.push({ name: event.name, fromBlock, toBlock });
        if (chain.delayMs) await new Promise((r) => setTimeout(r, chain.delayMs));
        if (chain.failLogs === event.name) throw new Error("the node dropped out");
        const out = [];
        for (const [block, events] of blocks) {
          if (block < fromBlock || block > toBlock) continue;
          for (const e of events) if (e.name === event.name) out.push({ args: e.args, blockNumber: block, logIndex: e.logIndex, transactionHash: "0xa" });
        }
        if (chain.hide.reads > 0 && chain.hide.names.includes(event.name)) {
          chain.hide.reads -= 1;
          return [];
        }
        return out;
      },
      async readContract({ functionName, blockNumber }) {
        if (functionName !== "currentRoot") throw new Error(`unexpected read ${functionName}`);
        chain.rootReads += 1;
        if (chain.failRoot) throw new Error("no answer");
        return chain.rootAt(blockNumber ?? head);
      },
    },
  };
  return chain;
}

const params = { pool: POOL, fromBlock: 1000n };
const quick = () => keepTree({ retryMs: 1 });

/** The kept read must equal a full rebuild of the same chain, path for path. */
async function sameAsRebuilt(chain, read, label, p = params) {
  const kept = await read(chain.client, p);
  const asked = chain.asked.length;
  const full = await syncTree(chain.client, p);
  chain.asked.length = asked;
  assert(kept.root === full.root, `${label}: root`);
  assert(kept.root === (await chain.rootAt(await chain.client.getBlockNumber())), `${label}: the chain's own root`);
  assert(kept.leafCount === full.leafCount, `${label}: leaf count`);
  assert(kept.leaves.map((l) => l.commitment).join() === full.leaves.map((l) => l.commitment).join(), `${label}: the leaf list`);
  for (const l of full.leaves) {
    const a = await kept.pathForCommitment(l.commitment);
    const b = await full.pathForCommitment(l.commitment);
    assert(a && b && a.leafIndex === b.leafIndex && a.root === b.root && a.pathElements.join() === b.pathElements.join(), `${label}: path of leaf ${l.leafIndex}`);
  }
  return kept;
}

const fullReads = (chain) => chain.asked.filter((a) => a.name === "Shielded" && a.fromBlock === 1000n).length;

// ── a later read costs the new blocks, and gives the same tree ────────────────
{
  const chain = mockChain();
  const read = quick();
  chain.shield();
  chain.transfer();
  chain.swap();
  await sameAsRebuilt(chain, read, "first read");
  const head = await chain.client.getBlockNumber();
  chain.asked.length = 0;
  await sameAsRebuilt(chain, read, "nothing new");
  assert(chain.asked.every((a) => a.fromBlock === head + 1n), "nothing new: no old block read again");

  chain.shield();
  chain.transfer();
  chain.swap();
  chain.asked.length = 0;
  await sameAsRebuilt(chain, read, "three new blocks");
  assert(chain.asked.length === 3, "one read of each event");
  assert(chain.asked.every((a) => a.fromBlock === head + 1n), "from the block after the last proved one");
  assert(new Set(chain.asked.map((a) => a.toBlock)).size === 1, "all three events read to one head");
}

// ── a block landing during a read upsets nothing, and is picked up by the next ─
{
  const chain = mockChain();
  const read = quick();
  chain.shield();
  await read(chain.client, params);
  chain.shield();
  chain.mineAfterHead = true;
  chain.asked.length = 0;
  const kept = await read(chain.client, params);
  assert(chain.asked.length === 3, "no second try: the root is read at the block the logs were read to");
  assert(new Set(chain.asked.map((a) => a.toBlock)).size === 1 && kept.leafCount === 2, "and every event stopped at that block");
  await sameAsRebuilt(chain, read, "the block that landed during the read");
  chain.asked.length = 0;
  await read(chain.client, params);
  assert(fullReads(chain) === 0, "all with no rebuild");
}

// ── order inside a block, across events ──────────────────────────────────────
{
  const chain = mockChain();
  const read = quick();
  chain.shield();
  await read(chain.client, params);
  const [s, t0, t1, a, b] = [leaf(), leaf(), leaf(), leaf(), leaf()];
  chain.mine(
    { name: "Transferred", args: { newCommitments: [t0, t1] } },
    { name: "Shielded", args: { commitment: s, asset: "0x0", amount: 1n, from: "0x0" } },
    { name: "SealedSwapped", args: { newCommitmentOut: a, newCommitmentChange: b, assetOut: "0x0" } }
  );
  const kept = await sameAsRebuilt(chain, read, "one block, three events");
  assert(kept.indexByCommitment.get(t0.toLowerCase()) < kept.indexByCommitment.get(s.toLowerCase()), "log order holds in a kept read");
}

// ── the trap: a read that missed a leaf must not move past it ─────────────────
{
  const chain = mockChain();
  const read = quick();
  chain.shield();
  await read(chain.client, params);
  const proved = await chain.client.getBlockNumber();
  chain.shield(); // read fine each time, so a try that fails has already inserted something
  const [pay] = chain.transfer();
  // A node behind on logs: the first two looks have no Transferred, and the older root is still a real one.
  chain.hide = { names: ["Transferred"], reads: 2 };
  chain.asked.length = 0;
  const kept = await read(chain.client, params);
  assert(await kept.pathForCommitment(pay), "the leaf comes through once the node catches up");
  assert(chain.asked.filter((a) => a.name === "Shielded" && a.fromBlock === proved + 1n).length === 3, "read again, from the same block");
  assert(fullReads(chain) === 0, "with no rebuild");
  await sameAsRebuilt(chain, read, "after a missed leaf");
}

// ── a read that keeps missing it falls back to a full read, not a wrong tree ──
{
  const chain = mockChain();
  const read = quick();
  chain.shield();
  await read(chain.client, params);
  const [pay] = chain.transfer();
  chain.hide = { names: ["Transferred"], reads: 3 };
  chain.asked.length = 0;
  const kept = await read(chain.client, params);
  assert(fullReads(chain) === 1, "rebuilt once");
  assert(await kept.pathForCommitment(pay), "the rebuild has the leaf");
  await sameAsRebuilt(chain, read, "after a rebuild");
}

// ── a failed SealedSwapped read is swallowed as empty: that must not stick ────
{
  const chain = mockChain();
  const read = quick();
  chain.shield();
  await read(chain.client, params);
  const [out] = chain.swap();
  chain.failLogs = "SealedSwapped";
  const during = await read(chain.client, params);
  assert(chain.asked.filter((a) => a.name === "Shielded" && a.fromBlock === 1000n).length === 2, "a kept read that can't prove itself rebuilds");
  assert(!(await during.pathForCommitment(out)), "and what it can't see it does not claim");
  chain.failLogs = null;
  const after = await sameAsRebuilt(chain, read, "once the read works again");
  assert(await after.pathForCommitment(out), "the swap's leaf is there");
}

// ── a reorg heals itself ──────────────────────────────────────────────────────
{
  const chain = mockChain();
  const read = quick();
  chain.shield();
  chain.shield();
  const reorged = chain.shield();
  await read(chain.client, params);
  chain.reorg(await chain.client.getBlockNumber());
  const replaced = chain.shield();
  chain.shield();
  chain.asked.length = 0;
  const kept = await sameAsRebuilt(chain, read, "after a reorg");
  assert(fullReads(chain) === 1, "a reorg rebuilds");
  assert(!(await kept.pathForCommitment(reorged)), "the dropped leaf is gone");
  assert(await kept.pathForCommitment(replaced), "the new one is there");
}

// ── a node behind the proved block gives what is held, and loses nothing ──────
{
  const chain = mockChain();
  const read = quick();
  const a = chain.shield();
  await read(chain.client, params);
  const proved = await chain.client.getBlockNumber();
  chain.shield();
  await read(chain.client, params);
  chain.behind = proved;
  chain.asked.length = 0;
  const kept = await read(chain.client, params);
  assert(chain.asked.length === 0, "nothing to read from a node behind");
  assert(kept.leafCount === 2 && (await kept.pathForCommitment(a)), "the tree does not go backwards");
  kept.leaves.length = 0;
  await kept.tree.insert(hexToField(leaf()));
  chain.behind = null;
  chain.asked.length = 0;
  await sameAsRebuilt(chain, read, "after a node behind");
  assert(fullReads(chain) === 0, "a caller changing what a node behind gave costs no rebuild");
}

// ── a root that can't be read is never kept ───────────────────────────────────
{
  const chain = mockChain();
  const read = quick();
  chain.shield();
  chain.failRoot = true;
  const first = await read(chain.client, params);
  assert(first.leafCount === 1, "still answers, as syncTree would");
  chain.failRoot = false;
  chain.asked.length = 0;
  await read(chain.client, params);
  assert(fullReads(chain) === 1, "nothing was kept, so the next read is a full one");
  await sameAsRebuilt(chain, read, "once the root can be read");
  chain.asked.length = 0;
  await read(chain.client, params);
  assert(fullReads(chain) === 0, "and now it is kept");
}

// ── a read that throws leaves the kept tree as it was ─────────────────────────
{
  const chain = mockChain();
  const read = quick();
  chain.shield();
  await read(chain.client, params);
  chain.shield();
  chain.failLogs = "Shielded";
  let threw = false;
  await read(chain.client, params).catch(() => (threw = true));
  assert(threw, "the failure reaches the caller");
  chain.failLogs = null;
  chain.asked.length = 0;
  await sameAsRebuilt(chain, read, "after a failed read");
  assert(fullReads(chain) === 0, "the kept tree survives it");
}

// ── same address, another chain or pool: never the same tree ──────────────────
{
  const rh = mockChain(4663);
  const base = mockChain(8453);
  const read = quick();
  const onRh = rh.shield();
  const onBase = base.shield();
  const a = await read(rh.client, params);
  const b = await read(base.client, params);
  assert(a.root !== b.root, "each chain has its own tree");
  assert(!(await a.pathForCommitment(onBase)) && !(await b.pathForCommitment(onRh)), "no leaf crosses chains");
  await sameAsRebuilt(rh, read, "chain one again");
  await sameAsRebuilt(base, read, "chain two again");

  const other = await read(rh.client, { pool: OTHER_POOL, fromBlock: 1000n });
  assert(rh.asked.some((x) => x.fromBlock === 1000n), "another pool starts from its own start");
  assert(other.leafCount === 1, "the mock's pool answers");
  rh.asked.length = 0;
  await read(rh.client, { pool: POOL.toUpperCase().replace("0X", "0x"), fromBlock: 1000n });
  assert(fullReads(rh) === 0, "an address is the same address in any case");
  await read(rh.client, { pool: POOL, fromBlock: 1001n });
  assert(rh.asked.some((x) => x.fromBlock === 1001n), "another start is another tree");
}

// ── a tree handed out never changes ───────────────────────────────────────────
{
  const chain = mockChain();
  const read = quick();
  const a = chain.shield();
  const before = await read(chain.client, params);
  const root = before.root;
  const path = await before.pathForCommitment(a);
  const b = chain.shield();
  const after = await read(chain.client, params);
  assert(before.root === root && before.leafCount === 1 && before.tree.nextIndex === 1 && before.leaves.length === 1, "the earlier tree stands");
  assert(!(await before.pathForCommitment(b)), "and does not have the later leaf");
  const again = await before.pathForCommitment(a);
  assert(again.root === path.root && again.pathElements.join() === path.pathElements.join(), "its paths don't move");
  assert(after.root !== root, "the later read moved on");
  // The tree a read just gave, which is the one most like the kept one.
  after.leaves.length = 0;
  after.indexByCommitment.clear();
  await after.tree.insert(hexToField(leaf()));
  chain.shield();
  chain.asked.length = 0;
  await sameAsRebuilt(chain, read, "a caller changing its copy changes nothing kept");
  assert(fullReads(chain) === 0, "and costs no rebuild");
}

// ── reads at once take turns ──────────────────────────────────────────────────
{
  const chain = mockChain();
  const read = quick();
  const all = [chain.shield(), chain.shield(), chain.shield()];
  chain.delayMs = 5;
  const reads = await Promise.all(Array.from({ length: 6 }, () => read(chain.client, params)));
  chain.delayMs = 0;
  assert(new Set(reads.map((r) => r.root)).size === 1, "one root");
  for (const r of reads) for (const c of all) assert(await r.pathForCommitment(c), "every reader has every leaf");
  assert(fullReads(chain) === 1, "one full read, however many readers");
  await sameAsRebuilt(chain, read, "after reads at once");

  chain.failLogs = "Shielded";
  chain.shield();
  const [x, y] = await Promise.allSettled([read(chain.client, params), read(chain.client, params)]);
  assert(x.status === "rejected" && y.status === "rejected", "a failed read fails its own caller");
  chain.failLogs = null;
  await sameAsRebuilt(chain, read, "the queue survives a failed read");
}

// ── clone ─────────────────────────────────────────────────────────────────────
{
  const t = new IncrementalMerkleTreePoseidon();
  await t.init();
  await t.insert(5n);
  const c = t.clone();
  await c.insert(6n);
  assert(t.nextIndex === 1 && c.nextIndex === 2 && t.currentRoot !== c.currentRoot, "a clone is independent");
  await t.insert(6n);
  assert(t.currentRoot === c.currentRoot, "and the same inserts give the same root");
  assert((await c.path(0)).root === c.currentRoot, "and its paths verify");

  // Two trees that go different ways must each match one built straight.
  const built = async (...leaves) => {
    const b = new IncrementalMerkleTreePoseidon();
    await b.init();
    for (const l of leaves) await b.insert(l);
    return b.currentRoot;
  };
  const left = new IncrementalMerkleTreePoseidon();
  await left.init();
  await left.insert(1n);
  const right = left.clone();
  for (const l of [2n, 3n, 4n]) await left.insert(l);
  for (const l of [7n, 8n, 9n]) await right.insert(l);
  assert(left.currentRoot === (await built(1n, 2n, 3n, 4n)), "the original went its own way");
  assert(right.currentRoot === (await built(1n, 7n, 8n, 9n)), "and so did the clone");
  assert(left.leaves.length === 4 && right.leaves.length === 4 && (await right.path(3)).leaf === 9n, "each with its own leaves");
}

console.log(`keepTree selftest: ${checks} checks passed`);
