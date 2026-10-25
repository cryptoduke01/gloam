# Ethereum mainnet deploy settings (DEPLOY-ETHEREUM.md, step 2).
# Source it from contracts/:  source ethereum-mainnet-env.sh
# The key is read hidden, so it lands in no file and no shell history.
[ -f foundry.toml ] && [ -f script/DeployEthereumMainnet.s.sol ] || { echo "STOP: source this from the contracts/ folder."; return 1 2>/dev/null || exit 1; }
export PATH="$HOME/.foundry/bin:/Users/duke/.nvm/versions/node/v24.11.1/bin:$PATH" FOUNDRY_DISABLE_NIGHTLY_WARNING=1
export RPC_URL=https://ethereum-rpc.publicnode.com CHAIN=1
# USDC (Circle), USDT (Tether), USDG (Paxos), PYUSD (Paxos for PayPal), EURC (Circle), ETH.
# 500 / 25,000 each stablecoin; 0.2 / 10 ETH. Checked on chain 25 Oct 2026: "USD Coin",
# "Tether USD", "Global Dollar", "PayPal USD", "Euro Coin", 6 decimals each.
export LIMIT_ASSETS=0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48,0xdAC17F958D2ee523a2206206994597C13D831ec7,0xe343167631d89B6Ffc58B88d6b7fB0228795491D,0x6c3ea9036406852006290770BEdFcAbA0e23A0e8,0x1aBaEA1f7C830bD89Acc67eC4af516284b1bC33c,0x0000000000000000000000000000000000000000
export LIMIT_PER_DEPOSIT=500000000,500000000,500000000,500000000,500000000,200000000000000000
export LIMIT_TOTAL=25000000000,25000000000,25000000000,25000000000,25000000000,10000000000000000000
export WITHDRAW_FEE_BPS=25 FEE_RECIPIENT=0xB3900ac9350903218e4c7597bAb0f008F01B30B8
export NEW_OWNER=0x76b7E410a227c888aBD2Bdc24Ee32E094B0FD4D8 NEW_OWNER_EOA=1
# The deploy scripts refuse a DEPLOYER_PK that is not this address's key.
export DEPLOYER=0x891E74a11abC5D0eC2EE855B2BD521fF9D18F411
export SCRIPT=script/DeployEthereumMainnet.s.sol:DeployEthereumMainnet

printf "Deployer private key (hidden, then Enter): "
read -rs DEPLOYER_PK
echo
export DEPLOYER_PK

echo "chain:    $(cast chain-id --rpc-url $RPC_URL)   must be 1"
echo "deployer: $(cast wallet address --private-key "$DEPLOYER_PK")   must be $DEPLOYER"
echo "nonce:    $(cast nonce $DEPLOYER --rpc-url $RPC_URL)   must be 0"
echo "balance:  $(cast balance $DEPLOYER --rpc-url $RPC_URL --ether) ETH   needs 0.01"
_gwei=$(cast to-unit $(cast gas-price --rpc-url $RPC_URL) gwei)
echo "gas:      $_gwei gwei   about 0.04 on 25 Oct; go on only under 0.5"
_assets=""
for _a in $(echo "$LIMIT_ASSETS" | tr "," " "); do
  if [ "$_a" = 0x0000000000000000000000000000000000000000 ]; then _assets="$_assets ETH"; continue; fi
  _assets="$_assets $(cast call $_a 'symbol()(string)' --rpc-url $RPC_URL | tr -d '"') $(cast call $_a 'decimals()(uint8)' --rpc-url $RPC_URL),"
done
echo "assets:  $_assets   must be USDC 6, USDT 6, USDG 6, PYUSD 6, EURC 6, ETH"
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
elif awk -v g="$_gwei" 'BEGIN { exit !(g >= 0.5) }'; then
  echo
  echo "WAIT. Gas is $_gwei gwei, over 0.5. Do not start: source this file again later."
  echo
else
  echo "Ready for step 3 (PoseidonT3)."
fi
unset _a _assets _gas _gwei
