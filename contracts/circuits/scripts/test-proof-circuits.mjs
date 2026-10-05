#!/usr/bin/env node
/**
 * Witness + proof tests for the proof-of-funds (solvency) and proof-of-payment
 * (receipt) circuits. Builds a synthetic depth-20 Poseidon tree (same hashing as
 * the pool), then checks that honest inputs prove + verify and that every
 * cheating input fails to produce a witness (or fails verification when only a
 * public signal is tampered after proving).
 *
 *   cd contracts/circuits
 *   node scripts/build-proof-circuits.mjs   # once, needs build/{solvency,receipt}
 *   node scripts/test-proof-circuits.mjs
 */
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { buildPoseidon } from "circomlibjs";
import * as snarkjs from "snarkjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const build = join(__dirname, "../build");
const DEPTH = 20;
const N = 4;

const art = (name) => ({
  wasm: join(build, name, `${name}_js`, `${name}.wasm`),
  zkey: join(build, name, `${name}_final.zkey`),
  vkey: JSON.parse(readFileSync(join(build, name, `${name}_vkey.json`), "utf8")),
});
const SOLVENCY = art("solvency");
const RECEIPT = art("receipt");

const poseidon = await buildPoseidon();
const F = poseidon.F;
const H2 = (a, b) => F.toObject(poseidon([a, b]));
const H3 = (a, b, c) => F.toObject(poseidon([a, b, c]));

const zeros = [];
{
  let z = 0n;
  for (let i = 0; i < DEPTH; i++) {
    zeros.push(z);
    z = H2(z, z);
  }
}

/** Root + path of leaf `idx` in a tree holding `leaves` (rest zero-filled). */
function pathOf(leaves, idx) {
  let layer = leaves.slice();
  let i = idx;
  const pathElements = [];
  const pathIndices = [];
  for (let level = 0; level < DEPTH; level++) {
    const sib = i % 2 ? i - 1 : i + 1;
    pathElements.push(sib < layer.length ? layer[sib] : zeros[level]);
    pathIndices.push(i % 2);
    const next = [];
    for (let k = 0; k < layer.length; k += 2) {
      next.push(H2(layer[k], k + 1 < layer.length ? layer[k + 1] : zeros[level]));
    }
    layer = next;
    i = Math.floor(i / 2);
  }
  return { root: layer[0], pathElements, pathIndices };
}

// ── fixture: a small pool with notes of two assets ──
const USD = 0x20c0000000000000000000000000000000000000n; // stand-in token address
const ETH = 0n;
const notes = [
  { secret: 1111n, amount: 600n, asset: USD },
  { secret: 2222n, amount: 500n, asset: USD },
  { secret: 3333n, amount: 250n, asset: USD },
  { secret: 4444n, amount: 150n, asset: USD },
  { secret: 5555n, amount: 9_000n, asset: ETH },
  { secret: 0n, amount: 700n, asset: USD }, // degenerate zero-secret leaf
];
for (const n of notes) {
  n.commitment = H3(n.secret, n.amount, n.asset);
  n.nullifier = H2(n.secret, n.commitment);
}
const leaves = [H3(9n, 1n, 0n), ...notes.map((n) => n.commitment), H3(8n, 2n, 0n)];
const leafIndex = (n) => leaves.indexOf(n.commitment);
const ROOT = pathOf(leaves, 0).root;
const OTHER_ROOT = pathOf([...leaves, H3(7n, 3n, 0n)], 0).root;
const CONTEXT = 0x1234567890abcdefn;

