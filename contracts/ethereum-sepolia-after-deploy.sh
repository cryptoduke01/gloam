#!/bin/bash
# After the Ethereum Sepolia deploy (DEPLOY-ETHEREUM-SEPOLIA.md, step 7). Run from contracts/:
#   ./ethereum-sepolia-after-deploy.sh            (ACCEPT_TX=0x... adds the acceptOwnership hash)
# It reads the deploy back from the chain and stops at the first thing that is not as the
# runbook set it. If all is right it writes deployments/ethereum-sepolia.json and fills in
# ETHEREUM_SEPOLIA_POOL in app/src/lib/mainnet.ts and packages/sdk/src/mainnet.ts, which is
# the whole switch-on. Reads only: it sends nothing and needs no key.
set -euo pipefail
cd "$(dirname "$0")"
export PATH="$HOME/.foundry/bin:/Users/duke/.nvm/versions/node/v24.11.1/bin:$PATH" FOUNDRY_DISABLE_NIGHTLY_WARNING=1

RPC_URL=${RPC_URL:-https://ethereum-sepolia-rpc.publicnode.com}
CHAIN=11155111
RUN=broadcast/DeployEthereumSepolia.s.sol/$CHAIN/run-latest.json
MRUN=broadcast/DeployGloamPayMemo.s.sol/$CHAIN/run-latest.json
APP_FILE=../app/src/lib/mainnet.ts
SDK_FILE=../packages/sdk/src/mainnet.ts
OFF='export const ETHEREUM_SEPOLIA_POOL: TestnetPoolInput = { pool: null, deployBlock: null, payMemo: null, payMemoBlock: null };'

DEPLOYER=0x891E74a11abC5D0eC2EE855B2BD521fF9D18F411
OWNER=0x76b7E410a227c888aBD2Bdc24Ee32E094B0FD4D8
TREASURY=0xB3900ac9350903218e4c7597bAb0f008F01B30B8
RELAYER=0xb1E994586E62994648a0b866BF33F2EDd942512e
ZERO=0x0000000000000000000000000000000000000000
# The same contracts as on Base Sepolia, byte for byte, when the deployer started at nonce 0.
POSEIDON_T3=0x1a32C2c2A77225EC2dD3BF7be1018819b1039Cb4
POSEIDON_T3_CODE=0x354b26999e434f8256d168395315e1f51fc15bf49bf2e6bb58fc549bd597e7da
CANON_POOL=0x39E28Cde55CAB798874746ac52cb4B5Cc99a0194
POOL_CODE=0x58d9843b0c6d9b81fbbb015de6a2413a7443cc63476185edf43d882f672088f2
MEMO_CODE=0xf24e84ff514b7b8e3eba03c4b7ac70bbeb8b799b5fd3006d552a34362cf5edae
# Symbol, address, per deposit, total: what ethereum-sepolia-env.sh listed.
ASSETS=(
  "USDC 0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238 500000000 25000000000"
  "USDG 0xfBb2A78CceEb415b00300925e464C3E44E6e06b0 500000000 25000000000"
  "PYUSD 0xCaC524BcA292aaade2DF8A05cC58F0a65B1B3bB9 500000000 25000000000"
  "EURC 0x08210F9170F89Ab7658F0B5E3fF39b0E03C594D4 500000000 25000000000"
  "ETH $ZERO 200000000000000000 10000000000000000000"
)

fail() { echo "STOP: $*" >&2; echo "Nothing was written. Fix it, or tell the team before turning Ethereum Sepolia on." >&2; exit 1; }
ok() { echo "ok    $*"; }
lc() { tr '[:upper:]' '[:lower:]' <<<"$1"; }
same() { [ "$(lc "$1")" = "$(lc "$2")" ]; }
call() { cast call "$@" --rpc-url "$RPC_URL"; }

[ -f "$RUN" ] || fail "$RUN is missing: run this from the contracts/ folder the deploy ran in."
[ -f "$MRUN" ] || fail "$MRUN is missing: deploy the memo board first (step 4)."
grep -qF "$OFF" "$APP_FILE" || fail "$APP_FILE has no empty ETHEREUM_SEPOLIA_POOL line: already switched on?"
grep -qF "$OFF" "$SDK_FILE" || fail "$SDK_FILE has no empty ETHEREUM_SEPOLIA_POOL line: already switched on?"
[ "$(cast chain-id --rpc-url "$RPC_URL")" = "$CHAIN" ] || fail "$RPC_URL is not Ethereum Sepolia."

created() { jq -r --arg n "$1" '[.transactions[] | select(.transactionType=="CREATE" and .contractName==$n)][0].contractAddress // empty' "$RUN"; }
createTx() { jq -r --arg n "$1" '[.transactions[] | select(.transactionType=="CREATE" and .contractName==$n)][0].hash // empty' "$RUN"; }
blockOf() { cast to-dec "$(cast receipt "$1" blockNumber --rpc-url "$RPC_URL")"; }

POOL=$(cast to-check-sum-address "$(created ShieldPoolPayments)")
POOL_TX=$(createTx ShieldPoolPayments)
BLOCK=$(blockOf "$POOL_TX")
DUAL=$(cast to-check-sum-address "$(created DualProofVerifier)")
SHIELD_I=$(cast to-check-sum-address "$(created ShieldIVerifierFinal)")
MEMO=$(cast to-check-sum-address "$(jq -r '.transactions[0].contractAddress' "$MRUN")")
MEMO_TX=$(jq -r '.transactions[0].hash' "$MRUN")
MEMO_BLOCK=$(blockOf "$MEMO_TX")
POSEIDON=$(cast to-check-sum-address "$(call "$POOL" 'poseidon2()(address)')")
echo "pool $POOL block $BLOCK, memo board $MEMO block $MEMO_BLOCK"

# Every transaction of both runs landed.
for r in "$RUN" "$MRUN"; do
  bad=$(jq -r '[.receipts[] | select(.status != "0x1")] | length' "$r")
  [ "$bad" = "0" ] || fail "$bad transaction(s) in $r did not succeed."
done
ok "every deploy transaction succeeded"

# The vault as the runbook set it up.
same "$(call "$POOL" 'owner()(address)')" "$OWNER" || fail "the owner is not 0x76b7…D4D8 yet: accept ownership first (step 6)."
same "$(call "$POOL" 'pendingOwner()(address)')" "$ZERO" || fail "pendingOwner is not empty."
ok "owner is the owner wallet, nothing pending"
[ "$(call "$POOL" 'setupMode()(bool)')" = "false" ] || fail "setup was not ended."
[ "$(call "$POOL" 'depositLimitsOn()(bool)')" = "true" ] || fail "deposit limits are off."
[ "$(call "$POOL" 'withdrawFeeBps()(uint16)')" = "25" ] || fail "the cash-out fee is not 25 bps."
same "$(call "$POOL" 'feeRecipient()(address)')" "$TREASURY" || fail "the fee does not go to the treasury."
same "$(call "$POOL" 'verifier()(address)')" "$DUAL" || fail "the spend verifier is not the deploy's DualProofVerifier."
same "$(call "$POOL" 'shieldVerifier()(address)')" "$SHIELD_I" || fail "the shield verifier is not the deploy's."
ok "setup ended, limits on, 0.25% to the treasury, the deploy's verifiers"
for a in "${ASSETS[@]}"; do
  read -r sym addr per total <<<"$a"
  got=$(call "$POOL" 'depositLimit(address)(uint128,uint128)' "$addr" | awk '{print $1}' | paste -sd' ' -)
  [ "$got" = "$per $total" ] || fail "$sym limit is '$got', not '$per $total'."
done
ok "USDC, USDG, PYUSD, EURC and ETH listed at 500 / 25,000 and 0.2 / 10"

# The code, the same as on the other chains.
[ "$(cast code "$POSEIDON" --rpc-url "$RPC_URL" | cast keccak)" = "$POSEIDON_T3_CODE" ] || fail "PoseidonT3's code is not circomlibjs's."
[ "$(cast code "$MEMO" --rpc-url "$RPC_URL" | cast keccak)" = "$MEMO_CODE" ] || fail "the memo board's code differs from Base Sepolia's."
if same "$POOL" "$CANON_POOL" && same "$POSEIDON" "$POSEIDON_T3"; then
  [ "$(cast code "$POOL" --rpc-url "$RPC_URL" | cast keccak)" = "$POOL_CODE" ] || fail "the vault's code differs from Base Sepolia's."
  ok "PoseidonT3, the vault and the memo board are byte for byte the Base Sepolia ones, at the same addresses"
else
  echo "note  the addresses differ from the other chains (the deployer's nonce was not 0); the vault's code embeds them, so its hash is not compared"
fi
echo "relayer balance: $(cast balance "$RELAYER" --rpc-url "$RPC_URL" --ether) ETH"

# The deployment record.
contract() { jq -n --arg n "$1" --arg a "$(cast to-check-sum-address "$(created "$1")")" '{($n): $a}'; }
CONTRACTS=$(jq -s 'add' <(contract ShieldVerifierFinal) <(contract UnshieldVerifierFinal) <(contract UnshieldIVerifierFinal) <(contract TransferVerifierFinal) <(contract TransferIVerifierFinal))
jq -n \
  --arg date "$(date -u +%Y-%m-%d)" --arg pool "$POOL" --argjson block "$BLOCK" --arg tx "$POOL_TX" \
  --arg poseidon "$POSEIDON" --arg dual "$DUAL" --arg shieldI "$SHIELD_I" \
  --arg memo "$MEMO" --argjson memoBlock "$MEMO_BLOCK" --arg memoTx "$MEMO_TX" \
  --arg accept "${ACCEPT_TX:-}" --argjson verifiers "$CONTRACTS" \
  --arg deployer "$DEPLOYER" --arg owner "$OWNER" --arg treasury "$TREASURY" --arg relayer "$RELAYER" \
  --arg poseidonCode "$POSEIDON_T3_CODE" \
  '{
    deployedAt: $date,
    network: "Ethereum Sepolia",
    chainId: 11155111,
    testnet: true,
    note: "Ethereum'"'"'s testnet: the mainnet contract (ShieldPoolPayments) on the ceremony'"'"'s final keys, with the mainnet beta deposit limits and cash-out fee. Deployed with script/DeployEthereumSepolia.s.sol (DEPLOY-ETHEREUM-SEPOLIA.md) and read back by ethereum-sepolia-after-deploy.sh.",
    ceremony: "final (13 contributors, drand 6561386, release ceremony-final)",
    deployer: $deployer,
    owner: $owner,
    ownershipAcceptedTx: (if $accept == "" then null else $accept end),
    feeRecipient: $treasury,
    withdrawFeeBps: 25,
    relayer: $relayer,
    rpc: "https://ethereum-sepolia-rpc.publicnode.com",
    logRpc: "https://sepolia.gateway.tenderly.co",
    explorer: "https://sepolia.etherscan.io",
    contracts: ({
      ShieldPoolPayments: $pool, deployBlock: $block, deployTx: $tx,
      PoseidonT3: $poseidon, PoseidonT3CodeHash: $poseidonCode,
      DualProofVerifier: $dual, ShieldIVerifier: $shieldI
    } + $verifiers + {GloamPayMemo: $memo, GloamPayMemoDeployBlock: $memoBlock, GloamPayMemoDeployTx: $memoTx}),
    assets: {
      USDC: { address: "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238", decimals: 6, perDeposit: "500000000", total: "25000000000" },
      USDG: { address: "0xfBb2A78CceEb415b00300925e464C3E44E6e06b0", decimals: 6, perDeposit: "500000000", total: "25000000000" },
      PYUSD: { address: "0xCaC524BcA292aaade2DF8A05cC58F0a65B1B3bB9", decimals: 6, perDeposit: "500000000", total: "25000000000" },
      EURC: { address: "0x08210F9170F89Ab7658F0B5E3fF39b0E03C594D4", decimals: 6, perDeposit: "500000000", total: "25000000000" },
      ETH: { address: "0x0000000000000000000000000000000000000000", decimals: 18, perDeposit: "200000000000000000", total: "10000000000000000000" }
    }
  }' > deployments/ethereum-sepolia.json
