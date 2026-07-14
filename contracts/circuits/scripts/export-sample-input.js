#!/usr/bin/env node
/**
 * Write a dummy circom input matching Unshield(20) signal names.
 * Real inputs come from the app "Download JSON" → circomInput field.
 */
const fs = require("fs");
const path = require("path");

const DEPTH = 20;
const zeros = Array(DEPTH).fill("0");
const indices = Array(DEPTH).fill("0");

const input = {
  root: "1",
  nullifier: "2",
  asset: "0",
  amount: "1000000000000000",
  recipient: "3",
  secret: "4",
  pathElements: zeros,
  pathIndices: indices,
};

const outDir = path.join(__dirname, "..", "build");
fs.mkdirSync(outDir, { recursive: true });
const out = path.join(outDir, "sample-input.json");
fs.writeFileSync(out, JSON.stringify(input, null, 2));
console.log("wrote", out);
