# Deploy Gloam to Base

The runbook for bringing the Gloam vault to Base. You run this with your own keys;
no agent and no CI deploys it. Base Sepolia (`84532`) goes first as the
testnet. Base mainnet (`8453`) follows on the same scripts once Base Sepolia has been
tested end to end.

Both chains get the mainnet contract, `ShieldPoolPayments`, through the shared
`contracts/script/MainnetDeploy.sol`, the same deploy as Robinhood Chain and Tempo.
Base Sepolia is a dress rehearsal of Base mainnet, so it runs the ceremony's final
keys too, with test funds. The older testnets run the dev keys only
because they were deployed before the ceremony.

## What this deploys

1. PoseidonT3 (the 2-input hasher) from circomlibjs bytecode, the same code as on
   Robinhood Chain and Tempo.
2. The final-key Groth16 verifiers (shield, cash out, private send), their adapters
   and the `DualProofVerifier`. No pool is created unless they accept final-key proofs
   and reject dev-key ones.
3. `ShieldPoolPayments` (payments only, no swap code), with the shield verifier set,
   deposit limits on, each asset listed, the 0.25% cash-out fee to the treasury, the
   ownership handoff to the owner wallet started, and setup ended. Then every setting
   is read back and any mismatch fails the run.
4. Optional, recommended: the payment-memo board (`GloamPayMemo`), so a recipient can
   find a payment by scanning the chain with their Gloam address.

Not in this deploy, next: private swaps on Base (router v2 on Uniswap v4) and the
Relay bridge into Base.

## Network

| | Base Sepolia (first) | Base mainnet |
| --- | --- | --- |
| chainId | 84532 | 8453 |
| RPC for sends | https://sepolia.base.org | https://mainnet.base.org |
| RPC for log scans | https://base-sepolia-rpc.publicnode.com (50,000-block `eth_getLogs`) | https://base-rpc.publicnode.com (50,000-block `eth_getLogs`) |
| Explorer | https://sepolia.basescan.org | https://basescan.org |
| Gas | ETH (test ETH) | ETH |

The official RPCs are fine for sending, but not for scanning logs: Base Sepolia's
caps `eth_getLogs` at a 200-block range and Base mainnet's refuses it. Use a private
RPC for the server (`GLOAM_RPC_URL_84532`, `GLOAM_RPC_URL_8453`) once Base is on.

## Assets and limits

Checked on chain on 24 October 2026 (`symbol()`, `decimals()`). Beta limits match the
other chains: 500 per deposit and 25,000 in total for each stablecoin. ETH gets 0.2 per
deposit and 10 in total: about $467 and $23,400 at Chainlink's ETH/USD on Base that day
($2,337), round numbers just under the stablecoin caps.

| Asset | Base Sepolia | Base mainnet | Decimals | Per deposit (raw) | Total (raw) |
| --- | --- | --- | --- | --- | --- |
| USDC (Circle) | `0x036CbD53842c5426634e7929541eC2318f3dCF7e` | `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` | 6 | `500000000` | `25000000000` |
| EURC (Circle) | `0x808456652fdb597867f38412077A9182bf77359F` | `0x60a3E35Cc302bFA44Cb288Bc5a4F316Fdb1adb42` | 6 | `500000000` | `25000000000` |
| USDT (bridged Tether) | none | `0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2` | 6 | `500000000` | `25000000000` |
| ETH (native) | `0x0000000000000000000000000000000000000000` | same | 18 | `200000000000000000` | `10000000000000000000` |

- There is no Tether or Circle-grade USDT on Base Sepolia, so the testnet
  lists USDC, EURC and ETH only.
- USDT on Base is Tether bridged from Ethereum through Base's standard bridge (L1 token
  `0xdAC17F958D2ee523a2206206994597C13D831ec7`), not issued by Tether on Base. It has no
  blacklist and no upgrade key.
- USDC and EURC are Circle's upgradeable tokens with a blacklist. If Circle ever
  blacklisted the vault's own address, that asset would be frozen in the vault for
  everyone; other assets and the rest of the vault keep working. This is the same for
  USDC wherever it is listed.

## Roles

