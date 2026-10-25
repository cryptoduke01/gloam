# Deploy Gloam to Ethereum Sepolia

Ethereum Sepolia (`11155111`) gets the mainnet vault, `ShieldPoolPayments` on the
ceremony's final keys, through the shared `contracts/script/MainnetDeploy.sol`, the
same deploy as Robinhood Chain, Tempo and Base Sepolia. You run it with your own keys;
no agent and no CI deploys it. About ten minutes once the wallets are funded.

The whole runbook was rehearsed on a local fork of Sepolia as the real deployer at
nonce 0 (`contracts/test/fork/EthereumSepoliaFork.t.sol`, and steps 4, 5 and 7 below
run as written against an anvil fork): every address and code hash matches Base Sepolia,
the owner handoff works, and every asset went through the vault with final-key proofs.

## What lands where

From the deployer `0x891E74a11abC5D0eC2EE855B2BD521fF9D18F411` at nonce 0 (checked on
25 October 2026: nonce 0, every address below empty on Sepolia):

| Nonce | Contract | Address |
| --- | --- | --- |
| 0 | PoseidonT3 | `0x1a32C2c2A77225EC2dD3BF7be1018819b1039Cb4` |
| 2 | ShieldIVerifierFinal (the shield verifier) | `0x69Fa6d2De0A66dA718DF022cEe98485AfDb03465` |
| 7 | DualProofVerifier | `0x1421353d471dF6C847713aee391Db38978fE714a` |
| 8 | ShieldPoolPayments (the vault) | `0x39e28cde55cab798874746ac52cb4b5cc99a0194` |
| 19 | GloamPayMemo (memo board, after the 10 setup calls) | `0x342E3745967FDB4223902E196Ceb792c15d8C1c4` |

If the nonce is not 0 the addresses differ. That is fine; the after-deploy script
reads them from the run.

## Assets and limits

Checked on chain on 25 October 2026 (`symbol()`, `name()`, `decimals()`, code). USDG and
PYUSD are the addresses in Paxos's testnet docs; USDG's proxy code is byte for byte its
mainnet one. Tether issues no USDT on Sepolia, so none is listed.

| Asset | Address | Decimals | Per deposit | Total |
| --- | --- | --- | --- | --- |
| USDC (Circle) | `0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238` | 6 | 500 | 25,000 |
| USDG (Paxos) | `0xfBb2A78CceEb415b00300925e464C3E44E6e06b0` | 6 | 500 | 25,000 |
| PYUSD (Paxos) | `0xCaC524BcA292aaade2DF8A05cC58F0a65B1B3bB9` | 6 | 500 | 25,000 |
| EURC (Circle) | `0x08210F9170F89Ab7658F0B5E3fF39b0E03C594D4` | 6 | 500 | 25,000 |
| ETH (native) | `0x0000000000000000000000000000000000000000` | 18 | 0.2 | 10 |

Cash-out fee 25 bps to the treasury `0xB3900ac9350903218e4c7597bAb0f008F01B30B8`; owner
handoff to `0x76b7E410a227c888aBD2Bdc24Ee32E094B0FD4D8`. All of it is in
`contracts/ethereum-sepolia-env.sh`.

## Funding

Gas measured in the fork rehearsal, priced at Sepolia's gas on 25 October 2026
(0.001 gwei, base fee 16 wei) with a 3x buffer:

| What | Gas | Cost at 3 x 0.001 gwei |
| --- | --- | --- |
| PoseidonT3 (1 tx) | 2,157,126 | 0.0000065 ETH |
| Vault, verifiers and setup (18 txs) | 6,566,234 | 0.0000197 ETH |
| Memo board (1 tx) | 152,323 | 0.0000005 ETH |
| acceptOwnership (owner) | 28,358 | under 0.0000001 ETH |
| A relayed private send plus its message | 1,957,549 | 0.0000059 ETH |
| A relayed cash out | about 1,090,000 | 0.0000033 ETH |

