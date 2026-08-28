/**
 * SDK self-test — Poseidon note parity + shield intent shape.
 *
 * Asserts the SDK's note commitment matches the exact fixture the app and the
 * circuits use (a wrong port would change this value), and that buildShieldIntent
 * produces a well-formed unsigned intent.
 *
 * Run after build:  node test/note.selftest.mjs
 */
import {
  noteCommitmentPoseidon,
  noteNullifierPoseidon,
  buildShieldIntent,
  NATIVE_ASSET,
  SEALED_VAULT,
  RH_TESTNET_CHAIN_ID,
} from "../dist/index.js";

let checks = 0;
function assert(cond, msg) {
  if (!cond) {
    console.error("FAIL:", msg);
    process.exit(1);
  }
  checks++;
}

// Fixture from contracts/circuits gen-real-input.mjs + ShieldPoolPoseidon.t.sol:
// commitment = Poseidon(secret=12345678901234567890, amount=1e15, asset=0)
const SECRET = 12345678901234567890n;
const AMOUNT = 1000000000000000n;
const EXPECTED_COMMITMENT =
  11179136681126804365240602711725845052065738228952456689860115672198330107473n;

const c = await noteCommitmentPoseidon(SECRET, AMOUNT, NATIVE_ASSET);
assert(
  c === EXPECTED_COMMITMENT,
  `commitment parity broken: got ${c}, want ${EXPECTED_COMMITMENT}`
);

// Nullifier is deterministic and distinct from the commitment.
const n = await noteNullifierPoseidon(SECRET, c);
assert(typeof n === "bigint" && n > 0n && n !== c, "nullifier must be a distinct field element");

// buildShieldIntent: shape + native value handling + real commitment.
const intent = await buildShieldIntent({ amountWei: AMOUNT });
assert(intent.intent === "shield", "intent kind");
assert(intent.chainId === RH_TESTNET_CHAIN_ID, "chainId defaults to RH testnet");
assert(intent.exec.poolAddress === SEALED_VAULT, "exec targets the sealed vault");
assert(intent.exec.fn === "shield", "exec fn");
assert(intent.exec.valueWei === AMOUNT, "native shield attaches value");
assert(intent.exec.args.length === 3, "shield args = [asset, amount, commitment]");
assert(intent.exec.args[0] === NATIVE_ASSET, "asset arg is native");
assert(intent.exec.args[1] === AMOUNT, "amount arg in wei");
assert(/^0x[0-9a-f]{64}$/.test(intent.exec.args[2]), "commitment is bytes32 hex");
assert(intent.note.secret && intent.note.commitment && intent.note.nullifier, "note material returned");
assert(intent.exec.args[2] === intent.note.commitment, "exec commitment matches note");

console.log(`note.selftest: ok (${checks} assertions)`);
