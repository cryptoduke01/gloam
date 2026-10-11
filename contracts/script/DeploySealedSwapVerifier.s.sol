// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {console2} from "forge-std/Script.sol";
import {SealedSwapVerifier} from "../src/verifiers/SealedSwapVerifier.sol";
import {SealedSwapIVerifier} from "../src/verifiers/SealedSwapIVerifier.sol";
import {SealedSwapGuard} from "./SealedSwapGuard.sol";

/**
 * Deploy sealed-swap verifier pair. Then on a pool that supports setSealedSwapVerifier:
 *   cast send $POOL "setSealedSwapVerifier(address)" $SEALED_I --private-key $DEPLOYER_PK
 *
 * Live Poseidon pool may need redeploy to include sealedSwap(); see ShieldPoolPoseidon.sol.
 *
 * GUARDED (audit L-2 / ZK-1, 2026-10-11). This verifier is only useful for
 * turning sealed swap back on, so the script reverts unless
 * GLOAM_ACK_SEALED_SWAP_H1_ZK1=1. Sealed swap must stay off until H1 and ZK-1 are
 * fixed and a new circuit + ceremony is done; see SealedSwapGuard.sol. The
 * SealedSwapVerifier in src is stale vs the circuit (ZK review I-1): regenerate it
 * from the new zkey first.
 *
 *   export GLOAM_ACK_SEALED_SWAP_H1_ZK1=1   # only once H1 + ZK-1 are fixed
 *   forge script script/DeploySealedSwapVerifier.s.sol:DeploySealedSwapVerifier \
 *     --rpc-url $RPC_URL --broadcast
 */
contract DeploySealedSwapVerifier is SealedSwapGuard {
    function run() external {
        _requireSealedSwapAck();

        uint256 pk = vm.envUint("DEPLOYER_PK");
        vm.startBroadcast(pk);
        SealedSwapVerifier g = new SealedSwapVerifier();
        SealedSwapIVerifier adapter = new SealedSwapIVerifier(g);
        console2.log("SealedSwapVerifier", address(g));
        console2.log("SealedSwapIVerifier", address(adapter));
        vm.stopBroadcast();
    }
}
