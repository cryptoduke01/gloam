#!/usr/bin/env node
/**
 * PoC — the shield circuit binds note value to the deposited amount (C1 fix).
 *   honest-shield.json : commitment = Poseidon(secret, 1, asset), public amount = 1  → accepted
 *   lying-shield.json  : commitment = Poseidon(secret, 1e18, asset), public amount = 1 → REJECTED
 * The lying case is exactly the C1 attack: deposit 1, embed 1e18 in the commitment.
 */
import { writeFileSync, mkdirSync } from "fs";
import { buildPoseidon } from "circomlibjs";

const poseidon = await buildPoseidon();
const F = poseidon.F;
const H3 = (a, b, c) => F.toObject(poseidon([a, b, c]));

const secret = 987654321n;
const asset = 0n;

// Honest: committed amount == public amount == 1
const honestCommit = H3(secret, 1n, asset);
const honest = {
  commitment: honestCommit.toString(),
  amount: "1",
  asset: asset.toString(),
  secret: secret.toString(),
};

// Lying: committed amount = 1e18 but the depositor only sends amount = 1
const lyingCommit = H3(secret, 1000000000000000000n, asset);
const lying = {
  commitment: lyingCommit.toString(), // encodes 1e18
  amount: "1", // but claims to deposit 1
  asset: asset.toString(),
  secret: secret.toString(),
};

mkdirSync("build/poc", { recursive: true });
writeFileSync("build/poc/honest-shield.json", JSON.stringify(honest, null, 2));
writeFileSync("build/poc/lying-shield.json", JSON.stringify(lying, null, 2));
console.log("honest commitment :", honestCommit.toString());
console.log("lying  commitment :", lyingCommit.toString(), "(encodes 1e18, deposits 1)");
console.log("wrote build/poc/honest-shield.json, build/poc/lying-shield.json");
