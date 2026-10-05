/**
 * Proof-of-funds / proof-of-payment witness self-test.
 *
 * Builds a small pool tree with the SDK's own Merkle tree, then checks the
 * witness builders (public signals, blockers) and the verifier context. When
 * the browser artifacts exist (app/public/circuits/{funds,receipt}*), it also
 * proves each witness with snarkjs and verifies against the shipped vkey, so a
 * drift between builder and circuit (signal order, encoding) fails here.
 *
 * Run after build:  node test/proofs.selftest.mjs
 */
import { existsSync, readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import {
  IncrementalMerkleTreePoseidon,
  buildFundsWitness,
  buildReceiptWitness,
  proofContext,
  readFundsSignals,
  readReceiptSignals,
  noteCommitmentPoseidon,
  noteNullifierPoseidon,
  fieldToHex,
  FIELD_PRIME,
  FUNDS_PROOF_SLOTS,
} from "../dist/index.js";

let checks = 0;
function assert(cond, msg) {
  if (!cond) {
    console.error("FAIL:", msg);
    process.exit(1);
  }
  checks++;
}

const POOL = "0x841DC046Ea3CC842BA3A855731472c6Eb0F2d5eb";
const USD = "0x20C0000000000000000000000000000000000000";

// ── context ──
const ctxArgs = { kind: "funds", chainId: 42431, pool: POOL, verifier: "Acme Bank", expiresAt: 1_800_000_000 };
const ctx = proofContext(ctxArgs);
assert(ctx > 0n && ctx < FIELD_PRIME, "context is a field element");
assert(proofContext({ ...ctxArgs, pool: POOL.toLowerCase() }) === ctx, "pool case does not matter");
assert(proofContext({ ...ctxArgs, verifier: "Acme Bank " }) !== ctx, "label is bound exactly");
assert(proofContext({ ...ctxArgs, kind: "payment" }) !== ctx, "kind is bound");
assert(proofContext({ ...ctxArgs, chainId: 46630 }) !== ctx, "chain is bound");
assert(proofContext({ ...ctxArgs, expiresAt: ctxArgs.expiresAt + 1 }) !== ctx, "expiry is bound");

// ── tree with four USD notes + an ETH note ──
const mk = async (secret, amount, asset) => {
  const commitment = await noteCommitmentPoseidon(secret, amount, asset);
  return { secret, amount, asset, commitment, nullifier: await noteNullifierPoseidon(secret, commitment) };
};
const notes = [
  await mk(1111n, 600n, USD),
  await mk(2222n, 500n, USD),
  await mk(3333n, 250n, USD),
  await mk(4444n, 150n, USD),
  await mk(5555n, 9000n, "0x0000000000000000000000000000000000000000"),
];
const tree = new IncrementalMerkleTreePoseidon();
await tree.insert(123n);
for (const n of notes) n.leafIndex = await tree.insert(n.commitment);
const input = async (n) => ({ secretHex: fieldToHex(n.secret), amount: n.amount, path: await tree.path(n.leafIndex) });

// ── funds ──
const fw = await buildFundsWitness({ asset: USD, threshold: 1000n, context: ctx, notes: [await input(notes[0]), await input(notes[1])] });
assert(fw.blocker === null, `funds witness ready: ${fw.blocker}`);
assert(fw.total === 1100n, "funds total");
assert(fw.publicSignals.length === 4 + FUNDS_PROOF_SLOTS, "funds signal count");
const fs = readFundsSignals(fw.publicSignals);
assert(fs.root === tree.currentRoot, "funds root");
assert(fs.asset === BigInt(USD), "funds asset");
assert(fs.threshold === 1000n && fs.context === ctx, "funds threshold/context");
assert(fs.nullifiers[0] === notes[0].nullifier && fs.nullifiers[1] === notes[1].nullifier, "funds nullifiers");
assert(fs.nullifiers[2] === 0n && fs.nullifiers[3] === 0n, "empty slots have nullifier 0");
assert(fw.circomInput.pathElements.length === FUNDS_PROOF_SLOTS && fw.circomInput.pathElements[3].length === 20, "slot paths");

const below = await buildFundsWitness({ asset: USD, threshold: 1101n, context: ctx, notes: [await input(notes[0]), await input(notes[1])] });
assert(below.blocker !== null, "sum below threshold is blocked");
const dup = await buildFundsWitness({ asset: USD, threshold: 1n, context: ctx, notes: [await input(notes[0]), await input(notes[0])] });
assert(dup.blocker !== null, "duplicate note is blocked");
const wrongAsset = await buildFundsWitness({ asset: USD, threshold: 1n, context: ctx, notes: [await input(notes[4])] });
assert(wrongAsset.blocker !== null, "note of another asset is blocked");
const five = await buildFundsWitness({ asset: USD, threshold: 1n, context: ctx, notes: await Promise.all(notes.map(input)) });
assert(five.blocker !== null, "more than four notes is blocked");
const none = await buildFundsWitness({ asset: USD, threshold: 0n, context: ctx, notes: [] });
assert(none.blocker !== null, "no notes is blocked");
const stale = await input(notes[0]);
await tree.insert(77n);
const fresh = await input(notes[1]);
const mixed = await buildFundsWitness({ asset: USD, threshold: 1n, context: ctx, notes: [stale, fresh] });
assert(mixed.blocker !== null, "notes from two tree snapshots are blocked");

// ── receipt ──
const payCtx = proofContext({ ...ctxArgs, kind: "payment" });
const rHidden = await buildReceiptWitness({
  secretHex: fieldToHex(notes[0].secret), amount: 600n, asset: USD, path: await tree.path(notes[0].leafIndex),
  reveal: false, minAmount: 500n, context: payCtx,
});
assert(rHidden.blocker === null, `receipt witness ready: ${rHidden.blocker}`);
const rs = readReceiptSignals(rHidden.publicSignals);
assert(rs.commitment === notes[0].commitment && rs.minAmount === 500n, "receipt commitment/min");
assert(rs.reveal === 0n && rs.shownAmount === 0n, "hidden amount");
const rShown = await buildReceiptWitness({
  secretHex: fieldToHex(notes[0].secret), amount: 600n, asset: USD, path: await tree.path(notes[0].leafIndex),
  reveal: true, context: payCtx,
});
const rs2 = readReceiptSignals(rShown.publicSignals);
assert(rs2.reveal === 1n && rs2.shownAmount === 600n && rs2.minAmount === 600n, "shown amount");
const rTooHigh = await buildReceiptWitness({
  secretHex: fieldToHex(notes[0].secret), amount: 600n, asset: USD, path: await tree.path(notes[0].leafIndex),
  reveal: false, minAmount: 601n, context: payCtx,
});
assert(rTooHigh.blocker !== null, "minimum above the payment is blocked");

// ── prove + verify with the shipped artifacts, when present ──
const circuits = join(dirname(fileURLToPath(import.meta.url)), "../../../app/public/circuits");
let proved = 0;
if (existsSync(join(circuits, "funds_final.zkey")) && existsSync(join(circuits, "receipt_final.zkey"))) {
  const snarkjs = await import("snarkjs");
  const prove = async (name, w) => {
    const { proof, publicSignals } = await snarkjs.groth16.fullProve(
      w.circomInput,
      join(circuits, `${name}.wasm`),
      join(circuits, `${name}_final.zkey`)
    );
    const vkey = JSON.parse(readFileSync(join(circuits, `${name}_vkey.json`), "utf8"));
    assert(await snarkjs.groth16.verify(vkey, publicSignals, proof), `${name} proof verifies`);
    assert(JSON.stringify(publicSignals) === JSON.stringify(w.publicSignals), `${name} signals match the builder`);
    proved++;
  };
  // Rebuild the funds witness against the current tree (it moved above).
  const fw2 = await buildFundsWitness({
    asset: USD, threshold: 1500n, context: ctx, notes: await Promise.all(notes.slice(0, 4).map(input)),
  });
  assert(fw2.blocker === null, "four-note funds witness ready");
  await prove("funds", fw2);
  await prove("receipt", rHidden);
  await prove("receipt", rShown);
  // snarkjs keeps curve worker threads alive.
  globalThis.curve_bn128?.terminate?.();
}

console.log(`proofs.selftest: ok (${checks} assertions${proved ? `, ${proved} proofs verified` : ", artifacts absent: proving skipped"})`);
process.exit(0);
