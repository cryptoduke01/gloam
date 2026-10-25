#!/usr/bin/env node
/**
 * Real final-key proofs for the Ethereum Sepolia fork test
 * (contracts/test/fork/EthereumSepoliaFork.t.sol), written to
 * contracts/test/fixtures/ethereum-sepolia-fork-proofs.json. The story they tell,
 * one note per asset the Sepolia vault lists:
 *
 *   1. deposit 100 USDC (leaf 0), 0.01 ETH (leaf 1), 50 EURC (leaf 2),
 *      25 USDG (leaf 3) and 25 PYUSD (leaf 4), each with its shield proof
 *      (public inputs: commitment, amount, asset);
 *   2. a private send of 60 of the USDC, leaving 40 in change (leaves 5 and 6),
 *      proved against the root after step 1;
 *   3. cash out the 60 USDC payment and the ETH, EURC, USDG and PYUSD notes to
 *      RECIPIENT, each proved against the root after step 2.
 *
 * The keys are the ceremony's final ones (app/public/circuits/final), the same
 * the mainnet verifiers hold, so the fork test runs the deploy script's own
 * verifiers end to end. The secrets are fixed test values, not anyone's money.
 *
 *   node contracts/circuits/scripts/gen-sepolia-fork-proofs.mjs
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
const OUT = here("../../test/fixtures/ethereum-sepolia-fork-proofs.json");

// Ethereum Sepolia: Circle's USDC and EURC, Paxos's USDG and PYUSD, and native ETH (0).
const USDC = 0x1c7d4b196cb0c7b01d743fbc6116a902379c7238n;
const EURC = 0x08210f9170f89ab7658f0b5e3ff39b0e03c594d4n;
const USDG = 0xfbb2a78cceeb415b00300925e464c3e44e6e06b0n;
const PYUSD = 0xcac524bca292aaade2df8a05cc58f0a65b1b3bb9n;
const RECIPIENT = 0x0000000000000000000000000000000000005e90n;
const DEPTH = 20;

const poseidon = await buildPoseidon();
const H2 = (a, b) => poseidon.F.toObject(poseidon([a, b]));
const H3 = (a, b, c) => poseidon.F.toObject(poseidon([a, b, c]));

function note(secret, amount, asset) {
  const commitment = H3(secret, amount, asset);
  return { secret, amount, asset, commitment, nullifier: H2(secret, commitment) };
}
const usdc = note(11155111000000000000001n, 100_000_000n, USDC);
const eth = note(11155111000000000000002n, 10_000_000_000_000_000n, 0n);
const eurc = note(11155111000000000000003n, 50_000_000n, EURC);
const usdg = note(11155111000000000000004n, 25_000_000n, USDG);
const pyusd = note(11155111000000000000005n, 25_000_000n, PYUSD);
const pay = note(11155111000000000000006n, 60_000_000n, USDC);
const change = note(11155111000000000000007n, 40_000_000n, USDC);

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
async function shieldProof(n) {
  const proof = await prove("shield", { commitment: String(n.commitment), amount: String(n.amount), asset: String(n.asset), secret: String(n.secret) });
  return { amount: String(n.amount), commitment: hex(n.commitment), proof };
}
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

const afterDeposits = [usdc.commitment, eth.commitment, eurc.commitment, usdg.commitment, pyusd.commitment];
const afterSend = [...afterDeposits, pay.commitment, change.commitment];
const sendPath = pathFor(afterDeposits, 0);

const out = {
  recipient: ethers.utils.getAddress(`0x${RECIPIENT.toString(16).padStart(40, "0")}`),
  shieldUsdc: await shieldProof(usdc),
  shieldEth: await shieldProof(eth),
  shieldEurc: await shieldProof(eurc),
  shieldUsdg: await shieldProof(usdg),
  shieldPyusd: await shieldProof(pyusd),
  send: {
    root: hex(sendPath.root),
    nullifier: hex(usdc.nullifier),
    payment: hex(pay.commitment),
    change: hex(change.commitment),
    proof: await prove("transfer", {
      root: String(sendPath.root),
      nullifier: String(usdc.nullifier),
      newCommitment0: String(pay.commitment),
      newCommitment1: String(change.commitment),
      secretIn: String(usdc.secret),
      amountIn: String(usdc.amount),
      asset: String(USDC),
      pathElements: sendPath.pathElements,
      pathIndices: sendPath.pathIndices,
      secretPay: String(pay.secret),
      amountPay: String(pay.amount),
      secretChange: String(change.secret),
      amountChange: String(change.amount),
    }),
  },
  cashOutUsdc: await unshieldProof(pay, afterSend, 5),
  cashOutEth: await unshieldProof(eth, afterSend, 1),
  cashOutEurc: await unshieldProof(eurc, afterSend, 2),
  cashOutUsdg: await unshieldProof(usdg, afterSend, 3),
  cashOutPyusd: await unshieldProof(pyusd, afterSend, 4),
};

writeFileSync(OUT, `${JSON.stringify(out, null, 2)}\n`);
console.log("wrote", OUT);
// snarkjs keeps its worker threads open; nothing else is left to do
process.exit(0);
