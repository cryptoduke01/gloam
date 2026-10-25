#!/bin/bash
# After the Ethereum mainnet deploy (DEPLOY-ETHEREUM.md, step 7). Run from contracts/:
#   ACCEPT_TX=0x... ./ethereum-mainnet-after-deploy.sh  (ACCEPT_TX is the acceptOwnership hash)
# It reads the deploy back from the chain and stops at the first thing that is not as the
# runbook set it. If all is right it writes deployments/ethereum-mainnet.json and makes the
# switch-on: MAINNET_POOLS[1] in app/src/lib/mainnet.ts and packages/sdk/src/mainnet.ts,
# and the memo board where Base Sepolia's is wired (app/src/lib/networks.ts,
# packages/sdk/src/constants.ts, packages/sdk/src/incoming.ts). Reads only: it sends
# nothing and needs no key.
set -euo pipefail
cd "$(dirname "$0")"
export PATH="$HOME/.foundry/bin:/Users/duke/.nvm/versions/node/v24.11.1/bin:$PATH" FOUNDRY_DISABLE_NIGHTLY_WARNING=1

RPC_URL=${RPC_URL:-https://ethereum-rpc.publicnode.com}
CHAIN=1
NAME="Ethereum mainnet"
RUN=broadcast/DeployEthereumMainnet.s.sol/$CHAIN/run-latest.json
MRUN=broadcast/DeployGloamPayMemo.s.sol/$CHAIN/run-latest.json
OUT=deployments/ethereum-mainnet.json
APP_MAINNET=../app/src/lib/mainnet.ts
SDK_MAINNET=../packages/sdk/src/mainnet.ts
APP_NETWORKS=../app/src/lib/networks.ts
SDK_CONSTANTS=../packages/sdk/src/constants.ts
SDK_INCOMING=../packages/sdk/src/incoming.ts
# What the relayer should hold before the switch-on is merged (DEPLOY-ETHEREUM.md, step 1).
RELAYER_TARGET=0.04

DEPLOYER=0x891E74a11abC5D0eC2EE855B2BD521fF9D18F411
OWNER=0x76b7E410a227c888aBD2Bdc24Ee32E094B0FD4D8
TREASURY=0xB3900ac9350903218e4c7597bAb0f008F01B30B8
RELAYER=0xb1E994586E62994648a0b866BF33F2EDd942512e
ZERO=0x0000000000000000000000000000000000000000
# Where everything lands from a deployer that started at nonce 0, the same as on the other chains.
POSEIDON_T3=0x1a32C2c2A77225EC2dD3BF7be1018819b1039Cb4
CANON_POOL=0x39E28Cde55CAB798874746ac52cb4B5Cc99a0194
CANON_MEMO=0x8699D015087dE6D25d55d5ceB63b34b9d773f135
# Code hashes as on Robinhood Chain, Tempo, Base Sepolia and Ethereum Sepolia.
POSEIDON_T3_CODE=0x354b26999e434f8256d168395315e1f51fc15bf49bf2e6bb58fc549bd597e7da
MEMO_CODE=0xf24e84ff514b7b8e3eba03c4b7ac70bbeb8b799b5fd3006d552a34362cf5edae
# The three Groth16 verifiers hold the final keys in their code, so their hash is the same at any address.
KEY_CODES=(
  "ShieldVerifierFinal 0xf6a771ca5059d079059ea1352d0d962ac87766169a6c87504d0adcc568531a37"
  "UnshieldVerifierFinal 0x29aa6c0a70397a3fd697f4c7add0599da4d137b61e659d95f390c0ed4247c55a"
  "TransferVerifierFinal 0x82a755477429f574f86070c02778a87b4806e6fc9ba7c26076dfe74af57947e2"
)
# The adapters, the DualProofVerifier and the vault hold the addresses of what they point at,
# so these match only at the nonce-0 addresses.
CANON_CODES=(
  "ShieldIVerifierFinal 0x956f69128783bd1c3a7a487667bb29a9d146ed1894ce8cb904c629841e58e632"
  "UnshieldIVerifierFinal 0x02d8f09c54d2cec2595c0cd2d41b40a0c194a24ac31368c13f15a5ae03dad11e"
  "TransferIVerifierFinal 0xd8bf915c29086abdfb2bd9eff5ecf42b718e6d2defa62fc464660c8cf47e9e2a"
  "DualProofVerifier 0x1d93455a6dd1b0b9b4793ba446ce84e2c301263578674ab438013bcb8dbec5c6"
  "ShieldPoolPayments 0x58d9843b0c6d9b81fbbb015de6a2413a7443cc63476185edf43d882f672088f2"
)
# Symbol, address, decimals, per deposit, total: what ethereum-mainnet-env.sh lists, in its order.
ASSETS=(
  "USDC 0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48 6 500000000 25000000000"
  "USDT 0xdAC17F958D2ee523a2206206994597C13D831ec7 6 500000000 25000000000"
  "USDG 0xe343167631d89B6Ffc58B88d6b7fB0228795491D 6 500000000 25000000000"
  "PYUSD 0x6c3ea9036406852006290770BEdFcAbA0e23A0e8 6 500000000 25000000000"
  "EURC 0x1aBaEA1f7C830bD89Acc67eC4af516284b1bC33c 6 500000000 25000000000"
  "ETH $ZERO 18 200000000000000000 10000000000000000000"
)

fail() { echo "STOP: $*" >&2; echo "Nothing was written. Fix it, or tell the team before turning $NAME on." >&2; exit 1; }
ok() { echo "ok    $*"; }
lc() { tr '[:upper:]' '[:lower:]' <<<"$1"; }
same() { [ "$(lc "$1")" = "$(lc "$2")" ]; }
call() { cast call "$@" --rpc-url "$RPC_URL"; }
codehash() { cast code "$1" --rpc-url "$RPC_URL" | cast keccak; }
# How often a (multi-line) piece of text appears in a file, and swapping it for another.
count() { OFF="$2" perl -0ne '$c = () = /\Q$ENV{OFF}\E/g; print $c + 0' "$1"; }
swap() { OFF="$2" ON="$3" perl -0pi -e 's/\Q$ENV{OFF}\E/$ENV{ON}/' "$1"; }

# The switch-on, as it reads before the deploy. Every piece must be there exactly once.
APP_POOL_OFF='  // Ethereum mainnet (1): USDC, USDT, USDG, PYUSD, EURC, ETH. Not deployed yet (DEPLOY-ETHEREUM.md).
  1: { pool: null, deployBlock: null },'
SDK_POOL_OFF=$APP_POOL_OFF
APP_MEMO_OFF='    payMemo: null,
    note: "Mainnet: private USDC, USDT, USDG, PYUSD, EURC and ETH payments.",'
SDK_MEMO_OFF='  // No board on Ethereum yet either: payments to a Gloam address are handed over as a sealed code.
  ethereum: { chainId: 1, key: "ethereum-mainnet", label: "Ethereum", chain: ETHEREUM_MAINNET_CHAIN, payMemo: null,'
BOARDS_AFTER='  [TEMPO_MAINNET_CHAIN_ID]: { address: "0x342E3745967FDB4223902E196Ceb792c15d8C1c4", deployBlock: 45_417_629n, emitsPoster: false },'

[ -f "$RUN" ] || fail "$RUN is missing: run this from the contracts/ folder the deploy ran in."
[ -f "$MRUN" ] || fail "$MRUN is missing: deploy the memo board first (step 5)."
for f in "$APP_MAINNET|$APP_POOL_OFF" "$SDK_MAINNET|$SDK_POOL_OFF" "$APP_NETWORKS|$APP_MEMO_OFF" "$SDK_CONSTANTS|$SDK_MEMO_OFF" "$SDK_INCOMING|$BOARDS_AFTER"; do
  file=${f%%|*}; text=${f#*|}
  n=$(count "$file" "$text")
  [ "$n" = "1" ] || fail "$file does not read as before the switch-on (found its Ethereum mainnet line $n times, not once): already switched on?"
done
grep -q '^  1: {' "$SDK_INCOMING" && fail "$SDK_INCOMING already has an Ethereum mainnet board."
[ "$(cast chain-id --rpc-url "$RPC_URL")" = "$CHAIN" ] || fail "$RPC_URL is not $NAME."

created() { jq -r --arg n "$1" '[.transactions[] | select(.transactionType=="CREATE" and .contractName==$n)][0].contractAddress // empty' "$RUN"; }
createTx() { jq -r --arg n "$1" '[.transactions[] | select(.transactionType=="CREATE" and .contractName==$n)][0].hash // empty' "$RUN"; }
blockOf() { cast to-dec "$(cast receipt "$1" blockNumber --rpc-url "$RPC_URL")"; }
addr() { local a; a=$(created "$1"); [ -n "$a" ] || fail "the run has no $1."; cast to-check-sum-address "$a"; }

POOL=$(addr ShieldPoolPayments)
POOL_TX=$(createTx ShieldPoolPayments)
BLOCK=$(blockOf "$POOL_TX")
DUAL=$(addr DualProofVerifier)
SHIELD_I=$(addr ShieldIVerifierFinal)
MEMO=$(cast to-check-sum-address "$(jq -r '.transactions[0].contractAddress' "$MRUN")")
MEMO_TX=$(jq -r '.transactions[0].hash' "$MRUN")
MEMO_BLOCK=$(blockOf "$MEMO_TX")
POSEIDON=$(cast to-check-sum-address "$(call "$POOL" 'poseidon2()(address)')")
echo "pool $POOL block $BLOCK, memo board $MEMO block $MEMO_BLOCK"

# Every transaction of both runs landed, the vault and the board from the deployer.
for r in "$RUN" "$MRUN"; do
  bad=$(jq -r '[.receipts[] | select(.status != "0x1")] | length' "$r")
  [ "$bad" = "0" ] || fail "$bad transaction(s) in $r did not succeed."
  others=$(jq -r --arg d "$(lc "$DEPLOYER")" '[.transactions[] | select((.transaction.from | ascii_downcase) != $d)] | length' "$r")
  [ "$others" = "0" ] || fail "$others transaction(s) in $r were not sent by the deployer."
done
[ "$MEMO_BLOCK" -ge "$BLOCK" ] || fail "the memo board is older than the vault."
ok "every deploy transaction succeeded, all from the deployer"

# The vault as the runbook set it up.
same "$(call "$POOL" 'owner()(address)')" "$OWNER" || fail "the owner is not 0x76b7…D4D8 yet: accept ownership first (step 6)."
same "$(call "$POOL" 'pendingOwner()(address)')" "$ZERO" || fail "pendingOwner is not empty."
ok "owner is the owner wallet, nothing pending"
[ "$(call "$POOL" 'setupMode()(bool)')" = "false" ] || fail "setup was not ended."
[ "$(call "$POOL" 'depositLimitsOn()(bool)')" = "true" ] || fail "deposit limits are off."
ok "setup ended, deposit limits on"
[ "$(call "$POOL" 'withdrawFeeBps()(uint16)')" = "25" ] || fail "the cash-out fee is not 25 bps."
same "$(call "$POOL" 'feeRecipient()(address)')" "$TREASURY" || fail "the fee does not go to the treasury."
ok "cash-out fee 0.25% to the treasury 0xB390…30B8"

# The verifiers: the deploy's own, holding the ceremony's final keys.
same "$(call "$POOL" 'verifier()(address)')" "$DUAL" || fail "the spend verifier is not the deploy's DualProofVerifier."
same "$(call "$POOL" 'shieldVerifier()(address)')" "$SHIELD_I" || fail "the shield verifier is not the deploy's."
for k in "${KEY_CODES[@]}"; do
  read -r name hash <<<"$k"
  [ "$(codehash "$(addr "$name")")" = "$hash" ] || fail "$name's code is not the final-key verifier's."
done
keys=$(POOL=$POOL forge script script/CheckCeremonyKeys.s.sol:CheckCeremonyKeys --rpc-url "$RPC_URL" 2>&1) || true
grep -q "ceremony keys ok" <<<"$keys" || { echo "$keys" | tail -20 >&2; fail "the vault's verifiers do not hold the ceremony's final keys."; }
ok "the deploy's verifiers, on the final keys: they accept final-key proofs and refuse dev-key ones"

# Every asset: the token is what it should be, and its limit is the runbook's.
for a in "${ASSETS[@]}"; do
  read -r sym asset dec per total <<<"$a"
  if [ "$asset" != "$ZERO" ]; then
    [ "$(call "$asset" 'symbol()(string)')" = "\"$sym\"" ] || fail "$asset is not $sym."
    [ "$(call "$asset" 'decimals()(uint8)')" = "$dec" ] || fail "$sym does not have $dec decimals."
  fi
  got=$(call "$POOL" 'depositLimit(address)(uint128,uint128)' "$asset" | awk '{print $1}' | paste -sd' ' -)
  [ "$got" = "$per $total" ] || fail "$sym limit is '$got', not '$per $total'."
done
ok "USDC, USDT, USDG, PYUSD and EURC (6 decimals) at 500 / 25,000 each, ETH at 0.2 / 10"

# The code, the same as on the other chains.
[ "$(codehash "$POSEIDON")" = "$POSEIDON_T3_CODE" ] || fail "PoseidonT3's code is not circomlibjs's."
[ "$(codehash "$MEMO")" = "$MEMO_CODE" ] || fail "the memo board's code differs from the other chains'."
ok "PoseidonT3 and the memo board are byte for byte the other chains'"
if same "$POOL" "$CANON_POOL" && same "$POSEIDON" "$POSEIDON_T3"; then
  for c in "${CANON_CODES[@]}"; do
    read -r name hash <<<"$c"
    [ "$(codehash "$(addr "$name")")" = "$hash" ] || fail "$name's code differs from the other chains'."
  done
  ok "the vault, its verifiers and adapters are byte for byte the other chains', at the same addresses"
  same "$MEMO" "$CANON_MEMO" || echo "note  the memo board is at $MEMO, not $CANON_MEMO (something else was sent from the deployer before it)"
else
  echo "note  the addresses differ from the other chains (the deployer's nonce was not 0); the vault's code embeds them, so its hash is not compared"
fi

RELAYER_BAL=$(cast balance "$RELAYER" --rpc-url "$RPC_URL" --ether)
echo "relayer 0xb1E9…512e balance: $RELAYER_BAL ETH"
if awk -v b="$RELAYER_BAL" -v t="$RELAYER_TARGET" 'BEGIN { exit !(b < t) }'; then
  echo "note  the relayer holds under $RELAYER_TARGET ETH: fund it (step 1) before the switch-on is merged, or relayed sends stop."
fi

# The deployment record.
contract() { jq -n --arg n "$1" --arg a "$(addr "$1")" '{($n): $a}'; }
VERIFIERS=$(jq -s 'add' <(contract ShieldVerifierFinal) <(contract UnshieldVerifierFinal) <(contract UnshieldIVerifierFinal) <(contract TransferVerifierFinal) <(contract TransferIVerifierFinal))
ASSETS_JSON=$(for a in "${ASSETS[@]}"; do
  read -r sym asset dec per total <<<"$a"
  jq -n --arg s "$sym" --arg a "$asset" --argjson d "$dec" --arg p "$per" --arg t "$total" '{($s): {address: $a, decimals: $d, perDeposit: $p, total: $t}}'
done | jq -s 'add')
jq -n \
  --arg date "$(date -u +%Y-%m-%d)" --arg pool "$POOL" --argjson block "$BLOCK" --arg tx "$POOL_TX" \
  --arg poseidon "$POSEIDON" --arg dual "$DUAL" --arg shieldI "$SHIELD_I" \
  --arg memo "$MEMO" --argjson memoBlock "$MEMO_BLOCK" --arg memoTx "$MEMO_TX" \
  --arg accept "${ACCEPT_TX:-}" --argjson verifiers "$VERIFIERS" --argjson assets "$ASSETS_JSON" \
  --arg deployer "$DEPLOYER" --arg owner "$OWNER" --arg treasury "$TREASURY" --arg relayer "$RELAYER" \
  --arg poseidonCode "$POSEIDON_T3_CODE" \
  '{
    deployedAt: $date,
    network: "Ethereum",
    chainId: 1,
    testnet: false,
    note: "Ethereum mainnet: ShieldPoolPayments on the ceremony'"'"'s final keys, with the beta deposit limits and the 0.25% cash-out fee. Deployed with script/DeployEthereumMainnet.s.sol (DEPLOY-ETHEREUM.md) and read back by ethereum-mainnet-after-deploy.sh. USDT returns nothing from transfer and approve; the vault pulls and pays it with calls that accept no return data.",
    ceremony: "final (13 contributors, drand 6561386, release ceremony-final)",
    deployer: $deployer,
    owner: $owner,
    ownershipAcceptedTx: (if $accept == "" then null else $accept end),
    feeRecipient: $treasury,
    withdrawFeeBps: 25,
    relayer: $relayer,
    rpc: "https://ethereum-rpc.publicnode.com",
    logRpc: "https://rpc.mevblocker.io",
    explorer: "https://etherscan.io",
    contracts: ({
      ShieldPoolPayments: $pool, deployBlock: $block, deployTx: $tx,
      PoseidonT3: $poseidon, PoseidonT3CodeHash: $poseidonCode,
      DualProofVerifier: $dual, ShieldIVerifier: $shieldI
    } + $verifiers + {GloamPayMemo: $memo, GloamPayMemoDeployBlock: $memoBlock, GloamPayMemoDeployTx: $memoTx}),
    assets: $assets
  }' > "$OUT"
ok "wrote contracts/$OUT"

# The switch-on.
DAY=$(date -u '+%-d %b %Y')
APP_POOL_ON="  // Ethereum mainnet (1): USDC, USDT, USDG, PYUSD, EURC, ETH. Deployed $DAY (DEPLOY-ETHEREUM.md).
  1: { pool: \"$POOL\", deployBlock: $BLOCK },"
SDK_POOL_ON="  // Ethereum mainnet (1): USDC, USDT, USDG, PYUSD, EURC, ETH. Deployed $DAY (DEPLOY-ETHEREUM.md).
  1: { pool: \"$POOL\", deployBlock: ${BLOCK}n },"
APP_MEMO_ON="    // GloamPayMemo, deployed $DAY after the vault (no owner, holds nothing, never logs the poster)
    payMemo: { address: \"$MEMO\", deployBlock: ${MEMO_BLOCK}n, emitsPoster: false },
    note: \"Mainnet: private USDC, USDT, USDG, PYUSD, EURC and ETH payments.\","
SDK_MEMO_ON="  // Ethereum's payment-message board, deployed $DAY after the vault (no owner, never logs the poster).
  ethereum: { chainId: 1, key: \"ethereum-mainnet\", label: \"Ethereum\", chain: ETHEREUM_MAINNET_CHAIN, payMemo: \"$MEMO\","
BOARDS_ON="$BOARDS_AFTER
  // Ethereum mainnet's, deployed $DAY after the vault.
  1: { address: \"$MEMO\", deployBlock: ${MEMO_BLOCK}n, emitsPoster: false },"
swap "$APP_MAINNET" "$APP_POOL_OFF" "$APP_POOL_ON"
swap "$SDK_MAINNET" "$SDK_POOL_OFF" "$SDK_POOL_ON"
swap "$APP_NETWORKS" "$APP_MEMO_OFF" "$APP_MEMO_ON"
swap "$SDK_CONSTANTS" "$SDK_MEMO_OFF" "$SDK_MEMO_ON"
swap "$SDK_INCOMING" "$BOARDS_AFTER" "$BOARDS_ON"
for f in "$APP_MAINNET|$APP_POOL_ON" "$SDK_MAINNET|$SDK_POOL_ON" "$APP_NETWORKS|$APP_MEMO_ON" "$SDK_CONSTANTS|$SDK_MEMO_ON" "$SDK_INCOMING|$BOARDS_ON"; do
  [ "$(count "${f%%|*}" "${f#*|}")" = "1" ] || { echo "STOP: could not write the switch-on into ${f%%|*}. Undo with: git checkout -- ../app ../packages" >&2; exit 1; }
done
ok "$NAME switched on: the pool in both mainnet.ts files, the memo board in networks.ts, constants.ts and incoming.ts"
echo
git --no-pager diff --stat -- "$APP_MAINNET" "$SDK_MAINNET" "$APP_NETWORKS" "$SDK_CONSTANTS" "$SDK_INCOMING"
echo
echo "Next: step 8 (verify the source), then step 9 (tests and the switch-on PR)."