The whole deploy is 8,875,683 gas: 0.000027 ETH at three times today's price. Step 3
sets `PRIORITY_FEE_GWEI=0.002`; without it ethers v5 tips a fixed 1.5 gwei and
PoseidonT3 alone costs 0.0032 ETH, which the deployer's funding still covers.

| Wallet | Send it |
| --- | --- |
| Deployer `0x891E…F411` | **0.005 ETH** (the deploy needs 0.000027 at 3x; this also covers gas 100 times higher, or PoseidonT3 at ethers' default tip) |
| Relayer `0xb1E9…512e` | **0.003 ETH** (about 500 relayed sends at the buffered price) |
| Owner `0x76b7…D4D8` keeps | **0.001 ETH** (accepting ownership, whatever fee the wallet picks) |

So the owner wallet needs about **0.01 Sepolia ETH** in total before step 1.

## Step 0: Sepolia ETH into the owner wallet

Neither of these asks for ETH on Ethereum mainnet:

- Google Cloud Web3 faucet, cloud.google.com/application/web3/faucet/ethereum/sepolia:
  sign in with a Google account, paste `0x76b7E410a227c888aBD2Bdc24Ee32E094B0FD4D8`. It
  gives up to 0.05 Sepolia ETH a day. If it ever asks for a mainnet balance, use the
  next one.
- Sepolia PoW faucet, sepolia-faucet.pk910.de: paste the address and let the browser
  mine for a few minutes, then claim.

For testing deposits later: test USDC and EURC from faucet.circle.com and test PYUSD
and USDG from faucet.paxos.com, each on Ethereum Sepolia.

## Step 1: fund the deployer and the relayer

Open `http://127.0.0.1:4730/fund-sepolia` in the browser with the owner wallet. It
shows the three balances, sends 0.005 to the deployer and 0.003 to the relayer (one
wallet prompt each) and waits for both to land.

## Step 2: settings

```bash
cd contracts
source ethereum-sepolia-env.sh
```

It reads the deployer key hidden (no file, no shell history), then prints the chain
(must be 11155111), the deployer address (must be `0x891E…F411`), its nonce (must be 0)
and its balance (0.005). The deploy scripts also refuse a key that is not `DEPLOYER`'s.

## Step 3: PoseidonT3

```bash
POSEIDON_T3_ONLY=1 PRIORITY_FEE_GWEI=0.002 node circuits/scripts/deploy-poseidon.mjs
export POSEIDON2=0x1a32C2c2A77225EC2dD3BF7be1018819b1039Cb4   # or the address it printed
cast code $POSEIDON2 --rpc-url $RPC_URL | cast keccak
# must print 0x354b26999e434f8256d168395315e1f51fc15bf49bf2e6bb58fc549bd597e7da
```

## Step 4: the vault

```bash
forge script $SCRIPT --rpc-url $RPC_URL                      # dry run: must end with "All checks passed"
forge script $SCRIPT --rpc-url $RPC_URL --broadcast --slow   # 18 transactions
```

## Step 5: the memo board

```bash
forge script script/DeployGloamPayMemo.s.sol:DeployGloamPayMemo --rpc-url $RPC_URL
forge script script/DeployGloamPayMemo.s.sol:DeployGloamPayMemo --rpc-url $RPC_URL --broadcast --slow
# prints GloamPayMemo 0x342E3745967FDB4223902E196Ceb792c15d8C1c4
```

## Step 6: accept ownership

Open `http://127.0.0.1:4730` with the owner wallet and press **Accept on Ethereum
Sepolia**. The page checks the vault is waiting for your wallet, switches the wallet to
Sepolia, sends `acceptOwnership()` and waits until the owner reads back as yours. It
moves no funds. Copy the transaction hash it shows.

## Step 7: read back, record, switch on

```bash
ACCEPT_TX=0x...   ./ethereum-sepolia-after-deploy.sh
```

It sends nothing. It reads the deploy back and stops at the first thing that is off:
every transaction succeeded, owner `0x76b7…D4D8` with nothing pending, setup ended,
limits on, 0.25% to the treasury, the deploy's verifiers, each asset's limit, and the
code of PoseidonT3, the vault and the memo board against Base Sepolia's. Then it writes
`contracts/deployments/ethereum-sepolia.json` and makes the switch-on, which is one line
in each of two files:

```diff
--- a/app/src/lib/mainnet.ts
-export const ETHEREUM_SEPOLIA_POOL: TestnetPoolInput = { pool: null, deployBlock: null, payMemo: null, payMemoBlock: null };
+export const ETHEREUM_SEPOLIA_POOL: TestnetPoolInput = { pool: "0x39E28Cde55CAB798874746ac52cb4B5Cc99a0194", deployBlock: <vault block>, payMemo: "0x342E3745967FDB4223902E196Ceb792c15d8C1c4", payMemoBlock: <memo block> };
--- a/packages/sdk/src/mainnet.ts
-export const ETHEREUM_SEPOLIA_POOL: TestnetPoolInput = { pool: null, deployBlock: null, payMemo: null, payMemoBlock: null };
+export const ETHEREUM_SEPOLIA_POOL: TestnetPoolInput = { pool: "0x39E28Cde55CAB798874746ac52cb4B5Cc99a0194", deployBlock: <vault block>n, payMemo: "0x342E3745967FDB4223902E196Ceb792c15d8C1c4", payMemoBlock: <memo block>n };
```

That line is all the app, API, relay, remote MCP, Glim, docs, SDK, local MCP and
mppx-gloam read; every self-test passes with it filled in.

## Step 8: verify the source on Sourcify

No key needed; Blockscout and Etherscan show Sourcify sources.

```bash
RUN=broadcast/DeployEthereumSepolia.s.sol/$CHAIN/run-latest.json
jq -r '.transactions[] | select(.transactionType=="CREATE") | "\(.contractAddress) \(.contractName)"' $RUN |
while read -r addr name; do
  src=$(grep -rlE --include='*.sol' "^contract $name( |\{)" src | head -1)
  forge verify-contract "$addr" "$src:$name" --chain $CHAIN --verifier sourcify --watch
done
forge verify-contract 0x342E3745967FDB4223902E196Ceb792c15d8C1c4 src/GloamPayMemo.sol:GloamPayMemo \
  --chain $CHAIN --verifier sourcify --watch
```

For Etherscan as well, run the same loop with `--verifier etherscan --rpc-url $RPC_URL
--guess-constructor-args` after `read -rsp "Etherscan API key: " ETHERSCAN_API_KEY; export ETHERSCAN_API_KEY`.
PoseidonT3 has no Solidity source; its code hash in step 3 stands in for it.

## Step 9: ship it

```bash
cd ..   # repo root
(cd packages/sdk && npm test) && (cd mcp && npm test) && (cd packages/mppx-gloam && npm test)
(cd app && ../mcp/node_modules/.bin/tsx scripts/selftest-ethereum-sepolia.mts)
git add contracts/deployments/ethereum-sepolia.json app/src/lib/mainnet.ts packages/sdk/src/mainnet.ts
git commit -m "Ethereum Sepolia on: its vault and memo board in the app and the SDK"
```

Then, when you want them: publish `@gloamtrade/sdk` 0.4.0 (with the pool in), then
`@gloamtrade/mppx-gloam` 0.3.0 and `@gloamtrade/mcp`; and set `GLOAM_RPC_URL_11155111`
on Vercel to a private Sepolia RPC (server env, never `NEXT_PUBLIC_`). Without it the
server reads Tenderly's public gateway, which keeps the whole history, then publicnode,
which keeps only about the last 10,000 blocks.

## Do not

- Deploy with dev keys or point the vault at a dev-key verifier. The script refuses.
- Lose `contracts/broadcast/` before step 7 has run: it is gitignored and is the only
  local record of the run.
- Run the after-deploy script before accepting ownership: it stops, and nothing is
  switched on.
