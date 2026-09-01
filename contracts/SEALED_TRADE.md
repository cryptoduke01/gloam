# Sealed-size private trade

**Status:** circuit compiled · dev zkey in `app/public/circuits/sealed_swap*` · settlement **live** on RH testnet Poseidon vault `0xaEbB…1834` with sealed swap verifiers (see `deployments/poseidon-testnet.json`).

**Privacy (app):** default `amountOutMin = 1` so public min-out does not equal real size (see `app/src/lib/privacy.ts`). Rates are coarsened display marks, still public. Assets and caller remain public. Dev ceremony keys only.

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

## Vault inventory

`sealedSwap` does **not** move `deposited[asset]`. Cash-out still needs the pool to hold the asset.

Seed throwaway inventory (needs faucet tokens + `DEPLOYER_PK`):

```bash
export DEPLOYER_PK=0x...
export RH_TESTNET_RPC=https://rpc.testnet.chain.robinhood.com
# optional: TOKEN_AMT=1000000000000000000  (1e18 per stock)
forge script script/SeedVaultInventory.s.sol \
  --rpc-url $RH_TESTNET_RPC --broadcast --gas-estimate-multiplier 200 -vvvv
```

App UI shows `deposited` on private trade and blocks cash-out when inventory is short.

## Next engineering steps

1. Replace display-mark rates with oracle-bound or pool-bound pricing  
2. Production multi-party ceremony keys (see `PRODUCTION.md`)  
3. Run / automate inventory seed when faucet tokens are available  
4. Ethereum expansion once RH private rails are battle-tested  

## Adapter (live forever)

Cash out → public DEX → re-shield. Size **is** public on the swap edge. Honest fallback for thin books.

## Explicit non-goals for v0

- Fake private swap UI  
- Mainnet / production keys  
- Full Zcash-style multi-asset AMM privacy