| Role | Address | Needs |
| --- | --- | --- |
| Deployer | `0x891E74a11abC5D0eC2EE855B2BD521fF9D18F411` | 0.01 ETH on each chain |
| Owner (browser wallet) | `0x76b7E410a227c888aBD2Bdc24Ee32E094B0FD4D8` | 0.001 ETH on each chain, for `acceptOwnership()` |
| Treasury (cash-out fees) | `0xB3900ac9350903218e4c7597bAb0f008F01B30B8` | nothing |
| Relayer | `0xb1E994586E62994648a0b866BF33F2EDd942512e` | 0.02 test ETH on Base Sepolia, 0.01 ETH on Base mainnet to start |

Why these amounts: the whole deploy (PoseidonT3, the pool with its verifiers and
setup calls, and the memo board) uses about 8.8M gas. At Base's gas price on 24
October 2026 (0.006 gwei) the forge part is about 0.00004 ETH, plus an L1 data fee
under 0.0000001 ETH. The PoseidonT3 step costs more than the rest together, about
0.0033 ETH, because its ethers v5 script adds a 1.5 gwei tip; a rehearsal of the whole
runbook on a local Base Sepolia fork spent 0.0033 ETH. 0.01 ETH leaves room for that
and for gas running much higher. A relayed
private send uses about 2M gas, about 0.000012 ETH at that price, so 0.01 ETH is
several hundred sends; the relay reports low balance below the cost of two sends.
The relayer is the same key as on the other chains (`GLOAM_RELAYER_PRIVATE_KEY`); any
extra relay key in `GLOAM_RELAYER_PRIVATE_KEYS` needs the same top-up.

Faucets for Base Sepolia (test funds):

- Test ETH: the Coinbase Developer Platform faucet (portal.cdp.coinbase.com, Faucets,
  Base Sepolia), or the Alchemy, QuickNode or Superchain faucets.
- Test USDC and EURC: faucet.circle.com, pick Base Sepolia. Send some to the wallet you
  will test deposits from.

## Prereqs

- Foundry and Node, run from `contracts/`. `contracts/lib/forge-std` checked out
  (`git submodule update --init contracts/lib/forge-std`) and
  `contracts/circuits/node_modules` installed (circomlibjs, ethers).
- The deployer funded on the chain you deploy to.
- For the same addresses as Robinhood Chain and Tempo, the deployer must have sent
  nothing yet on that chain (`cast nonce` shows 0). Then PoseidonT3 lands at
  `0x1a32C2c2A77225EC2dD3BF7be1018819b1039Cb4`, the `DualProofVerifier` at
  `0x1421353d471dF6C847713aee391Db38978fE714a`, the shield verifier at
  `0x69Fa6d2De0A66dA718DF022cEe98485AfDb03465` and the vault at
  `0x39e28cde55cab798874746ac52cb4b5cc99a0194`. The memo board comes next: at
  `0x01B3172d9900Cb26d57E986429b9b23854c74598` on Base Sepolia (nonce 17) and
  `0xfCa1887e77f738ef9C5751974b3f3873d029F2DC` on Base mainnet (nonce 18, one more
  setup call for USDT). Each of these addresses is empty on both Base chains today. If
  the nonce is not 0 the addresses differ, which is fine: paste back what the deploy
  prints.

## Base Sepolia

Run every block in one terminal, from `contracts/`. The key is read without echo, so
it lands in no file and no shell history.

### Step 1: settings

```bash
cd contracts
export PATH="$HOME/.foundry/bin:$PATH" FOUNDRY_DISABLE_NIGHTLY_WARNING=1
export RPC_URL=https://sepolia.base.org CHAIN=84532
read -rsp "Deployer private key (hidden): " DEPLOYER_PK; echo; export DEPLOYER_PK
cast wallet address --private-key "$DEPLOYER_PK"   # must print 0x891E74a11abC5D0eC2EE855B2BD521fF9D18F411
cast nonce 0x891E74a11abC5D0eC2EE855B2BD521fF9D18F411 --rpc-url $RPC_URL   # 0 for the same addresses as the other chains
cast balance 0x891E74a11abC5D0eC2EE855B2BD521fF9D18F411 --rpc-url $RPC_URL --ether
```

### Step 2: PoseidonT3

