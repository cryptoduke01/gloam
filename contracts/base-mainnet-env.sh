# Base mainnet deploy settings (DEPLOY-BASE.md, Base mainnet step 2).
# Source it from contracts/:  source base-mainnet-env.sh
# The key is read hidden, so it lands in no file and no shell history.
[ -f foundry.toml ] && [ -f script/DeployBaseMainnet.s.sol ] || { echo "STOP: source this from the contracts/ folder."; return 1 2>/dev/null || exit 1; }
export PATH="$HOME/.foundry/bin:/Users/duke/.nvm/versions/node/v24.11.1/bin:$PATH" FOUNDRY_DISABLE_NIGHTLY_WARNING=1
export RPC_URL=https://mainnet.base.org CHAIN=8453
# USDC (Circle), EURC (Circle), USDT (Tether, bridged from Ethereum), ETH. 500 / 25,000 each stablecoin; 0.2 / 10 ETH.
# Checked on chain 25 Oct 2026: USDC "USD Coin", EURC "EURC", USDT "Tether USD", 6 decimals each.
export LIMIT_ASSETS=0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913,0x60a3E35Cc302bFA44Cb288Bc5a4F316Fdb1adb42,0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2,0x0000000000000000000000000000000000000000
export LIMIT_PER_DEPOSIT=500000000,500000000,500000000,200000000000000000
export LIMIT_TOTAL=25000000000,25000000000,25000000000,10000000000000000000
export WITHDRAW_FEE_BPS=25 FEE_RECIPIENT=0xB3900ac9350903218e4c7597bAb0f008F01B30B8
export NEW_OWNER=0x76b7E410a227c888aBD2Bdc24Ee32E094B0FD4D8 NEW_OWNER_EOA=1
# The deploy scripts refuse a DEPLOYER_PK that is not this address's key.
export DEPLOYER=0x891E74a11abC5D0eC2EE855B2BD521fF9D18F411
export SCRIPT=script/DeployBaseMainnet.s.sol:DeployBaseMainnet

printf "Deployer private key (hidden, then Enter): "
read -rs DEPLOYER_PK
echo
export DEPLOYER_PK

echo "chain:    $(cast chain-id --rpc-url $RPC_URL)   must be 8453"
echo "deployer: $(cast wallet address --private-key "$DEPLOYER_PK")   must be $DEPLOYER"
echo "nonce:    $(cast nonce $DEPLOYER --rpc-url $RPC_URL)   must be 0"
echo "balance:  $(cast balance $DEPLOYER --rpc-url $RPC_URL --ether) ETH   needs 0.004"
echo "gas:      $(cast to-unit $(cast gas-price --rpc-url $RPC_URL) gwei) gwei   about 0.006 on 25 Oct; go on under 0.1"
_assets=""
for _a in $(echo "$LIMIT_ASSETS" | tr "," " "); do
  if [ "$_a" = 0x0000000000000000000000000000000000000000 ]; then _assets="$_assets ETH"; continue; fi
  _assets="$_assets $(cast call $_a 'symbol()(string)' --rpc-url $RPC_URL | tr -d '"') $(cast call $_a 'decimals()(uint8)' --rpc-url $RPC_URL),"
done
echo "assets:  $_assets   must be USDC 6, EURC 6, USDT 6, ETH"
# Forge sets each deploy's gas limit from its own gas rules. A chain that charges more for
# creating contracts (Ethereum Sepolia did) makes every deploy run out of gas and burn its nonce.
_gas=$(cast estimate --rpc-url $RPC_URL --create $(forge inspect ShieldVerifierFinal bytecode) 2>/dev/null)
echo "deploy gas: ${_gas:-unknown} to create ShieldVerifierFinal   about 389,744"
if ! [[ "$_gas" =~ ^[0-9]+$ ]] || [ "$_gas" -gt 500000 ]; then
  echo
  echo "################################################################################"
  echo "STOP. Creating a contract costs more here than forge expects (${_gas:-no estimate}, not about 389,744)."
  echo "Do not broadcast as written: every deploy would run out of gas and burn a nonce."
  echo "Add  --gas-estimate-multiplier 1000  to every --broadcast and --resume command,"
  echo "and check the deployer holds ten times the deploy's cost. If there was no"
  echo "estimate at all, the RPC did not answer: source this file again."
  echo "################################################################################"
  echo
else
  echo "Ready for step 3 (PoseidonT3)."
fi
unset _a _assets _gas
