/**
 * Offline proof that the MCP server can generate a REAL transfer proof, the one
 * that settles an x402 private payment (gloam_pay_x402). Builds an in-memory
 * pool tree and a transfer witness with the SDK, fetches the transfer circuit
 * artifacts through the same loader the server uses, and runs a real Groth16
 * proof. No chain: the proof is real crypto over a local tree, which validates
 * the prover wiring without a deployed pool.
 *
 * Network-dependent (fetches transfer.wasm + transfer_final.zkey): if the
 * artifacts are unreachable it prints SKIP and exits 0, so it never blocks.
 *
 * Run:  npx tsx scripts/verify-transfer-prover.mjs
 */
import {
  IncrementalMerkleTreePoseidon,
  noteCommitmentPoseidon,
  fieldToHex,
  buildTransferWitness,
  artifactProver,
} from "@gloamtrade/sdk";
import { transferArtifacts } from "../src/artifacts.ts";

const STABLE = "0x00000000000000000000000000000000000000ee";
const SECRET = 42424242424242424242n;
const IN = 1_000_000_000_000_000n;
const PAY = 250_000_000_000_000n;

const tree = new IncrementalMerkleTreePoseidon();
await tree.insert(await noteCommitmentPoseidon(SECRET, IN, STABLE));
await tree.insert(await noteCommitmentPoseidon(111n, 5n, STABLE));
const path = await tree.path(0);

const w = await buildTransferWitness({
  secretHex: fieldToHex(SECRET),
  amountIn: IN,
  amountPay: PAY,
  asset: STABLE,
  path,
});
if (w.blocker) {
  console.error("FAIL: witness blocker:", w.blocker);
  process.exit(1);
}

let artifacts;
try {
  artifacts = await transferArtifacts();
} catch (e) {
  console.log(`SKIP: transfer artifacts unavailable (${e.message}). Prover wiring is in place; run again with network access.`);
  process.exit(0);
}

const { proofBytes } = await artifactProver(artifacts)(w.circomInput);
// A packed Groth16 proof is 8 field elements = 256 bytes = 512 hex chars + "0x".
const okShape = typeof proofBytes === "string" && /^0x[0-9a-f]{512}$/.test(proofBytes);
if (!okShape) {
  console.error("FAIL: proof bytes are not a packed Groth16 proof:", proofBytes?.slice?.(0, 20));
  process.exit(1);
}
console.log(`verify-transfer-prover: ok (real transfer proof generated, ${proofBytes.length} chars)`);