```bash
POSEIDON_T3_ONLY=1 node circuits/scripts/deploy-poseidon.mjs
# prints: chainId 84532 ... nonce 0, then "Poseidon2 0x..." (Poseidon2 is PoseidonT3, the 2-input hasher)
export POSEIDON2=0x1a32C2c2A77225EC2dD3BF7be1018819b1039Cb4   # or the address it printed
cast code $POSEIDON2 --rpc-url $RPC_URL | cast keccak
# must print 0x354b26999e434f8256d168395315e1f51fc15bf49bf2e6bb58fc549bd597e7da (same code as Robinhood Chain and Tempo)
```

### Step 3: the vault

```bash
export LIMIT_ASSETS=0x036CbD53842c5426634e7929541eC2318f3dCF7e,0x808456652fdb597867f38412077A9182bf77359F,0x0000000000000000000000000000000000000000
export LIMIT_PER_DEPOSIT=500000000,500000000,200000000000000000
export LIMIT_TOTAL=25000000000,25000000000,10000000000000000000
export WITHDRAW_FEE_BPS=25 FEE_RECIPIENT=0xB3900ac9350903218e4c7597bAb0f008F01B30B8
export NEW_OWNER=0x76b7E410a227c888aBD2Bdc24Ee32E094B0FD4D8 NEW_OWNER_EOA=1
SCRIPT=script/DeployBaseSepolia.s.sol:DeployBaseSepolia

# Dry run: nothing is sent. It must end with "All checks passed".
forge script $SCRIPT --rpc-url $RPC_URL

# Only if the dry run passed:
forge script $SCRIPT --rpc-url $RPC_URL --broadcast --slow
```

Read back the vault and its deploy block:

```bash
RUN=broadcast/DeployBaseSepolia.s.sol/$CHAIN/run-latest.json
POOL=$(jq -r '.transactions[] | select(.transactionType=="CREATE" and .contractName=="ShieldPoolPayments") | .contractAddress' $RUN)
HASH=$(jq -r '.transactions[] | select(.transactionType=="CREATE" and .contractName=="ShieldPoolPayments") | .hash' $RUN)
BLOCK=$(cast receipt $HASH blockNumber --rpc-url $RPC_URL)
DUAL=$(jq -r '.transactions[] | select(.transactionType=="CREATE" and .contractName=="DualProofVerifier") | .contractAddress' $RUN)
SHIELDI=$(jq -r '.transactions[] | select(.transactionType=="CREATE" and .contractName=="ShieldIVerifierFinal") | .contractAddress' $RUN)
echo "chain $CHAIN pool $POOL deployBlock $BLOCK tx $HASH poseidonT3 $POSEIDON2 dual $DUAL shieldVerifier $SHIELDI"
```

### Step 4 (optional, recommended): the payment-memo board

After the vault, so it does not move the vault's address. No owner, holds nothing.

```bash
forge script script/DeployGloamPayMemo.s.sol:DeployGloamPayMemo --rpc-url $RPC_URL               # dry run
forge script script/DeployGloamPayMemo.s.sol:DeployGloamPayMemo --rpc-url $RPC_URL --broadcast --slow
MRUN=broadcast/DeployGloamPayMemo.s.sol/$CHAIN/run-latest.json
MEMO=$(jq -r '.transactions[0].contractAddress' $MRUN)
MEMO_BLOCK=$(cast receipt $(jq -r '.transactions[0].hash' $MRUN) blockNumber --rpc-url $RPC_URL)
echo "memo $MEMO deployBlock $MEMO_BLOCK"
```

### Step 5: verify the source

