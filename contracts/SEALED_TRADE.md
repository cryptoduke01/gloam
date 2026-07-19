# Sealed-size private trade

**Status:** circuit compiled · dev zkey in `app/public/circuits/sealed_swap*` · settlement **live** on RH testnet Poseidon vault `0x4F38…2D8F` with sealed swap verifiers (see `deployments/poseidon-testnet.json`). App rates use **display marks** (Yahoo/CG → public `rateIn`/`rateOut`); not an on-chain oracle. Dev ceremony keys only.

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
**Browser prove:** `proveSealedSwapInBrowser` in `app/src/lib/proveClient.ts`  
**UI:** `app/src/components/app/SealedTradePanel.tsx` (checks `sealedSwapVerifier` on-chain)

## Settlement (live on testnet)

- `SealedSwapVerifier.sol` + `SealedSwapIVerifier.sol` (9 public inputs)
- `ShieldPoolPoseidon.sealedSwap(...)` + `setSealedSwapVerifier`
- Deploy record: `deployments/poseidon-testnet.json` (`features.sealedSwap: true`)

## Next engineering steps

1. Replace display-mark rates with oracle-bound or pool-bound pricing  
2. Production multi-party ceremony keys (see `PRODUCTION.md`)  
3. Seed inventory so unshield after swap stays solvent for both assets  
4. Ethereum expansion once RH private rails are battle-tested  

## Adapter (live forever)

Cash out → public DEX → re-shield. Size **is** public on the swap edge. Honest fallback for thin books.

## Explicit non-goals for v0

- Fake private swap UI  
- Mainnet / production keys  
- Full Zcash-style multi-asset AMM privacy
