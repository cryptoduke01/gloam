#!/usr/bin/env node
/**
 * Real final-key proofs for the Robinhood Chain assets fork test
 * (contracts/test/fork/RobinhoodAssetsFork.t.sol), written to
 * contracts/test/fixtures/robinhood-assets-fork-proofs.json. For each asset the
 * story is the same, on a tree of its own:
 *
 *   1. deposit a note with its shield proof (public inputs: commitment, amount, asset);
 *   2. a private send of 60% of it, leaving 40% in change, proved against the
 *      root of a tree holding the deposit;
 *   3. cash out the 60% payment to RECIPIENT, proved against the root of a tree
 *      holding the deposit and both new notes.
 *
 * The keys are the ceremony's final ones (app/public/circuits/final), the same
 * the live vault's verifiers hold. The secrets are fixed test values, not
 * anyone's money. The fork test marks the two synthetic roots known on the live
 * vault (one storage slot each, as app/scripts/sim-vault-swap-v2.mts does);
 * everything else runs on the live vault as it is.
 *
 *   node contracts/circuits/scripts/gen-robinhood-assets-fork-proofs.mjs
 *
 * snarkjs, circomlibjs and viem come from the app's dependencies.
 */
import { writeFileSync } from "fs";
import { createRequire } from "module";
import { fileURLToPath } from "url";

const here = (p) => fileURLToPath(new URL(p, import.meta.url));
const appRequire = createRequire(here("../../../app/package.json"));
const snarkjs = appRequire("snarkjs");
const { buildPoseidon } = appRequire("circomlibjs");
const { encodeAbiParameters, getAddress } = appRequire("viem");

const WASM = here("../../../app/public/circuits/");
const FINAL = here("../../../app/public/circuits/final/");
const OUT = here("../../test/fixtures/robinhood-assets-fork-proofs.json");

const RECIPIENT = 0x000000000000000000000000000000000000e7e1n;
const DEPTH = 20;

// Every candidate from the vetting, listed or dropped, so each token's own transfer path is tested.
const ETHER = 10n ** 18n;
const ASSETS = [
  { symbol: "ETH", address: 0n, amount: ETHER / 10n },
  { symbol: "PONS", address: 0x39dbed3a2bd333467115de45665cc57f813c4571n, amount: 1_000n * ETHER },
  { symbol: "CASHCAT", address: 0x020bfc650a365f8bb26819deaabf3e21291018b4n, amount: 1_000n * ETHER },
  { symbol: "AI", address: 0x2e8c31162b855a2ffa90f6f8634643ad6f111e18n, amount: 1_000n * ETHER },
  { symbol: "ORBIO", address: 0xaa07a0e9209e16ac99708c3ec70159c6ef3128a3n, amount: 1_000n * ETHER },
  { symbol: "WALLET", address: 0x0339f5459fc690ac85f1782e15782a151b4a9e1bn, amount: 1_000n * ETHER },
  { symbol: "INU", address: 0x63ee32ac3077d1fbd8a77ebba2a6ed4b8e9c1e18n, amount: 1_000n * ETHER },
  { symbol: "BOOMER", address: 0x127cdc74e44e3c60422b7e792ebe480c0f873ed5n, amount: 1_000n * ETHER },
  { symbol: "WORM", address: 0x3ba500f1ababbcf0f0247d06d1c56fd7e6c4c09dn, amount: 1_000n * ETHER },
  { symbol: "DARK", address: 0xdc45b71d7203c2e8baafc43a19bca0eb993bb54en, amount: 1_000n * ETHER },
];

const poseidon = await buildPoseidon();
const H2 = (a, b) => poseidon.F.toObject(poseidon([a, b]));
const H3 = (a, b, c) => poseidon.F.toObject(poseidon([a, b, c]));

function note(secret, amount, asset) {
  const commitment = H3(secret, amount, asset);
  return { secret, amount, asset, commitment, nullifier: H2(secret, commitment) };
}

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
  return encodeAbiParameters([{ type: "uint256[2]" }, { type: "uint256[2][2]" }, { type: "uint256[2]" }], [a, b, c]);
}

const hex = (v) => `0x${v.toString(16).padStart(64, "0")}`;

const address = (v) => getAddress(`0x${v.toString(16).padStart(40, "0")}`);
const out = { recipient: address(RECIPIENT), assets: {} };

let seed = 7357100000000000000001n;
for (const a of ASSETS) {
  const pay = (a.amount * 60n) / 100n;
  const deposit = note(seed++, a.amount, a.address);
  const payment = note(seed++, pay, a.address);
  const change = note(seed++, a.amount - pay, a.address);
  const sendPath = pathFor([deposit.commitment], 0);
  const leaves = [deposit.commitment, payment.commitment, change.commitment];
  const cashPath = pathFor(leaves, 1);
  console.log("proving", a.symbol);
  out.assets[a.symbol] = {
    address: address(a.address),
    amount: String(a.amount),
    payment: String(pay),
    shield: {
      commitment: hex(deposit.commitment),
      proof: await prove("shield", { commitment: String(deposit.commitment), amount: String(a.amount), asset: String(a.address), secret: String(deposit.secret) }),
    },
    send: {
      root: hex(sendPath.root),
      nullifier: hex(deposit.nullifier),
      payment: hex(payment.commitment),
      change: hex(change.commitment),
      proof: await prove("transfer", {
        root: String(sendPath.root),
        nullifier: String(deposit.nullifier),
        newCommitment0: String(payment.commitment),
        newCommitment1: String(change.commitment),
        secretIn: String(deposit.secret),
        amountIn: String(deposit.amount),
        asset: String(a.address),
        pathElements: sendPath.pathElements,
        pathIndices: sendPath.pathIndices,
        secretPay: String(payment.secret),
        amountPay: String(payment.amount),
        secretChange: String(change.secret),
        amountChange: String(change.amount),
      }),
    },
    cashOut: {
      root: hex(cashPath.root),
      nullifier: hex(payment.nullifier),
      proof: await prove("unshield", {
        root: String(cashPath.root),
        nullifier: String(payment.nullifier),
        asset: String(a.address),
        amount: String(payment.amount),
        recipient: String(RECIPIENT),
        secret: String(payment.secret),
        pathElements: cashPath.pathElements,
        pathIndices: cashPath.pathIndices,
      }),
    },
  };
}

writeFileSync(OUT, `${JSON.stringify(out, null, 2)}\n`);
console.log("wrote", OUT);
// snarkjs keeps its worker threads open; nothing else is left to do
process.exit(0);
