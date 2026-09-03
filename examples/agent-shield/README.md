# agent-shield

The smallest end-to-end example of plugging into Gloam's private layer: an
autonomous agent that shields ETH **privately** on Robinhood Chain testnet, using
only [`@gloamtrade/sdk`](../../packages/sdk).

It mints a Poseidon note, generates the zero-knowledge shield proof, and deposits
via `shieldBound()` on the hardened pool. The amount leaves the public feed; only
the holder (with `note.secret`) can later spend, send, or disclose it.

## Run

```bash
# from the repo root
pnpm install
pnpm --filter @gloamtrade/sdk build

# a funded RH testnet key (faucet: faucet.testnet.chain.robinhood.com)
export GLOAM_AGENT_PRIVATE_KEY=0x...

cd examples/agent-shield
npx tsx agent-shield.ts
```

It prints the note secret (persist it), submits the `shieldBound` transaction, and
waits for the receipt.

## What it shows

- `buildShieldBoundIntent(...)` — the SDK mints the note and runs the shield
  prover, returning a ready-to-sign `shieldBound(asset, amount, commitment, proof)`
  call. The hardened pool rejects plain `shield()` (audit C1), so this proof is
  required.
- `artifactProver({ wasm, zkey })` — the injected Groth16 prover; here it reuses
  the shield circuit artifacts shipped with the app (`app/public/circuits`).
- The private core is environment-agnostic: the same SDK powers the browser vault
  and this Node agent.

## Next

- Persist `note.secret` (this example just logs it). A real agent keeps a note
  store keyed by commitment.
- Cash out or privately send using the unshield / transfer builders.
- Prove holdings to a counterparty with a **selective disclosure** (reuses the
  same shield proof); verify at [gloam.trade/verify](https://gloam.trade/verify).

Testnet only, real ZK proofs, no mock fills.
