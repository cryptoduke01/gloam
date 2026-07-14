// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {ShieldPool} from "../src/ShieldPool.sol";

/**
 * @notice Deploy ShieldPool to Robinhood testnet (46630).
 *
 *   export DEPLOYER_PK=0x...          # never commit
 *   # optional: VERIFIER_ADDRESS=0x...  (default 0 = lock transfer/unshield)
 *   forge script script/DeployShieldPool.s.sol \
 *     --rpc-url https://rpc.testnet.chain.robinhood.com \
 *     --broadcast -vvvv
 *
 * SAFETY: Do not pass a mock verifier that always returns true while the pool holds value.
 */
contract DeployShieldPool is Script {
    function run() external {
        uint256 pk = vm.envUint("DEPLOYER_PK");
        // default address(0): shield works; transfer/unshield locked until real verifier
        address verifier = vm.envOr("VERIFIER_ADDRESS", address(0));

        vm.startBroadcast(pk);
        ShieldPool pool = new ShieldPool(verifier);
        vm.stopBroadcast();

        console2.log("ShieldPool", address(pool));
        console2.log("owner", pool.owner());
        console2.log("verifier", address(pool.verifier()));
        console2.log("chainId", block.chainid);
        console2.log("Write address into deployments/testnet.json and NEXT_PUBLIC_SHIELD_POOL_ADDRESS");
    }
}
