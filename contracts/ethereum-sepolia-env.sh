# Ethereum Sepolia deploy settings (DEPLOY-ETHEREUM-SEPOLIA.md, step 1 and the step 3 limits).
# Source it from contracts/:  source ethereum-sepolia-env.sh
# The key is read hidden, so it lands in no file and no shell history.
export PATH="$HOME/.foundry/bin:/Users/duke/.nvm/versions/node/v24.11.1/bin:$PATH" FOUNDRY_DISABLE_NIGHTLY_WARNING=1
export RPC_URL=https://ethereum-sepolia-rpc.publicnode.com CHAIN=11155111
# USDC (Circle), USDG (Paxos), PYUSD (Paxos), EURC (Circle), ETH. 500 / 25,000 each stablecoin; 0.2 / 10 ETH.
export LIMIT_ASSETS=0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238,0xfBb2A78CceEb415b00300925e464C3E44E6e06b0,0xCaC524BcA292aaade2DF8A05cC58F0a65B1B3bB9,0x08210F9170F89Ab7658F0B5E3fF39b0E03C594D4,0x0000000000000000000000000000000000000000
export LIMIT_PER_DEPOSIT=500000000,500000000,500000000,500000000,200000000000000000
export LIMIT_TOTAL=25000000000,25000000000,25000000000,25000000000,10000000000000000000
export WITHDRAW_FEE_BPS=25 FEE_RECIPIENT=0xB3900ac9350903218e4c7597bAb0f008F01B30B8
export NEW_OWNER=0x76b7E410a227c888aBD2Bdc24Ee32E094B0FD4D8 NEW_OWNER_EOA=1
# The deploy scripts refuse a DEPLOYER_PK that is not this address's key.
export DEPLOYER=0x891E74a11abC5D0eC2EE855B2BD521fF9D18F411
export SCRIPT=script/DeployEthereumSepolia.s.sol:DeployEthereumSepolia

printf "Deployer private key (hidden, then Enter): "
read -rs DEPLOYER_PK
echo
export DEPLOYER_PK

echo "chain:    $(cast chain-id --rpc-url $RPC_URL)   must be 11155111"
echo "deployer: $(cast wallet address --private-key "$DEPLOYER_PK")   must be $DEPLOYER"
echo "nonce:    $(cast nonce $DEPLOYER --rpc-url $RPC_URL)   must be 0"
echo "balance:  $(cast balance $DEPLOYER --rpc-url $RPC_URL --ether) ETH   needs 0.005"
echo "Ready for step 2 (PoseidonT3)."
