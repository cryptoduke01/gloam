# Sealed-size private trade (design scaffold)

**Status:** not implemented. Vault trade adapter (unshield → public DEX → reshield) is the only trade path from the vault today.

## Goal

Execute a swap so that **trade size is not free public signal**, while settlement remains on Robinhood Chain. We will not ship a button that hides a public swap behind private language.

## Constraints (from live stack)

- Notes: Poseidon commitment / nullifier, Merkle depth 20
- Proof layouts: unshield (5), transfer (4)
- Pool holds assets; public edges (shield / unshield / adapter swap) remain visible
- Production ceremony required before mainnet (see `PRODUCTION.md`)

## Candidate architectures

### A. Intent batch settlement

1. User proves a **spendable note** and posts a sealed intent (size, asset, side, max slippage) off-chain or as a commitment on-chain.
2. Matcher aggregates intents over a short epoch.
3. Settlement contract verifies proofs and mints/burns note commitments for **net** fills.
4. Individual sizes blur inside the batch anonymity set.

**Needs:** intent format, epoch coordinator (or fully on-chain sealed bids), settlement circuit, griefing/bonds.

### B. Vault-native AMM

1. Pool (or adapter) holds both sides of liquidity as notes or internal accounting.
2. User spends note A, receives note B via a circuit that binds amounts to the AMM curve without revealing size in public calldata (or reveals only after delay / with noise).
3. Harder: MEV, LP privacy, circuit cost.

### C. Hybrid

- Thin markets → vault adapter (today).
- Deep markets → sealed path when liquidity + circuits exist.

## Suggested first engineering slice (when starting build)

1. Spec public inputs for a minimal **private swap** circuit:  
   `root, nullifierIn, newCommitmentOut, assetIn, assetOut, amountIn, amountOutMin` (exact set TBD).
2. Decide visibility: which fields are public for verification vs private witnesses.
3. Mock matcher offline; no mainnet claims.
4. Keep adapter as fallback forever for illiquid pairs.

## Explicit non-goals for v0 sealed

- Invisibility from subpoenas / chain analytics on edges
- Guaranteed anonymity with 1 user
- Fake “dark pool” UX without settlement

## App surface

- Trade → **Sealed (soon)** explains status (no fake prove button)
- Docs: `/docs/sealed-trade`
