# Sealed-size private trade

**Status:** circuit **compiled** + dev zkey in `app/public/circuits/sealed_swap*`. Settlement contract **not** deployed — adapter is the only executable trade.

## Goal

Swap without broadcasting **full size** as free public signal. Settlement still on Robinhood Chain.

## v0 circuit (fixed rate)

File: `circuits/sealedSwap/sealedSwap.circom`

**Public (9):**  
`root, nullifier, newCommitmentOut, newCommitmentChange, assetIn, assetOut, amountOutMin, rateIn, rateOut`

**Private:**  
spend note secrets, `amountIn`, `amountSwap`, `amountOut`, change, Merkle path

**Constraints:**

- Merkle membership of spent note (`assetIn`)
- `amountIn = amountSwap + amountChange`
- `amountOut * rateOut === amountSwap * rateIn` (testnet fixed rates; later oracle)
- `amountOut >= amountOutMin`
- Poseidon commitments for out + change notes

**App witness builder:** `app/src/lib/proverSealedSwap.ts` (`buildSealedSwapWitness`)  
**Artifacts ready?** `sealedSwapArtifactsReady() === false` until wasm/zkey published.

## Settlement (source ready)

- `SealedSwapVerifier.sol` + `SealedSwapIVerifier.sol` (9 public inputs)
- `ShieldPoolPoseidon.sealedSwap(...)` + `setSealedSwapVerifier`
- Deploy script: `script/DeploySealedSwapVerifier.s.sol`
- **Live RH pool** is an older bytecode without `sealedSwap` until redeploy + `setSealedSwapVerifier`

## Next engineering steps

1. Deploy sealed swap verifiers on RH testnet  
2. Redeploy Poseidon pool (or migrate) with `sealedSwap` + set verifier  
3. App: sealed trade form that proves + calls `sealedSwap` (only if pool supports it)  
4. Seed inventory for both assets so unshield after swap stays solvent

## Adapter (live)

Cash out → public DEX → re-shield. Size **is** public on the swap edge. Honest fallback forever for thin books.

## Explicit non-goals for circuit draft

- Fake private swap UI  
- Mainnet / production keys  
- Full Zcash-style multi-asset AMM privacy
