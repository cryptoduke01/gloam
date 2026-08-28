/**
 * @gloam/sdk — the private path for Robinhood Chain, as a reusable package.
 *
 * Shielded balances, private transfers, and private trades that any RH Chain app
 * or agent can plug into. The Gloam vault app is the reference implementation.
 *
 * Status: scaffolding (Milestone 1). The canonical intent contract is live;
 * pure note/tree/prover modules are being ported from the app in behavior-
 * preserving batches. Extraction plan (see the buildathon handoff):
 *
 *   core/    note commitment + nullifier (keccak + Poseidon), field math
 *   tree/    incremental Merkle tree + circom path builder
 *   prover/  witness builders (unshield, transfer, sealedSwap) + groth16 packing
 *   rates/   sealed-rate math + size-privacy policy (pure)
 *   intents/ shield | privateSend | unshield | privateTrade builders (this file's types)
 *   adapters/ NoteStore, KeyStore, prover artifact loader (browser + node impls)
 *
 * Environment split: the crypto/math core is pure and runs anywhere. Storage
 * (notes, viewing keys), snarkjs proving, and RPC are injected via adapters so
 * the same core serves the browser app and the node MCP signer.
 */

export const SDK_VERSION = "0.0.1";

export * from "./intents.js";
export * from "./rates.js";
export * from "./privacy.js";
