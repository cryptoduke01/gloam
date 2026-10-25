# Deploy Gloam to Ethereum

The runbook for bringing the Gloam vault to Ethereum mainnet (`1`). You run this with
your own keys; no agent and no CI deploys it. Ethereum has no Gloam testnet of its own:
Base Sepolia runs the same contract, keys and deploy script path, so it is the
rehearsal for the shared code, and a local fork of Ethereum mainnet is the rehearsal
for this chain (see [Rehearsal](#rehearsal-on-a-fork)).

Ethereum gets the mainnet contract, `ShieldPoolPayments`, through the shared
`contracts/script/MainnetDeploy.sol`, the same deploy as Robinhood Chain, Tempo and
Base, with native ETH listed.

## What this deploys

1. PoseidonT3 (the 2-input hasher) from circomlibjs bytecode, the same code as on the
   other chains.
2. The final-key Groth16 verifiers (shield, cash out, private send), their adapters and
   the `DualProofVerifier`. No pool is created unless they accept final-key proofs and
   reject dev-key ones.
3. `ShieldPoolPayments` (payments only, no swap code), with the shield verifier set,
   deposit limits on, each asset listed, the 0.25% cash-out fee to the treasury, the
   ownership handoff to the owner wallet started, and setup ended. Then every setting
   is read back and any mismatch fails the run.
4. Optional, recommended: the payment-memo board (`GloamPayMemo`), so a recipient can
   find a payment by scanning the chain with their Gloam address. It costs gas to post
   to, and the relay pays for relayed memos, so it can wait.

Not in this deploy: private swaps on Ethereum, and the Relay bridge into Ethereum
(Ethereum stays a chain money can be brought over from, into the other chains).

## Network

| | Ethereum mainnet |
| --- | --- |
| chainId | 1 |
| RPC for sends (deploy) | https://ethereum-rpc.publicnode.com |
| RPC for log scans | https://rpc.mevblocker.io (old state, `eth_getLogs` over 10,000 blocks) |
| Explorer | https://etherscan.io |
| Gas | ETH |

Public RPCs checked on 25 October 2026 for `eth_getLogs`:

| RPC | What it serves |
| --- | --- |
| `rpc.mevblocker.io` | Old state and logs; any range up to 10,000 blocks, or any range under 10,000 logs. The app's default |
| `ethereum-rpc.publicnode.com` | Only the last ~10,000 blocks of logs and 128 blocks of state ("Archive requests require a personal token") |
| `gateway.tenderly.co/public/mainnet` | Old logs, but a wide range with many logs comes back cut short with no error |
| `eth.drpc.org`, `1rpc.io`, `cloudflare-eth.com`, `eth-mainnet.public.blastapi.io` | 10,000, 50, 800 and 10 blocks; too small |
| `eth.llamarpc.com`, `eth.merkle.io`, `rpc.ankr.com/eth` | Down, rate limited, or a key needed |

So the app reads Ethereum through MEV Blocker with 10,000-block spans, and the server
must have its own RPC: set `GLOAM_RPC_URL_1` to a private archive RPC (Alchemy,
QuickNode, a paid publicnode token) before Ethereum is switched on. The server tries it
first and MEV Blocker after it.

## Assets and limits

Checked on chain on 25 October 2026 (`symbol()`, `name()`, `decimals()`). Beta limits
match the other chains: 500 per deposit and 25,000 in total for each stablecoin; ETH 0.2
per deposit and 10 in total (about $471 and $23,550 at Chainlink's ETH/USD that day,
$2,354.93).

| Asset | Address | Name on chain | Decimals | Per deposit (raw) | Total (raw) |
| --- | --- | --- | --- | --- | --- |
| USDC (Circle) | `0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48` | USD Coin | 6 | `500000000` | `25000000000` |
| USDT (Tether) | `0xdAC17F958D2ee523a2206206994597C13D831ec7` | Tether USD | 6 | `500000000` | `25000000000` |
| USDG (Paxos) | `0xe343167631d89B6Ffc58B88d6b7fB0228795491D` | Global Dollar | 6 | `500000000` | `25000000000` |
| PYUSD (Paxos for PayPal) | `0x6c3ea9036406852006290770BEdFcAbA0e23A0e8` | PayPal USD | 6 | `500000000` | `25000000000` |
| EURC (Circle) | `0x1aBaEA1f7C830bD89Acc67eC4af516284b1bC33c` | Euro Coin | 6 | `500000000` | `25000000000` |
| ETH (native) | `0x0000000000000000000000000000000000000000` | | 18 | `200000000000000000` | `10000000000000000000` |

- **USDT.** Its `transfer`, `transferFrom` and `approve` return nothing, and `approve`
  refuses to change one non-zero allowance into another. The pool pulls and pays out
  with low-level calls that accept no return data (proven on the fork, below). The app,
  the MCP server and the SDK examples set a stale USDT allowance to 0 before approving a
  deposit (`approvalSteps` in the SDK). Tether's transfer fee is off (`basisPointsRate`
  0); if Tether ever turned it on, every USDT deposit would revert with
  `FeeOnTransferNotSupported`: nothing taken, nothing stuck.
- **EURC is a euro stablecoin.** The app never counts it as a dollar.
- **Issuer controls.** Circle, Tether and Paxos can each freeze an address on their
  tokens. If one froze the vault's own address, that asset would be frozen in the vault
  for everyone; the other assets and the rest of the vault keep working.

## Roles and funding

| Role | Address | Has now (25 Oct) | Needs |
| --- | --- | --- | --- |
| Deployer | `0x891E74a11abC5D0eC2EE855B2BD521fF9D18F411` | 0 ETH, nonce 0 | **0.01 ETH** |
| Owner (browser wallet) | `0x76b7E410a227c888aBD2Bdc24Ee32E094B0FD4D8` | 0.00073 ETH | nothing more (accepting costs about 28,400 gas) |
| Treasury (cash-out fees) | `0xB3900ac9350903218e4c7597bAb0f008F01B30B8` | | nothing |
| Relayer | `0xb1E994586E62994648a0b866BF33F2EDd942512e` | 0 ETH | **0.02 ETH** to start |

Measured on a local fork of Ethereum mainnet (below):

| Step | Gas |
| --- | --- |
| PoseidonT3 | 2,157,126 |
| Verifiers, adapters, `DualProofVerifier` | 2,420,145 |
| `ShieldPoolPayments` | 3,686,378 |
| Setup calls (shield verifier, limits on, 6 assets, fee, owner handoff, end setup) | 510,428 |
| Memo board (optional) | 152,323 |
| **Whole deploy, deployer** | **8,926,400** (8,774,077 without the memo board) |
| `acceptOwnership()`, owner | 28,358 |

What that costs:

| Gas price | Whole deploy | `acceptOwnership` |
| --- | --- | --- |
| 0.03 gwei (25 Oct: 0.035) | 0.00027 ETH (about $0.63) | 0.000001 ETH |
| 1 gwei | 0.0089 ETH (about $21) | 0.00003 ETH |
| 5 gwei | 0.045 ETH (about $105) | 0.00014 ETH |
| 20 gwei | 0.18 ETH (about $420) | 0.00057 ETH |

Why 0.01 ETH for the deployer: at Monday's likely 0.03 to 0.1 gwei the deploy costs
under 0.001 ETH, but the node checks each transaction's gas limit times its max fee
against the balance before taking it. The pool is the biggest (about 4.8M gas with
forge's estimate margin), so with forge capped at 1 gwei it needs 0.0048 ETH in hand at
that point. 0.01 ETH covers that, the rest, and a deploy at up to about 1 gwei. Deploy
only while `cast gas-price` reads under 0.5 gwei.

PoseidonT3 goes out through an ethers v5 script, which by default tips 1.5 gwei: about
0.0033 ETH on Ethereum, ten times the rest of the deploy on a quiet day. Set
`PRIORITY_FEE_GWEI=0.01` (step 2) and it tips that instead.

Why 0.02 ETH for the relayer: the relay pays the gas of every relayed private send and
cash out. Measured on the fork with real final-key proofs:

| Relayed call | Gas | At 0.035 gwei | At 1 gwei | At 3 gwei (the ceiling) |
| --- | --- | --- | --- | --- |
| Private send | about 1.88M | 0.000066 ETH ($0.15) | 0.0019 ETH ($4.43) | 0.0056 ETH ($13.30) |
| Cash out, USDT | about 0.45M | 0.000016 ETH | 0.00045 ETH | 0.0014 ETH |
| Cash out, ETH | about 0.68M | 0.000024 ETH | 0.00068 ETH | 0.0020 ETH |

Deposits are paid by the person depositing (about 1.28M gas for USDT, 1.45M for ETH).
0.02 ETH is about 300 private sends at today's gas, or 3 at the ceiling. The relay calls
itself low below two sends' worth of gas (2 x 2.4M gas at the current price, never more
than the ceiling), so top it up as it runs down.

## The relay's gas ceiling

The relay will not pay any gas price on Ethereum. `GLOAM_RELAY_MAX_GAS_GWEI_1` (Vercel
server env, never `NEXT_PUBLIC_`) sets the ceiling in gwei; unset it is **3 gwei**.
`off` turns it off; a value that is not a number keeps 3. The other chains have no
ceiling unless `GLOAM_RELAY_MAX_GAS_GWEI_<chainId>` sets one.

- Over the ceiling the relay sends nothing: a private send, cash out, payroll payment or
  memo is refused with code `gas_high` and "Ethereum gas is high right now; try again
  shortly." before the dry run, and the app says so next to Hide my wallet. Turning Hide
  my wallet off sends from the wallet, which pays its own gas.
- Under it, a send never offers more than 1.5 times the ceiling per unit of gas (4.5
  gwei), so a spike between the check and inclusion is bounded too.
- A cash out for later still schedules while gas is high. When it comes due it waits,
  still scheduled and still cancellable, and is looked at again every 5 minutes until
  gas is back under the ceiling; after 3 days it gives up and nothing moves.
- `/api/relay` reports `gasHigh`, `gasGwei` and `maxGasGwei` per chain; the relay stays
  `enabled` while gas is high.

At 3 gwei a relayed private send costs Gloam about $13. Lower the ceiling (for example
`GLOAM_RELAY_MAX_GAS_GWEI_1=1`, about $4.40 a send) if that is more than the relay
should spend; raise it only on purpose.

## Prereqs

- Foundry and Node, run from `contracts/`. `contracts/lib/forge-std` checked out
  (`git submodule update --init contracts/lib/forge-std`) and
  `contracts/circuits/node_modules` installed (circomlibjs, ethers).
- The deployer funded with 0.01 ETH on Ethereum.
- For the same addresses as the other chains, the deployer must have sent nothing yet on
  Ethereum (`cast nonce` shows 0; it did on 25 October). Then:

| Nonce | Contract | Address |
| --- | --- | --- |
| 0 | PoseidonT3 | `0x1a32C2c2A77225EC2dD3BF7be1018819b1039Cb4` |
| 2 | Shield verifier (`ShieldIVerifierFinal`) | `0x69Fa6d2De0A66dA718DF022cEe98485AfDb03465` |
| 7 | `DualProofVerifier` | `0x1421353d471dF6C847713aee391Db38978fE714a` |
| 8 | `ShieldPoolPayments` (the vault) | `0x39e28cde55cab798874746ac52cb4b5cc99a0194` |
| 20 | `GloamPayMemo` (after 11 setup calls) | `0x8699D015087dE6D25d55d5ceB63b34b9d773f135` |

Each was empty on Ethereum on 25 October 2026. If the nonce is not 0 the addresses
differ, which is fine: paste back what the deploy prints.

## Steps

Run every block in one terminal, from `contracts/`. The key is read without echo, so it
lands in no file and no shell history.

### Step 1: settings and gas

```bash
cd contracts
export PATH="$HOME/.foundry/bin:$PATH" FOUNDRY_DISABLE_NIGHTLY_WARNING=1
export RPC_URL=https://ethereum-rpc.publicnode.com CHAIN=1
read -rsp "Deployer private key (hidden): " DEPLOYER_PK; echo; export DEPLOYER_PK
cast wallet address --private-key "$DEPLOYER_PK"   # must print 0x891E74a11abC5D0eC2EE855B2BD521fF9D18F411
cast chain-id --rpc-url $RPC_URL                   # 1
cast nonce 0x891E74a11abC5D0eC2EE855B2BD521fF9D18F411 --rpc-url $RPC_URL   # 0 for the same addresses as the other chains
cast balance 0x891E74a11abC5D0eC2EE855B2BD521fF9D18F411 --rpc-url $RPC_URL --ether   # 0.01
cast gas-price --rpc-url $RPC_URL | cast from-wei --unit gwei   # go on only under 0.5
```

### Step 2: PoseidonT3

```bash
POSEIDON_T3_ONLY=1 PRIORITY_FEE_GWEI=0.01 node circuits/scripts/deploy-poseidon.mjs
# prints: chainId 1 ... nonce 0, then "Poseidon2 0x..." (Poseidon2 is PoseidonT3, the 2-input hasher)
export POSEIDON2=0x1a32C2c2A77225EC2dD3BF7be1018819b1039Cb4   # or the address it printed
cast code $POSEIDON2 --rpc-url $RPC_URL | cast keccak
# must print 0x354b26999e434f8256d168395315e1f51fc15bf49bf2e6bb58fc549bd597e7da (same code as the other chains)
```

### Step 3: the vault

```bash
export LIMIT_ASSETS=0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48,0xdAC17F958D2ee523a2206206994597C13D831ec7,0xe343167631d89B6Ffc58B88d6b7fB0228795491D,0x6c3ea9036406852006290770BEdFcAbA0e23A0e8,0x1aBaEA1f7C830bD89Acc67eC4af516284b1bC33c,0x0000000000000000000000000000000000000000
export LIMIT_PER_DEPOSIT=500000000,500000000,500000000,500000000,500000000,200000000000000000
export LIMIT_TOTAL=25000000000,25000000000,25000000000,25000000000,25000000000,10000000000000000000
export WITHDRAW_FEE_BPS=25 FEE_RECIPIENT=0xB3900ac9350903218e4c7597bAb0f008F01B30B8
export NEW_OWNER=0x76b7E410a227c888aBD2Bdc24Ee32E094B0FD4D8 NEW_OWNER_EOA=1
SCRIPT=script/DeployEthereumMainnet.s.sol:DeployEthereumMainnet

# Dry run: nothing is sent. It must end with "All checks passed".
forge script $SCRIPT --rpc-url $RPC_URL

# Only if the dry run passed. Pays at most 1 gwei per unit of gas, tips 0.01 gwei.
forge script $SCRIPT --rpc-url $RPC_URL --broadcast --slow --with-gas-price 1gwei --priority-gas-price 0.01gwei
```

`--slow` waits for each transaction before the next (about 12 seconds a block, so a few
minutes for all 19). If gas jumps over 1 gwei mid-run the next transaction waits in the
mempool; if forge gives up waiting, run the same command with `--resume` once it lands.

Read back the vault and its deploy block:

```bash
RUN=broadcast/DeployEthereumMainnet.s.sol/$CHAIN/run-latest.json
POOL=$(jq -r '.transactions[] | select(.transactionType=="CREATE" and .contractName=="ShieldPoolPayments") | .contractAddress' $RUN)
HASH=$(jq -r '.transactions[] | select(.transactionType=="CREATE" and .contractName=="ShieldPoolPayments") | .hash' $RUN)
BLOCK=$(cast receipt $HASH blockNumber --rpc-url $RPC_URL)
DUAL=$(jq -r '.transactions[] | select(.transactionType=="CREATE" and .contractName=="DualProofVerifier") | .contractAddress' $RUN)
SHIELDI=$(jq -r '.transactions[] | select(.transactionType=="CREATE" and .contractName=="ShieldIVerifierFinal") | .contractAddress' $RUN)
echo "chain $CHAIN pool $POOL deployBlock $BLOCK tx $HASH poseidonT3 $POSEIDON2 dual $DUAL shieldVerifier $SHIELDI"
```

### Step 4 (optional): the payment-memo board

After the vault, so it does not move the vault's address. No owner, holds nothing.

```bash
forge script script/DeployGloamPayMemo.s.sol:DeployGloamPayMemo --rpc-url $RPC_URL               # dry run
forge script script/DeployGloamPayMemo.s.sol:DeployGloamPayMemo --rpc-url $RPC_URL --broadcast --slow --with-gas-price 1gwei --priority-gas-price 0.01gwei
MRUN=broadcast/DeployGloamPayMemo.s.sol/$CHAIN/run-latest.json
MEMO=$(jq -r '.transactions[0].contractAddress' $MRUN)
MEMO_BLOCK=$(cast receipt $(jq -r '.transactions[0].hash' $MRUN) blockNumber --rpc-url $RPC_URL)
echo "memo $MEMO deployBlock $MEMO_BLOCK"
```

### Step 5: verify the source

On Etherscan, with an Etherscan API V2 key:

```bash
read -rsp "Etherscan API key (hidden): " ETHERSCAN_API_KEY; echo; export ETHERSCAN_API_KEY
jq -r '.transactions[] | select(.transactionType=="CREATE") | "\(.contractAddress) \(.contractName)"' $RUN |
while read -r addr name; do
  src=$(grep -rlE --include='*.sol' "^contract $name( |\{)" src | head -1)
  forge verify-contract "$addr" "$src:$name" --chain $CHAIN --verifier etherscan \
    --rpc-url $RPC_URL --guess-constructor-args --watch
done
```

Sourcify works the same with `--verifier sourcify` and no key. Add the memo board the
same way (`src/GloamPayMemo.sol:GloamPayMemo`, no constructor arguments). PoseidonT3 is
raw circomlibjs bytecode with no Solidity source; the code hash check in step 2 stands in
for verification. `ShieldPoolPayments` takes `(poseidon2, verifier)` = `($POSEIDON2,
$DUAL)`.

### Step 6: accept ownership

The vault's owner is still the deployer until the owner wallet accepts. With the browser
wallet `0x76b7…D4D8` on Ethereum, open the vault on etherscan.io, Contract, Write
Contract, connect, and call `acceptOwnership()`. It moves no funds and costs about 28,400
gas (0.000001 ETH at today's price). Check it:

```bash
cast call $POOL 'owner()(address)' --rpc-url $RPC_URL          # 0x76b7E410a227c888aBD2Bdc24Ee32E094B0FD4D8
cast call $POOL 'pendingOwner()(address)' --rpc-url $RPC_URL   # 0x0000000000000000000000000000000000000000
```

### Step 7: fund the relayer

Send 0.02 ETH to `0xb1E994586E62994648a0b866BF33F2EDd942512e` on Ethereum.

### What to paste back

```
chain 1 pool 0x... deployBlock ... tx 0x...
poseidonT3 0x... dual 0x... shieldVerifier 0x...
memo 0x... memoDeployBlock ...        (if step 4 ran)
owner accepted: yes/no   relayer funded: yes/no
```

## Rehearsal on a fork

Done on 25 October 2026 and repeatable:

- **The runbook.** An anvil fork of Ethereum mainnet (`anvil --fork-url
  https://gateway.tenderly.co/public/mainnet`), a throwaway deployer funded on the fork,
  then steps 2, 3, 4 and 6 exactly as above: the PoseidonT3 code hash matched, the dry
  run ended "All checks passed", the broadcast sent 19 transactions (8.77M gas), the memo
  board 152k, and `acceptOwnership()` from the owner wallet (impersonated on the fork)
  left `owner` the owner wallet and `pendingOwner` empty, with setup ended, limits on and
  the fee 25 bps.
- **The vault on real tokens.** `test/fork/EthereumMainnetFork.t.sol` deploys with these
  settings on a fork, has the owner accept, then puts real USDT and ETH through the vault
  with proofs made with the ceremony's final keys (`test/fixtures/ethereum-fork-proofs.json`,
  from `circuits/scripts/gen-ethereum-fork-proofs.mjs`): USDT's approve rule, a deposit
  of each, a private send, a cash out of each with the 0.25% fee, and the fees collected
  by the treasury.

```bash
ETH_FORK=1 forge test --match-path test/fork/EthereumMainnetFork.t.sol -vv
```

`test/DeployChains.t.sol` checks that every mainnet deploy script, this one included,
refuses every chain but its own.

## After the deploy: switching Ethereum on

Paste the values back and the app, SDK and MCP get switched on in one change:

- `MAINNET_POOLS[1]` in `app/src/lib/mainnet.ts` and `packages/sdk/src/mainnet.ts`: the
  vault and its deploy block. Until both are in, Ethereum stays hidden everywhere (app,
  API, relay, MCP, Glim, proofs).
- The memo board, if deployed: `payMemo` on the `ethereum-mainnet` entry in
  `app/src/lib/networks.ts`, `payMemo` in the SDK's Ethereum mainnet spec
  (`packages/sdk/src/constants.ts`) and `PAY_MEMO_BOARDS[1]` in
  `packages/sdk/src/incoming.ts`.
- Vercel server env: `GLOAM_RPC_URL_1`, a private archive RPC (required: the public
  ones cannot rebuild the vault tree), and `GLOAM_RELAY_MAX_GAS_GWEI_1` only to move the
  ceiling off 3 gwei.
- A release with the pool in: `@gloamtrade/sdk` 0.4.x, `@gloamtrade/mcp` 0.6.x and
  `@gloamtrade/mppx-gloam` 0.3.x (publish with pnpm).
- `contracts/deployments/mainnet.json`: the addresses, block and limits, as for the
  other chains.

## Do not

- Deploy with dev keys, or point the vault at a dev-key verifier. The script refuses.
- Deploy while gas is high: check `cast gas-price` first and keep `--with-gas-price`.
- List a rebasing or fee-on-transfer token. Listing a new asset or raising a limit later
  takes the 3-day timelock; lowering one (down to 0 to close deposits) is immediate.
- Switch Ethereum on before `GLOAM_RPC_URL_1` is set on the server.
- Lose `broadcast/` before the addresses are pasted back: it is gitignored and holds the
  only local record of the run.
