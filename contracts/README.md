# Gloam Contracts

**Testnet-only** until production ceremony + audit. Robinhood Chain testnet `46630`.

## Do we need contracts?

| Path | Contracts |
| --- | --- |
| Send ETH / ERC-20 | No — native + faucet tokens |
| Public swap (when pools exist) | No — existing DEX router |
| **Shield / private send / private trade / cash out** | **Yes — this package** |

## Live (RH testnet)

Product vault (sealed): **`0xaEbB8E3b5C4648Aa7Cc4E41d3Cec008Db4bb1834`**

Full addresses: [deployments/poseidon-testnet.json](./deployments/poseidon-testnet.json)

| Feature | Status |
| --- | --- |
| Shield / unshield / transfer | Live (dev keys) |
| Sealed private trade | Live (dev keys) |
| Pay memos | Live |
| Production keys | Not yet |

## Stack

- [Foundry](https://book.getfoundry.sh/) — `forge` / `cast` / `anvil`
- Solidity `0.8.24+`, `evm_version = shanghai` (RH faucet tokens use PUSH0)
- Circom circuits under `circuits/`

## Commands

```bash
cd contracts
forge build
forge test

# Seed vault inventory (need faucet stocks + DEPLOYER_PK)
export DEPLOYER_PK=0x...
export RH_TESTNET_RPC=https://rpc.testnet.chain.robinhood.com
forge script script/SeedVaultInventory.s.sol \
  --rpc-url $RH_TESTNET_RPC --broadcast --gas-estimate-multiplier 200 -vvvv
```

## Docs

- [ARCHITECTURE.md](./ARCHITECTURE.md)
- [SEALED_TRADE.md](./SEALED_TRADE.md)
- [PRODUCTION.md](./PRODUCTION.md)
- [AUDIT.md](./AUDIT.md)

## Honesty

- No mock “private success” in the app.
- Public app paths work without this package.
- Dev ceremony zkeys only until production gate.
