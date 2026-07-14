# Gloam Contracts

**Testnet-only** until private rails are real. Robinhood Chain testnet `46630`.

## Do we need contracts?

| Path | Contracts |
| --- | --- |
| Send ETH / ERC-20 | No — native + faucet tokens |
| Public swap (when pools exist) | No — existing DEX router |
| **Shield / private move / private trade** | **Yes — this package** |

## What we will deploy (order)

1. **ShieldPool (Phase 1 — done in source)** — ETH/ERC-20 custody + keccak Merkle tree + unshield payout path
2. **Verifier** — onchain check of ZK proofs (transfer / unshield stay locked until set)
3. **Circuits** — bind amount/asset inside the note (Phase 2)
4. **Trade adapter** (later) — private intent → settlement

### Optional: seed testnet stock pools (swaps)

```bash
export DEPLOYER_PK=0x...   # wallet with faucet stocks + ETH
forge script script/SeedTestnetLiquidity.s.sol --rpc-url https://rpc.testnet.chain.robinhood.com --broadcast
```

## Stack

- [Foundry](https://book.getfoundry.sh/) — `forge` / `cast` / `anvil`
- Solidity `0.8.24+`
- Target: Robinhood Chain testnet (Arbitrum Orbit EVM)

## Commands

```bash
cd contracts
forge install   # after forge is installed
forge build
forge test
```

Deploy scripts and addresses land in `deployments/testnet.json` when we ship.

## Honesty

- No mock “private success” in the app until these contracts + proofs are live.
- Public app keeps working without this package.
