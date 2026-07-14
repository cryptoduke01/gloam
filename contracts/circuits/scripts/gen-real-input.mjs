#!/usr/bin/env node
/** Generate a valid Poseidon unshield input (leaf 0 of a 3-leaf tree). */
import { writeFileSync, mkdirSync } from "fs";
import { buildPoseidon } from "circomlibjs";

const DEPTH = 20;

const poseidon = await buildPoseidon();
const F = poseidon.F;
const H2 = (a, b) => F.toObject(poseidon([a, b]));
const H3 = (a, b, c) => F.toObject(poseidon([a, b, c]));

const zeros = [];
let z = 0n;
for (let i = 0; i < DEPTH; i++) {
  zeros.push(z);
  z = H2(z, z);
}

const secret = 12345678901234567890n;
const amount = 1000000000000000n;
const asset = 0n;
const recipient = 0xe1b0ddf821f1faa9402b0b8c4e66b213f877e828n;

const commitment = H3(secret, amount, asset);
const nullifier = H2(secret, commitment);
const leaves = [commitment, H3(999n, 1n, 0n), H3(888n, 2n, 0n)];

let filled = zeros.slice();
let nextIndex = 0;
let currentRoot = 0n;
for (let i = 0; i < DEPTH; i++) currentRoot = H2(currentRoot, currentRoot);

function insert(leaf) {
  let currentIndex = BigInt(nextIndex);
  let h = leaf;
  for (let i = 0; i < DEPTH; i++) {
    if (currentIndex % 2n === 0n) {
      filled[i] = h;
      h = H2(h, zeros[i]);
    } else {
      h = H2(filled[i], h);
    }
    currentIndex /= 2n;
  }
  currentRoot = h;
  nextIndex++;
}
for (const L of leaves) insert(L);

let layer = leaves.slice();
let idx = 0;
const pathElements = [];
const pathIndices = [];
for (let level = 0; level < DEPTH; level++) {
  const isRight = idx % 2 === 1;
  const siblingIdx = isRight ? idx - 1 : idx + 1;
  const sibling =
    siblingIdx >= 0 && siblingIdx < layer.length
      ? layer[siblingIdx]
      : zeros[level];
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

const input = {
  root: currentRoot.toString(),
  nullifier: nullifier.toString(),
  asset: asset.toString(),
  amount: amount.toString(),
  recipient: recipient.toString(),
  secret: secret.toString(),
  pathElements: pathElements.map((x) => x.toString()),
  pathIndices: pathIndices.map(String),
};

mkdirSync("build", { recursive: true });
mkdirSync("fixtures", { recursive: true });
writeFileSync("build/real-input.json", JSON.stringify(input, null, 2));
writeFileSync("fixtures/real-input.json", JSON.stringify(input, null, 2));
console.log("root", currentRoot.toString());
console.log("nullifier", nullifier.toString());
console.log("ok");
