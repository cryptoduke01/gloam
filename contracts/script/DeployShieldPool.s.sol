// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {ShieldPool} from "../src/ShieldPool.sol";

/**
 * @notice Deploy scaffold to Robinhood testnet.
 * @dev forge script script/DeployShieldPool.s.sol --rpc-url $RH_TESTNET_RPC --broadcast
 *
 * Without a real verifier, pass address(0) — transfer/unshield stay locked until setVerifier.
 */
contract DeployShieldPool is Script {
    function run() external {
        uint256 pk = vm.envUint("DEPLOYER_PK");
        address verifier = vm.envOr("VERIFIER_ADDRESS", address(0));

        vm.startBroadcast(pk);
        ShieldPool pool = new ShieldPool(verifier);
        vm.stopBroadcast();

        console2.log("ShieldPool", address(pool));
        console2.log("verifier", verifier);
        console2.log("chainId", block.chainid);
    }
}