const S = (x) => x.toString();
const emptySlot = () => ({
  used: "0",
  secret: "0",
  amount: "0",
  pathElements: Array(DEPTH).fill("0"),
  pathIndices: Array(DEPTH).fill("0"),
  nullifier: "0",
});
function usedSlot(n) {
  const p = pathOf(leaves, leafIndex(n));
  return {
    used: "1",
    secret: S(n.secret),
    amount: S(n.amount),
    pathElements: p.pathElements.map(S),
    pathIndices: p.pathIndices.map(S),
    nullifier: S(n.nullifier),
  };
}
function fundsInput(slots, { threshold, asset = USD, root = ROOT, context = CONTEXT } = {}) {
  const all = [...slots, ...Array(N - slots.length).fill(null).map(emptySlot)];
  return {
    root: S(root),
    asset: S(asset),
    threshold: S(threshold),
    context: S(context),
    nullifier: all.map((s) => s.nullifier),
    used: all.map((s) => s.used),
    secret: all.map((s) => s.secret),
    amount: all.map((s) => s.amount),
    pathElements: all.map((s) => s.pathElements),
    pathIndices: all.map((s) => s.pathIndices),
  };
}
function receiptInput(n, { reveal, shownAmount, minAmount, root = ROOT, commitment, context = CONTEXT }) {
  const p = pathOf(leaves, leafIndex(n));
  return {
    root: S(root),
    commitment: S(commitment ?? n.commitment),
    asset: S(n.asset),
    minAmount: S(minAmount),
    reveal: S(reveal),
    shownAmount: S(shownAmount),
    context: S(context),
    secret: S(n.secret),
    amount: S(n.amount),
    pathElements: p.pathElements.map(S),
    pathIndices: p.pathIndices.map(S),
  };
}

