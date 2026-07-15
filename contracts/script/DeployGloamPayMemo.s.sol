// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {GloamPayMemo} from "../src/GloamPayMemo.sol";

/**
 *   export DEPLOYER_PK=0x...
 *   export RPC_URL=https://rpc.testnet.chain.robinhood.com
 *   forge script script/DeployGloamPayMemo.s.sol:DeployGloamPayMemo --rpc-url $RPC_URL --broadcast
 */
contract DeployGloamPayMemo is Script {
    function run() external {
        uint256 pk = vm.envUint("DEPLOYER_PK");
        vm.startBroadcast(pk);
        GloamPayMemo memo = new GloamPayMemo();
        console2.log("GloamPayMemo", address(memo));
        vm.stopBroadcast();
    }
}
