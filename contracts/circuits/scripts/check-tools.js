#!/usr/bin/env node
const { execSync } = require("child_process");

const tools = ["circom", "snarkjs"];
let missing = [];

for (const t of tools) {
  try {
    execSync(`which ${t}`, { stdio: "ignore" });
    console.log(`ok  ${t}`);
  } catch {
    missing.push(t);
    console.log(`miss ${t}`);
  }
}

console.log("");
console.log("Gloam circuits scaffold — Phase 2");
console.log("On-chain tree today: keccak (IncrementalMerkleTree).");
console.log("Circom unshield sketch uses Poseidon placeholders until hash migration.");
console.log("See README.md and unshield.spec.md");
console.log("");

if (missing.length) {
  console.log("Install:");
  console.log("  circom: https://docs.circom.io/getting-started/installation/");
  console.log("  snarkjs: npm i -g snarkjs");
  process.exitCode = 1;
} else {
  console.log("Tools present. Next: implement full circuit + trusted setup.");
}