ok "wrote contracts/deployments/ethereum-sepolia.json"

# The switch-on: one line in the app, one in the SDK.
APP_ON="export const ETHEREUM_SEPOLIA_POOL: TestnetPoolInput = { pool: \"$POOL\", deployBlock: $BLOCK, payMemo: \"$MEMO\", payMemoBlock: $MEMO_BLOCK };"
SDK_ON="export const ETHEREUM_SEPOLIA_POOL: TestnetPoolInput = { pool: \"$POOL\", deployBlock: ${BLOCK}n, payMemo: \"$MEMO\", payMemoBlock: ${MEMO_BLOCK}n };"
OFF="$OFF" ON="$APP_ON" perl -0pi -e 's/\Q$ENV{OFF}\E/$ENV{ON}/' "$APP_FILE"
OFF="$OFF" ON="$SDK_ON" perl -0pi -e 's/\Q$ENV{OFF}\E/$ENV{ON}/' "$SDK_FILE"
grep -qF "$APP_ON" "$APP_FILE" && grep -qF "$SDK_ON" "$SDK_FILE" || fail "could not write the switch-on lines."
ok "Ethereum Sepolia switched on in $APP_FILE and $SDK_FILE"
echo
git --no-pager diff -- "$APP_FILE" "$SDK_FILE"
echo
echo "Next: run the checks in DEPLOY-ETHEREUM-SEPOLIA.md step 8, then commit these three files."
