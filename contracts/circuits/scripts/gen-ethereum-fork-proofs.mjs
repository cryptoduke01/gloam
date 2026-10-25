#!/usr/bin/env node
/**
 * Real final-key proofs for the Ethereum mainnet fork test
 * (contracts/test/fork/EthereumMainnetFork.t.sol), written to
 * contracts/test/fixtures/ethereum-fork-proofs.json. The story they tell:
 *
 *   1. deposit a 100 USDT note (leaf 0) and a 0.01 ETH note (leaf 1), each with
 *      its shield proof (public inputs: commitment, amount, asset);
 *   2. a private send of 60 of the USDT, leaving 40 in change (leaves 2 and 3),
 *      proved against the root after step 1;
 *   3. cash out the 60 USDT payment and the ETH note to RECIPIENT, proved
 *      against the root after step 2.
 *
 * The keys are the ceremony's final ones (app/public/circuits/final), the same
 * the mainnet verifiers hold, so the fork test runs the deploy script's own
 * verifiers end to end. The secrets are fixed test values, not anyone's money.
 *
 *   node contracts/circuits/scripts/gen-ethereum-fork-proofs.mjs
 *
 * snarkjs and circomlibjs come from the app's dependencies, ethers from the circuits package.
 */
import { writeFileSync } from "fs";
import { createRequire } from "module";
import { fileURLToPath } from "url";

const here = (p) => fileURLToPath(new URL(p, import.meta.url));
const appRequire = createRequire(here("../../../app/package.json"));
const snarkjs = appRequire("snarkjs");
const { buildPoseidon } = appRequire("circomlibjs");
const { ethers } = createRequire(here("../package.json"))("ethers");

const WASM = here("../../../app/public/circuits/");
const FINAL = here("../../../app/public/circuits/final/");
const OUT = here("../../test/fixtures/ethereum-fork-proofs.json");

const USDT = 0xdac17f958d2ee523a2206206994597c13d831ec7n;
const RECIPIENT = 0x000000000000000000000000000000000000e7e0n;
const DEPTH = 20;

const poseidon = await buildPoseidon();
const H2 = (a, b) => poseidon.F.toObject(poseidon([a, b]));
const H3 = (a, b, c) => poseidon.F.toObject(poseidon([a, b, c]));

function note(secret, amount, asset) {
  const commitment = H3(secret, amount, asset);
  return { secret, amount, asset, commitment, nullifier: H2(secret, commitment) };
}
const usdt = note(7357000000000000000001n, 100_000_000n, USDT);
const eth = note(7357000000000000000002n, 10_000_000_000_000_000n, 0n);
const pay = note(7357000000000000000003n, 60_000_000n, USDT);
const change = note(7357000000000000000004n, 40_000_000n, USDT);

// The vault's tree (IncrementalMerkleTreePoseidon): zeros[0] = 0, zeros[i+1] = H2(zeros[i], zeros[i]).
const zeros = [0n];
for (let i = 1; i < DEPTH; i++) zeros.push(H2(zeros[i - 1], zeros[i - 1]));

/** Root of `leaves` and the path of leaf `index`. */
function pathFor(leaves, index) {
  let layer = leaves.slice();
  let idx = index;
  const pathElements = [];
  const pathIndices = [];
  for (let level = 0; level < DEPTH; level++) {
    const right = idx % 2 === 1;
    const sib = right ? idx - 1 : idx + 1;
    pathElements.push(sib < layer.length ? layer[sib] : zeros[level]);
    pathIndices.push(right ? 1 : 0);
    const next = [];
    for (let i = 0; i < layer.length; i += 2) next.push(H2(layer[i], i + 1 < layer.length ? layer[i + 1] : zeros[level]));
    layer = next;
    idx = Math.floor(idx / 2);
  }
  return { root: layer[0], pathElements: pathElements.map(String), pathIndices: pathIndices.map(String) };
}

async function prove(circuit, input) {
  const zkey = `${FINAL}${circuit}_final.zkey`;
  const vkey = await snarkjs.zKey.exportVerificationKey(zkey);
  const { proof, publicSignals } = await snarkjs.groth16.fullProve(input, `${WASM}${circuit}.wasm`, zkey);
  if (!(await snarkjs.groth16.verify(vkey, publicSignals, proof))) throw new Error(`${circuit} proof does not verify`);
  const [a, b, c] = JSON.parse(`[${await snarkjs.groth16.exportSolidityCallData(proof, publicSignals)}]`);
  // abi.encode(a, b, c) with b in verifier order, as the IVerifier adapters take it
  return ethers.utils.defaultAbiCoder.encode(["uint256[2]", "uint256[2][2]", "uint256[2]"], [a, b, c]);
}

const hex = (v) => `0x${v.toString(16).padStart(64, "0")}`;
const shieldProof = (n) =>
  prove("shield", { commitment: String(n.commitment), amount: String(n.amount), asset: String(n.asset), secret: String(n.secret) });
async function unshieldProof(n, leaves, index) {
  const p = pathFor(leaves, index);
  const proof = await prove("unshield", {
    root: String(p.root),
    nullifier: String(n.nullifier),
    asset: String(n.asset),
    amount: String(n.amount),
    recipient: String(RECIPIENT),
    secret: String(n.secret),
    pathElements: p.pathElements,
    pathIndices: p.pathIndices,
  });
  return { amount: String(n.amount), nullifier: hex(n.nullifier), root: hex(p.root), proof };
}

const afterDeposits = [usdt.commitment, eth.commitment];
const afterSend = [...afterDeposits, pay.commitment, change.commitment];
const sendPath = pathFor(afterDeposits, 0);

const out = {
  recipient: ethers.utils.getAddress(`0x${RECIPIENT.toString(16).padStart(40, "0")}`),
  shieldUsdt: { amount: String(usdt.amount), commitment: hex(usdt.commitment), proof: await shieldProof(usdt) },
  shieldEth: { amount: String(eth.amount), commitment: hex(eth.commitment), proof: await shieldProof(eth) },
  send: {
    root: hex(sendPath.root),
    nullifier: hex(usdt.nullifier),
    payment: hex(pay.commitment),
    change: hex(change.commitment),
    proof: await prove("transfer", {
      root: String(sendPath.root),
      nullifier: String(usdt.nullifier),
      newCommitment0: String(pay.commitment),
      newCommitment1: String(change.commitment),
      secretIn: String(usdt.secret),
      amountIn: String(usdt.amount),
      asset: String(USDT),
      pathElements: sendPath.pathElements,
      pathIndices: sendPath.pathIndices,
      secretPay: String(pay.secret),
      amountPay: String(pay.amount),
      secretChange: String(change.secret),
      amountChange: String(change.amount),
    }),
  },
  cashOutUsdt: await unshieldProof(pay, afterSend, 2),
  cashOutEth: await unshieldProof(eth, afterSend, 1),
};

writeFileSync(OUT, `${JSON.stringify(out, null, 2)}\n`);
console.log("wrote", OUT);
// snarkjs keeps its worker threads open; nothing else is left to do
process.exit(0);