On Basescan, with an Etherscan API V2 key (one key covers every Etherscan chain; if the
key's plan leaves Base out, the call says so and Sourcify below still works):

```bash
read -rsp "Etherscan API key (hidden): " ETHERSCAN_API_KEY; echo; export ETHERSCAN_API_KEY
jq -r '.transactions[] | select(.transactionType=="CREATE") | "\(.contractAddress) \(.contractName)"' $RUN |
while read -r addr name; do
  src=$(grep -rlE --include='*.sol' "^contract $name( |\{)" src | head -1)
  forge verify-contract "$addr" "$src:$name" --chain $CHAIN --verifier etherscan \
    --rpc-url $RPC_URL --guess-constructor-args --watch
done
```

On Sourcify (no key; Blockscout shows Sourcify sources):

```bash
jq -r '.transactions[] | select(.transactionType=="CREATE") | "\(.contractAddress) \(.contractName)"' $RUN |
while read -r addr name; do
  src=$(grep -rlE --include='*.sol' "^contract $name( |\{)" src | head -1)
  forge verify-contract "$addr" "$src:$name" --chain $CHAIN --verifier sourcify --watch
done
```

Add the memo board the same way (`src/GloamPayMemo.sol:GloamPayMemo`, no constructor
arguments). PoseidonT3 is raw circomlibjs bytecode with no Solidity source; its code
hash check in step 2 stands in for verification. `ShieldPoolPayments` takes
`(poseidon2, verifier)` = `($POSEIDON2, $DUAL)` if you ever pass them by hand:
`--constructor-args $(cast abi-encode "constructor(address,address)" $POSEIDON2 $DUAL)`.

### Step 6: accept ownership

The vault's owner is still the deployer until the owner wallet accepts. With the
browser wallet `0x76b7…D4D8` on Base Sepolia, open the vault on
sepolia.basescan.org, Contract, Write Contract, connect, and call `acceptOwnership()`
(Blockscout's Write tab works the same once Sourcify has the source). It moves no
funds. Check it:

```bash
cast call $POOL 'owner()(address)' --rpc-url $RPC_URL    # 0x76b7E410a227c888aBD2Bdc24Ee32E094B0FD4D8
cast call $POOL 'pendingOwner()(address)' --rpc-url $RPC_URL   # 0x0000000000000000000000000000000000000000
```

### Step 7: fund the relayer

Send 0.02 test ETH to `0xb1E994586E62994648a0b866BF33F2EDd942512e` on Base Sepolia.

### What to paste back

```
chain 84532 pool 0x... deployBlock ... tx 0x...
poseidonT3 0x... dual 0x... shieldVerifier 0x...
memo 0x... memoDeployBlock ...        (if step 4 ran)
owner accepted: yes/no   relayer funded: yes/no
```

## Base mainnet

Only after Base Sepolia has been tested end to end in the app (deposit, private send,
cash out, payroll, a payment request and a proof). Same steps with these changes:

```bash
export RPC_URL=https://mainnet.base.org CHAIN=8453
export LIMIT_ASSETS=0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913,0x60a3E35Cc302bFA44Cb288Bc5a4F316Fdb1adb42,0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2,0x0000000000000000000000000000000000000000
export LIMIT_PER_DEPOSIT=500000000,500000000,500000000,200000000000000000
export LIMIT_TOTAL=25000000000,25000000000,25000000000,10000000000000000000
SCRIPT=script/DeployBaseMainnet.s.sol:DeployBaseMainnet
RUN=broadcast/DeployBaseMainnet.s.sol/$CHAIN/run-latest.json
```

Accept ownership on basescan.org, and fund the relayer with 0.01 ETH on Base. This is
mainnet: if the dry run or the read-back fails, do not announce the vault; deploy a
fresh one.

## After the deploy

Paste the values back and the app, SDK and MCP get switched on in one change:

- `BASE_SEPOLIA_POOL` (84532) and `MAINNET_POOLS[8453]` in `app/src/lib/mainnet.ts` and
  `packages/sdk/src/mainnet.ts`: the vault and its deploy block. Until both are in, that
  Base network stays hidden everywhere (app, API, relay, MCP, Glim, proofs).
- The memo board address and block in the Base network entries, if deployed.
- Vercel server env: `GLOAM_RPC_URL_84532` and `GLOAM_RPC_URL_8453`, a private RPC each
  (never `NEXT_PUBLIC_`). The relay serves Base with the same relayer key.
- `contracts/deployments/`: the addresses, blocks and limits, as for the other chains.

## Do not

- Run `DeployBaseMainnet` before Base Sepolia has been tested end to end.
- Deploy with dev keys, or point a Base vault at a dev-key verifier. The script refuses.
- List a rebasing or fee-on-transfer token. Listing a new asset or raising a limit later
  takes the 3-day timelock; lowering one (down to 0 to close deposits) is immediate.
- Lose `broadcast/` before the addresses are pasted back: it is gitignored and holds the
  only local record of the run.
