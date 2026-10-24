// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {stdJson} from "forge-std/StdJson.sol";
import {ShieldPoolPayments} from "../src/ShieldPoolPayments.sol";
import {DeployBaseSepolia} from "../script/DeployBaseSepolia.s.sol";
import {DeployBaseMainnet} from "../script/DeployBaseMainnet.s.sol";
import {MockERC20} from "./MockERC20.sol";

/**
 * The Base deploy scripts, run in a local EVM with the exact settings in
 * DEPLOY-BASE.md: each runs only on its own chain, lists native ETH next to the
 * stablecoins with the beta limits, sets the 0.25% cash-out fee for the
 * treasury, starts the handoff to the owner wallet and ends setup.
 */
contract DeployBaseTest is Test {
    using stdJson for string;

    // Not a real key: a local test signer only.
    uint256 constant PK = 0xB45E;
    address constant TREASURY = 0xB3900ac9350903218e4c7597bAb0f008F01B30B8;
    address constant OWNER = 0x76b7E410a227c888aBD2Bdc24Ee32E094B0FD4D8;

    address constant SEPOLIA_USDC = 0x036CbD53842c5426634e7929541eC2318f3dCF7e;
    address constant SEPOLIA_EURC = 0x808456652fdb597867f38412077A9182bf77359F;
    address constant USDC = 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913;
    address constant EURC = 0x60a3E35Cc302bFA44Cb288Bc5a4F316Fdb1adb42;
    address constant USDT = 0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2;

    function _env(string memory assets, string memory per, string memory total) internal {
        vm.setEnv("DEPLOYER_PK", vm.toString(bytes32(PK)));
        vm.setEnv("POSEIDON2", vm.toString(_deployPoseidon()));
        vm.setEnv("LIMIT_ASSETS", assets);
        vm.setEnv("LIMIT_PER_DEPOSIT", per);
        vm.setEnv("LIMIT_TOTAL", total);
        vm.setEnv("WITHDRAW_FEE_BPS", "25");
        vm.setEnv("FEE_RECIPIENT", vm.toString(TREASURY));
        vm.setEnv("NEW_OWNER", vm.toString(OWNER));
        vm.setEnv("NEW_OWNER_EOA", "1");
    }

    function _token(address at) internal {
        vm.etch(at, address(new MockERC20()).code);
    }

    /// The pool is the eighth contract the deployer creates (after three verifiers, their adapters and DualProofVerifier).
    function _poolAfter(uint256 nonceBefore) internal view returns (ShieldPoolPayments) {
        return ShieldPoolPayments(payable(vm.computeCreateAddress(vm.addr(PK), nonceBefore + 7)));
    }

    function _checkLimit(ShieldPoolPayments pool, address asset, uint256 per, uint256 total) internal view {
        (uint128 p, uint128 t) = pool.depositLimit(asset);
        assertEq(p, per, "perDeposit");
        assertEq(t, total, "total");
    }

    function _checkCommon(ShieldPoolPayments pool) internal view {
        assertTrue(pool.depositLimitsOn(), "limits on");
        assertFalse(pool.setupMode(), "setup ended");
        assertEq(pool.withdrawFeeBps(), 25, "fee");
        assertEq(pool.feeRecipient(), TREASURY, "fee recipient");
        assertEq(pool.pendingOwner(), OWNER, "pending owner");
        // ETH: 0.2 per deposit, 10 in total
        _checkLimit(pool, address(0), 0.2 ether, 10 ether);
    }

    function test_sepolia_refuses_other_chains() public {
        DeployBaseSepolia s = new DeployBaseSepolia();
        vm.expectRevert(bytes("wrong chain for this script"));
        s.run();
        vm.chainId(8453);
        vm.expectRevert(bytes("wrong chain for this script"));
        s.run();
    }

    function test_mainnet_refuses_other_chains() public {
        DeployBaseMainnet s = new DeployBaseMainnet();
        vm.expectRevert(bytes("wrong chain for this script"));
        s.run();
        vm.chainId(84532);
        vm.expectRevert(bytes("wrong chain for this script"));
        s.run();
    }

    /// One test runs both deploys in turn: the settings travel in process env vars,
    /// which tests running side by side would overwrite for each other.
    function test_deploys_with_runbook_settings() public {
        _sepoliaDeploy();
        _mainnetDeploy();
    }

    function _sepoliaDeploy() internal {
        vm.chainId(84532);
        _token(SEPOLIA_USDC);
        _token(SEPOLIA_EURC);
        _env(
            string.concat(vm.toString(SEPOLIA_USDC), ",", vm.toString(SEPOLIA_EURC), ",0x0000000000000000000000000000000000000000"),
            "500000000,500000000,200000000000000000",
            "25000000000,25000000000,10000000000000000000"
        );
        uint256 n = vm.getNonce(vm.addr(PK));
        new DeployBaseSepolia().run();
        ShieldPoolPayments pool = _poolAfter(n);
        _checkCommon(pool);
        _checkLimit(pool, SEPOLIA_USDC, 500e6, 25_000e6);
        _checkLimit(pool, SEPOLIA_EURC, 500e6, 25_000e6);
        _checkLimit(pool, USDT, 0, 0);
    }

    function _mainnetDeploy() internal {
        vm.chainId(8453);
        _token(USDC);
        _token(EURC);
        _token(USDT);
        _env(
            string.concat(vm.toString(USDC), ",", vm.toString(EURC), ",", vm.toString(USDT), ",0x0000000000000000000000000000000000000000"),
            "500000000,500000000,500000000,200000000000000000",
            "25000000000,25000000000,25000000000,10000000000000000000"
        );
        uint256 n = vm.getNonce(vm.addr(PK));
        new DeployBaseMainnet().run();
        ShieldPoolPayments pool = _poolAfter(n);
        _checkCommon(pool);
        _checkLimit(pool, USDC, 500e6, 25_000e6);
        _checkLimit(pool, EURC, 500e6, 25_000e6);
        _checkLimit(pool, USDT, 500e6, 25_000e6);
    }

    function _deployPoseidon() internal returns (address addr) {
        bytes memory bytecode = vm.readFile("test/fixtures/Poseidon2.json").readBytes(".bytecode");
        assembly {
            addr := create(0, add(bytecode, 0x20), mload(bytecode))
        }
        require(addr != address(0), "poseidon deploy failed");
    }
}
