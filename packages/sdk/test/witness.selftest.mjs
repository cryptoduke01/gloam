/**
 * SDK witness parity self-test.
 *
 * Rebuilds the exact fixture tree from contracts/circuits gen-real-input.mjs,
 * then asserts the ported Merkle tree + note + unshield witness reproduce the
 * root and nullifier that ShieldPoolPoseidon.t.sol proves on-chain. A wrong port
 * of any of merkle / poseidon / note / witness changes these values.
 *
 * Run after build:  node test/witness.selftest.mjs
 */
import {
  IncrementalMerkleTreePoseidon,
  buildPoseidonUnshieldWitness,
  poseidon3,
  fieldToHex,
  NATIVE_ASSET,
} from "../dist/index.js";

let checks = 0;
function assert(cond, msg) {
  if (!cond) {
    console.error("FAIL:", msg);
    process.exit(1);
  }
  checks++;
}

const SECRET = 12345678901234567890n;
const AMOUNT = 1000000000000000n; // 1e15
const RECIPIENT = "0xe1b0ddf821f1faa9402b0b8c4e66b213f877e828";

// Known good values (contracts/test/ShieldPoolPoseidon.t.sol):
const EXPECTED_ROOT =
  13234193652734635164697424209615330599412255191967788575267034634808796923137n;
const EXPECTED_NULLIFIER =
  1945704986784996205275124157419427994886512646982192210318468338970744312245n;
const RECIPIENT_FIELD = 1288467190840644149448244075784839353812473341992n;

// Same three leaves, same order, as gen-real-input.mjs.
const leaf0 = await poseidon3(SECRET, AMOUNT, 0n);
const leaf1 = await poseidon3(999n, 1n, 0n);
const leaf2 = await poseidon3(888n, 2n, 0n);

const tree = new IncrementalMerkleTreePoseidon();
await tree.insert(leaf0);
await tree.insert(leaf1);
await tree.insert(leaf2);
const path = await tree.path(0);

assert(path.root === EXPECTED_ROOT, `merkle root parity: got ${path.root}`);
assert(path.leaf === leaf0, "path leaf is leaf0");

const w = await buildPoseidonUnshieldWitness({
  secretHex: fieldToHex(SECRET),
  amount: AMOUNT,
  asset: NATIVE_ASSET,
  to: RECIPIENT,
  path,
});

assert(w.readyToProve === true, "commitment opens the leaf");
assert(w.publicInputs.root === EXPECTED_ROOT, "witness root parity");
assert(
  w.publicInputs.nullifier === EXPECTED_NULLIFIER,
  `witness nullifier parity: got ${w.publicInputs.nullifier}`
);
assert(w.publicInputs.recipient === RECIPIENT_FIELD, "recipient field");
assert(w.publicInputs.amount === AMOUNT, "amount public input");
assert(w.circomInput.amount === AMOUNT.toString(), "circom amount");
assert(Array.isArray(w.circomInput.pathElements) && w.circomInput.pathElements.length === 20, "20 path elements");

console.log(`witness.selftest: ok (${checks} assertions)`);
