// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {console2} from "forge-std/Script.sol";
import {MainnetDeploy} from "./MainnetDeploy.sol";

interface IPoolVerifiers {
    function verifier() external view returns (address);
    function shieldVerifier() external view returns (address);
}

/**
 * Reads only: the verifiers a deployed vault points at hold the ceremony's final
 * keys. Each one must accept a real proof made with the final keys and refuse
 * one made with the dev keys, the same check the deploy runs before it creates
 * the vault (MainnetDeploy._requireCeremonyKeys).
 *
 *   POOL=0x... forge script script/CheckCeremonyKeys.s.sol:CheckCeremonyKeys --rpc-url $RPC_URL
 *
 * No --broadcast, no key: forge runs the calls against a local copy of the chain
 * and sends nothing. The after-deploy scripts (base-mainnet-after-deploy.sh,
 * ethereum-mainnet-after-deploy.sh) run it and stop unless it prints
 * "ceremony keys ok".
 */
contract CheckCeremonyKeys is MainnetDeploy {
    function run() external view {
        IPoolVerifiers pool = IPoolVerifiers(vm.envAddress("POOL"));
        address dual = pool.verifier();
        address shieldI = pool.shieldVerifier();
        require(dual.code.length > 0, "the vault's spend verifier has no code");
        require(shieldI.code.length > 0, "the vault's shield verifier has no code");
        _requireCeremonyKeys(dual, shieldI);
        console2.log("spend verifier", dual);
        console2.log("shield verifier", shieldI);
        console2.log("ceremony keys ok");
    }
}