// ── harness ──
let passed = 0;
let failed = 0;
function report(ok, name, extra = "") {
  if (ok) passed++;
  else failed++;
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${extra ? `  (${extra})` : ""}`);
}

async function proves(name, c, input, expectSignals) {
  try {
    const t0 = Date.now();
    const { proof, publicSignals } = await snarkjs.groth16.fullProve(input, c.wasm, c.zkey);
    const ms = Date.now() - t0;
    const ok = await snarkjs.groth16.verify(c.vkey, publicSignals, proof);
    const orderOk = !expectSignals || expectSignals.every((v, i) => publicSignals[i] === S(v));
    report(ok && orderOk, name, `prove ${ms} ms${orderOk ? "" : ", signal order mismatch"}`);
    return { proof, publicSignals };
  } catch (e) {
    report(false, name, e.message.split("\n")[0]);
    return null;
  }
}

async function rejects(name, c, input) {
  try {
    await snarkjs.wtns.calculate(input, c.wasm, { type: "mem" });
    report(false, name, "witness was produced");
  } catch {
    report(true, name);
  }
}

async function tamperFails(name, c, proved, idx, value) {
  if (!proved) return report(false, name, "no base proof");
  const signals = proved.publicSignals.slice();
  signals[idx] = S(value);
  const ok = await snarkjs.groth16.verify(c.vkey, signals, proved.proof);
  report(!ok, name);
}

const [a, b, c3, d, eth, zero] = notes;

console.log("\n# proof of funds (solvency)");
const funds = await proves(
  "two notes, 600 + 500 >= 1000, two empty slots",
  SOLVENCY,
  fundsInput([usedSlot(a), usedSlot(b)], { threshold: 1000n }),
  [ROOT, USD, 1000n, CONTEXT, a.nullifier, b.nullifier, 0n, 0n]
);
await proves(
  "four notes, threshold exactly equal to the sum (1500)",
  SOLVENCY,
  fundsInput([usedSlot(a), usedSlot(b), usedSlot(c3), usedSlot(d)], { threshold: 1500n })
);
await proves(
  "used slot after an empty one",
  SOLVENCY,
  fundsInput([emptySlot(), usedSlot(c3)], { threshold: 1n })
);
await rejects("sum below threshold (1100 < 1101)", SOLVENCY, fundsInput([usedSlot(a), usedSlot(b)], { threshold: 1101n }));
await rejects("wrong root", SOLVENCY, fundsInput([usedSlot(a), usedSlot(b)], { threshold: 1000n, root: OTHER_ROOT }));
{
  const bad = usedSlot(a);
  bad.pathElements[3] = "12345";
  await rejects("broken membership path", SOLVENCY, fundsInput([bad, usedSlot(b)], { threshold: 1000n }));
}
{
  // A note that was never inserted: same secret, inflated amount.
  const fake = usedSlot(a);
  fake.amount = "60000";
  await rejects("note not in the tree (inflated amount)", SOLVENCY, fundsInput([fake], { threshold: 1000n }));
}
await rejects("note of another asset claimed as USD", SOLVENCY, fundsInput([{ ...usedSlot(eth) }], { threshold: 1000n }));
await rejects("used slot with a zero secret", SOLVENCY, fundsInput([usedSlot(zero)], { threshold: 700n }));
{
  const s = usedSlot(a);
  s.nullifier = S(b.nullifier);
  await rejects("used slot with someone else's nullifier", SOLVENCY, fundsInput([s, usedSlot(b)], { threshold: 1000n }));
}
{
  const ghost = emptySlot();
  ghost.amount = "5000";
  await rejects("empty slot carrying an amount", SOLVENCY, fundsInput([usedSlot(a), ghost], { threshold: 1000n }));
}
{
  const ghost = emptySlot();
  ghost.nullifier = "77";
  await rejects("empty slot with a non-zero nullifier", SOLVENCY, fundsInput([usedSlot(a), ghost], { threshold: 600n }));
}
{
  const s = usedSlot(a);
  s.used = "2";
  await rejects("non-boolean used flag", SOLVENCY, fundsInput([s], { threshold: 600n }));
}
await rejects("no notes used, threshold 0", SOLVENCY, fundsInput([], { threshold: 0n }));
await rejects("threshold out of range (2^128)", SOLVENCY, fundsInput([usedSlot(a)], { threshold: 1n << 128n }));
await tamperFails("tampered threshold signal fails verify", SOLVENCY, funds, 2, 900n);
await tamperFails("tampered context signal fails verify", SOLVENCY, funds, 3, CONTEXT + 1n);
await tamperFails("dropped nullifier signal fails verify", SOLVENCY, funds, 5, 0n);

console.log("\n# proof of payment (receipt)");
const shown = await proves(
  "reveal = 1, shows the exact amount",
  RECEIPT,
  receiptInput(a, { reveal: 1, shownAmount: a.amount, minAmount: a.amount }),
  [ROOT, a.commitment, USD, a.amount, 1n, a.amount, CONTEXT]
);
const hidden = await proves(
  "reveal = 0, amount hidden, at least 500",
  RECEIPT,
  receiptInput(a, { reveal: 0, shownAmount: 0n, minAmount: 500n }),
  [ROOT, a.commitment, USD, 500n, 0n, 0n, CONTEXT]
);
await rejects("reveal = 0 with a non-zero shownAmount", RECEIPT, receiptInput(a, { reveal: 0, shownAmount: a.amount, minAmount: 0n }));
await rejects("reveal = 1 with a wrong shownAmount", RECEIPT, receiptInput(a, { reveal: 1, shownAmount: 999n, minAmount: 0n }));
await rejects("non-boolean reveal", RECEIPT, receiptInput(a, { reveal: 2, shownAmount: 1200n, minAmount: 0n }));
await rejects("amount below minAmount (600 < 601)", RECEIPT, receiptInput(a, { reveal: 0, shownAmount: 0n, minAmount: 601n }));
await rejects("minAmount out of range (2^128)", RECEIPT, receiptInput(a, { reveal: 0, shownAmount: 0n, minAmount: 1n << 128n }));
await rejects("wrong root", RECEIPT, receiptInput(a, { reveal: 0, shownAmount: 0n, minAmount: 1n, root: OTHER_ROOT }));
await rejects("commitment of another note", RECEIPT, receiptInput(a, { reveal: 0, shownAmount: 0n, minAmount: 1n, commitment: b.commitment }));
await rejects("zero-secret note", RECEIPT, receiptInput(zero, { reveal: 0, shownAmount: 0n, minAmount: 1n }));
{
  const inp = receiptInput(a, { reveal: 0, shownAmount: 0n, minAmount: 1n });
  inp.pathElements[0] = "42";
  await rejects("broken membership path", RECEIPT, inp);
}
await tamperFails("tampered shownAmount signal fails verify", RECEIPT, shown, 5, 601n);
await tamperFails("flipped reveal signal fails verify", RECEIPT, hidden, 4, 1n);
await tamperFails("tampered context signal fails verify", RECEIPT, hidden, 6, CONTEXT + 1n);

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
