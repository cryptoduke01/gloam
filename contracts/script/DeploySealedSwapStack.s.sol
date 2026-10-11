// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {console2} from "forge-std/Script.sol";
import {SealedSwapVerifier} from "../src/verifiers/SealedSwapVerifier.sol";
import {SealedSwapIVerifier} from "../src/verifiers/SealedSwapIVerifier.sol";
import {ShieldPoolPoseidon} from "../src/ShieldPoolPoseidon.sol";
import {SealedSwapGuard} from "./SealedSwapGuard.sol";

/**
 * Deploy sealed-swap verifiers. Optionally set on an existing pool that already
 * has sealedSwap() + setSealedSwapVerifier (new pool bytecode).
 *
 * GUARDED (audit L-2 / ZK-1, 2026-10-11). Both paths (deploy only, and set or
 * queue on POOL) revert unless GLOAM_ACK_SEALED_SWAP_H1_ZK1=1. Sealed swap must
 * stay off until H1 and ZK-1 are fixed and a new circuit + ceremony is done; see
 * SealedSwapGuard.sol. The SealedSwapVerifier in src is stale vs the circuit
 * (ZK review I-1): regenerate it from the new zkey before setting the flag.
 *
 *   export GLOAM_ACK_SEALED_SWAP_H1_ZK1=1   # only once H1 + ZK-1 are fixed
 *   export DEPLOYER_PK=0x...
 *   export RPC_URL=https://rpc.testnet.chain.robinhood.com
 *   # optional: export POOL=0x...  (must support setSealedSwapVerifier)
 *   forge script script/DeploySealedSwapStack.s.sol:DeploySealedSwapStack \
 *     --rpc-url $RPC_URL --broadcast
 *
 * Full new vault (keeps old pool for history): use DeployPoseidonPoolSealed.s.sol
 * or circuits/scripts/deploy-phase2.mjs. Both refuse to wire sealed swap without
 * the same flag.
 */
contract DeploySealedSwapStack is SealedSwapGuard {
    function run() external {
        _requireSealedSwapAck();

        uint256 pk = vm.envUint("DEPLOYER_PK");
        vm.startBroadcast(pk);

        SealedSwapVerifier g = new SealedSwapVerifier();
        SealedSwapIVerifier adapter = new SealedSwapIVerifier(g);
        console2.log("SealedSwapVerifier", address(g));
        console2.log("SealedSwapIVerifier", address(adapter));

        address pool = vm.envOr("POOL", address(0));
        if (pool != address(0)) {
            // Pool has payable receive() - cast for interface call
            ShieldPoolPoseidon p = ShieldPoolPoseidon(payable(pool));
            // Pools past endSetup() only accept the change through the timelock.
            // Pre-timelock bytecode has no setupMode(); treat it as direct-set.
            bool timelocked;
            try p.setupMode() returns (bool inSetup) {
                timelocked = !inSetup;
            } catch {
                timelocked = false;
            }
            if (timelocked) {
                bytes memory call_ = abi.encodeCall(
                    ShieldPoolPoseidon.setSealedSwapVerifier,
                    (address(adapter))
                );
                (bytes32 id, uint256 eta) = p.queueChange(call_);
                console2.log("queued setSealedSwapVerifier on", pool);
                console2.logBytes32(id);
                console2.log("executable from (unix)", eta);
                console2.log("then: cast send $POOL 'executeChange(bytes)' <call>, call =");
                console2.logBytes(call_);
            } else {
                p.setSealedSwapVerifier(address(adapter));
                console2.log("setSealedSwapVerifier on", pool);
            }
        } else {
            console2.log("POOL not set - only verifiers deployed");
            console2.log("Redeploy pool with sealedSwap then setSealedSwapVerifier");
        }

        vm.stopBroadcast();
    }
}
