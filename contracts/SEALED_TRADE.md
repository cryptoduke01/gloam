# Sealed-size private trade

**Status:** circuit draft (`circuits/sealedSwap/sealedSwap.circom`). Not compiled / not deployed. Vault trade adapter remains the only executable trade path.

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

## Next engineering steps

1. `circom` compile + Powers of Tau contribution → `sealed_swap.wasm` / zkey  
2. Solidity verifier + `SealedSwap` settlement on pool inventory (or adapter)  
3. Wire DualProof-style router or new pool method  
4. Trade UI: real prove button (only after 1–3)

## Adapter (live)

Cash out → public DEX → re-shield. Size **is** public on the swap edge. Honest fallback forever for thin books.

## Explicit non-goals for circuit draft

- Fake private swap UI  
- Mainnet / production keys  
- Full Zcash-style multi-asset AMM privacy
