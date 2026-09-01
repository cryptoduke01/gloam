/**
 * @gloam/sdk — the private path for Robinhood Chain, as a reusable package.
 *
 * Shielded balances, private transfers, and private trades that any RH Chain app
 * or agent can plug into. The Gloam vault app is the reference implementation.
 *
 * Surface (all live and exported below):
 *
 *   note      note commitment + nullifier (Poseidon), field math
 *   merkle    depth-20 incremental Merkle tree + circom path builder
 *   sync      rebuild the pool tree from chain -> membership paths for spends
 *   witness   unshield / transfer / sealedSwap witness builders
 *   prove     injected Groth16 prover (artifactProver) + proof packing
 *   rates     sealed-rate math + size-privacy policy (pure)
 *   builders  shieldBound | unshield | privateSend | privateTrade intents
 *   constants pool + verifier addresses, chain ids, field prime
 *
 * Environment split: the crypto/math core is pure and runs anywhere. Proving
 * (snarkjs + artifacts) and storage (notes, keys) are injected, so the same core
 * serves the browser app and the node MCP signer. sealedSwap builds a valid
 * intent, but its on-chain path is disabled pending the H1 solvency work.
 */

export const SDK_VERSION = "0.0.1";

export * from "./intents.js";
export * from "./rates.js";
export * from "./privacy.js";
export * from "./constants.js";
export * from "./poseidon.js";
export * from "./note.js";
export * from "./merkle.js";
export * from "./proof.js";
export * from "./witness.js";
export * from "./prove.js";
export * from "./builders.js";
export * from "./sync.js";
