/**
 * SDK self-test — tree sync ordering.
 *
 * syncTree must replay every leaf-inserting event in on-chain order
 * (blockNumber, then logIndex, then sub-index within a pair), across Shielded /
 * Transferred / SealedSwapped. Getting the order wrong yields a root that will
 * not match chain and paths that fail to prove. This drives syncTree with a
 * mock client whose logs arrive deliberately out of order.
 *
 * Run after build:  node test/sync.selftest.mjs
 */
import { syncTree, assertTreeMatchesChain, SEALED_VAULT } from "../dist/index.js";

let checks = 0;
function assert(cond, msg) {
  if (!cond) {
    console.error("FAIL:", msg);
    process.exit(1);
  }
  checks++;
}

const h = (byte) => "0x" + byte.repeat(64); // distinct non-zero bytes32
const cB = h("1");
const cA = h("2");
const cT0 = h("3");
const cT1 = h("4");
const cS0 = h("5");
const cS1 = h("6");

// Logs handed back out of order on purpose. Correct insertion order is by
// (blockNumber, logIndex, subIndex):
//   cB(99,1) -> cA(100,2) -> cT0/cT1(100,5) -> cS0/cS1(101,0)
const logsByEvent = {
  Shielded: [
    { args: { commitment: cA, asset: "0x0", amount: 1n, from: "0x0" }, blockNumber: 100n, logIndex: 2, transactionHash: "0xa" },
    { args: { commitment: cB, asset: "0x0", amount: 2n, from: "0x0" }, blockNumber: 99n, logIndex: 1, transactionHash: "0xb" },
  ],
  Transferred: [
    { args: { newCommitments: [cT0, cT1] }, blockNumber: 100n, logIndex: 5, transactionHash: "0xc" },
  ],
  SealedSwapped: [
    { args: { newCommitmentOut: cS0, newCommitmentChange: cS1, assetOut: "0x0" }, blockNumber: 101n, logIndex: 0, transactionHash: "0xd" },
  ],
};

function mockClient(root) {
  return {
    async getBlockNumber() {
      return 101n;
    },
    async getLogs({ event }) {
      return logsByEvent[event.name] ?? [];
    },
    async readContract() {
      return root;
    },
  };
}

const synced = await syncTree(mockClient(), { pool: SEALED_VAULT, fromBlock: 0n });

// leaf count = 1 shield + 1 shield + 2 transfer + 2 swap
assert(synced.leafCount === 6, `leafCount: got ${synced.leafCount}, want 6`);
assert(synced.leaves.length === 6, "leaves array length 6");

// exact insertion order
const order = [cB, cA, cT0, cT1, cS0, cS1];
order.forEach((c, i) => {
  assert(
    synced.indexByCommitment.get(c.toLowerCase()) === i,
    `commitment ${c.slice(0, 6)} should be leaf ${i}, got ${synced.indexByCommitment.get(c.toLowerCase())}`
  );
});

// kinds are labelled right
assert(synced.leaves[0].kind === "shield", "leaf 0 is a shield");
assert(synced.leaves[2].kind === "transfer", "leaf 2 is a transfer");

// pathForCommitment resolves to the right leaf and verifies internally
const pB = await synced.pathForCommitment(cB);
assert(pB && pB.leafIndex === 0, "pathForCommitment(cB) -> leaf 0");
const pS1 = await synced.pathForCommitment(cS1);
assert(pS1 && pS1.leafIndex === 5, "pathForCommitment(cS1) -> leaf 5");
assert(pS1.root === pB.root, "all paths share the one current root");

// unknown commitment -> null
const pNone = await synced.pathForCommitment(h("9"));
assert(pNone === null, "unknown commitment -> null path");

// assertTreeMatchesChain: true when chain root matches, false otherwise
const ok = await assertTreeMatchesChain(mockClient(synced.root), SEALED_VAULT, synced);
assert(ok === true, "matches chain when currentRoot() == synced.root");
const bad = await assertTreeMatchesChain(mockClient("0x" + "0".repeat(64)), SEALED_VAULT, synced);
assert(bad === false, "does not match when currentRoot() differs");

console.log(`sync.selftest: ok (${checks} assertions)`);
