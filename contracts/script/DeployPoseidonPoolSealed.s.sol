// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {ShieldPoolPoseidon} from "../src/ShieldPoolPoseidon.sol";

/**
 * Redeploy Poseidon vault WITH sealedSwap(), then attach sealed-swap verifier.
 * Reuses existing Poseidon2 + DualProofVerifier on RH testnet.
 *
 * Ends with endSetup(), after which every verifier/rate/oracle change needs the
 * 3-day timelock. So the shield verifier (C1 fix) is wired here too: ending setup
 * without it would leave the unbound shield() path open for at least 3 days.
 * Swap rates are NOT set here; add setSwapRate(...) calls before endSetup() if the
 * pool should launch with a pair enabled (audit H1 still applies to sealedSwap).
 *
 *   export DEPLOYER_PK=0x...
 *   export SHIELD_IVERIFIER=0x...   # ShieldIVerifier on the same chain
 *   export RPC_URL=https://rpc.testnet.chain.robinhood.com
 *   forge script script/DeployPoseidonPoolSealed.s.sol:DeployPoseidonPoolSealed \
 *     --rpc-url $RPC_URL --broadcast
 *
 * Then point the app at the new pool:
 *   NEXT_PUBLIC_POSEIDON_SHIELD_POOL=<new>
 *   NEXT_PUBLIC_SHIELD_DEPLOY_BLOCK=<block>
 * Or update app/src/lib/config.ts TESTNET_POSEIDON_POOL defaults.
 */
contract DeployPoseidonPoolSealed is Script {
    // Live RH testnet addresses (see deployments/poseidon-testnet.json)
    address constant POSEIDON2 = 0xcc2d2D0f12324DcC32f781198664C92BB5200947;
    address constant DUAL_VERIFIER = 0x4B0D0BD35C88F06A552439D5eBbB71A2FeF0949C;
    address constant SEALED_SWAP_I = 0x68C28ECD40320038bF8DE34Bb02064e12f602371;

    function run() external {
        uint256 pk = vm.envUint("DEPLOYER_PK");
        address shieldI = vm.envAddress("SHIELD_IVERIFIER");
        vm.startBroadcast(pk);

        // Constructor: (poseidon2, unshield/transfer dual verifier)
        ShieldPoolPoseidon pool = new ShieldPoolPoseidon(POSEIDON2, DUAL_VERIFIER);
        pool.setSealedSwapVerifier(SEALED_SWAP_I);
        pool.setShieldVerifier(shieldI);

        // FINAL STEP: end setup mode. Irreversible. From here on the owner has no
        // instant power over proofs, pricing, or asset flows: every verifier / rate
        // / oracle setter reverts unless first announced with queueChange() and
        // executed after the 3-day CHANGE_DELAY. There is no emergencyWithdraw, so
        // the owner cannot move user funds at all. Do all wiring ABOVE this line.
        pool.endSetup();

        console2.log("ShieldPoolPoseidon (sealed)", address(pool));
        console2.log("verifier (dual)", address(pool.verifier()));
        console2.log("sealedSwapVerifier", address(pool.sealedSwapVerifier()));
        console2.log("shieldVerifier", address(pool.shieldVerifier()));
        console2.log("setupMode (must be false)", pool.setupMode());
        console2.log("Update app: NEXT_PUBLIC_POSEIDON_SHIELD_POOL + deploy block");

        vm.stopBroadcast();
    }
}
