// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {SealedSwapVerifier} from "../src/verifiers/SealedSwapVerifier.sol";
import {SealedSwapIVerifier} from "../src/verifiers/SealedSwapIVerifier.sol";

/**
 * Deploy sealed-swap verifier pair. Then on a pool that supports setSealedSwapVerifier:
 *   cast send $POOL "setSealedSwapVerifier(address)" $SEALED_I --private-key $DEPLOYER_PK
 *
 * Live Poseidon pool may need redeploy to include sealedSwap() — see ShieldPoolPoseidon.sol.
 *
 *   forge script script/DeploySealedSwapVerifier.s.sol:DeploySealedSwapVerifier \
 *     --rpc-url $RPC_URL --broadcast
 */
contract DeploySealedSwapVerifier is Script {
    function run() external {
        uint256 pk = vm.envUint("DEPLOYER_PK");
        vm.startBroadcast(pk);
        SealedSwapVerifier g = new SealedSwapVerifier();
        SealedSwapIVerifier adapter = new SealedSwapIVerifier(g);
        console2.log("SealedSwapVerifier", address(g));
        console2.log("SealedSwapIVerifier", address(adapter));
        vm.stopBroadcast();
    }
}
