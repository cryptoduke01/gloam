// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {ShieldPoolPoseidon} from "../src/ShieldPoolPoseidon.sol";

/**
 * Deploy ONLY the pool, reusing verifiers already deployed by DeployTempo.
 *
 * Use this after DeployTempo has deployed the verifier stack but the pool tx
 * failed (e.g. Tempo's 30M per-tx gas cap before the hardcoded-zeros fix). The
 * pool constructor now does no on-chain Poseidon hashing, so it fits.
 *
 *   export DEPLOYER_PK=0x...
 *   export RPC_URL=https://rpc.moderato.tempo.xyz
 *   export POSEIDON2=0x...          # Poseidon2 from deploy-poseidon.mjs
 *   export DUAL_VERIFIER=0x...      # DualProofVerifier from DeployTempo
 *   export SHIELD_IVERIFIER=0x...   # ShieldIVerifier from DeployTempo
 *   forge script script/DeployTempoPool.s.sol:DeployTempoPool --rpc-url $RPC_URL --broadcast
 */
contract DeployTempoPool is Script {
    function run() external {
        uint256 pk = vm.envUint("DEPLOYER_PK");
        address poseidon2 = vm.envAddress("POSEIDON2");
        address dual = vm.envAddress("DUAL_VERIFIER");
        address shieldI = vm.envAddress("SHIELD_IVERIFIER");
        vm.startBroadcast(pk);

        ShieldPoolPoseidon pool = new ShieldPoolPoseidon(poseidon2, dual);
        pool.setShieldVerifier(shieldI);

        console2.log("chainId", block.chainid);
        console2.log("ShieldPoolPoseidon", address(pool));
        console2.log("verifier (dual)", address(pool.verifier()));
        console2.log("shieldVerifier", address(pool.shieldVerifier()));
        console2.log("sealedSwapVerifier (must be 0)", address(pool.sealedSwapVerifier()));

        vm.stopBroadcast();
    }
}
