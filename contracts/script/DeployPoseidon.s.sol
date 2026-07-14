// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";

/**
 * @notice Deploy circomlibjs Poseidon hashers (2- and 3-input) from precomputed bytecode.
 *
 * Artifacts: circuits/build/poseidon/PoseidonT3.json + PoseidonT4.json
 * (generate with: node -e "require('circomlibjs').poseidonContract...")
 *
 *   export DEPLOYER_PK=0x...
 *   forge script script/DeployPoseidon.s.sol --rpc-url $RPC --broadcast
 *
 * Then deploy ShieldPoolPoseidon with those addresses (next).
 */
contract DeployPoseidon is Script {
    function run() external {
        // Bytecode loaded via ffi or env for size — use create2 helper script in JS instead.
        console2.log("Use circuits/scripts/deploy-poseidon.mjs with ethers + DEPLOYER_PK");
        console2.log("Artifacts: circuits/build/poseidon/*.json");
    }
}
