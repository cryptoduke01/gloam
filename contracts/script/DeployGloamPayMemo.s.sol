// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {console2} from "forge-std/Script.sol";
import {GloamPayMemo} from "../src/GloamPayMemo.sol";
import {DeployerBroadcast} from "./DeployerBroadcast.sol";

/**
 *   export DEPLOYER_PK=0x...
 *   export RPC_URL=https://rpc.testnet.chain.robinhood.com
 *   forge script script/DeployGloamPayMemo.s.sol:DeployGloamPayMemo --rpc-url $RPC_URL --broadcast
 *
 * DEPLOYER (the deployer's address) is optional: see script/DeployerBroadcast.sol.
 */
contract DeployGloamPayMemo is DeployerBroadcast {
    function run() external {
        _startDeployerBroadcast();
        GloamPayMemo memo = new GloamPayMemo();
        console2.log("GloamPayMemo", address(memo));
        vm.stopBroadcast();
    }
}
