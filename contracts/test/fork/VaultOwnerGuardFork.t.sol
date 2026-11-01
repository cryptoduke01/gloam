// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

// VaultOwnerGuard against the live vaults on all four mainnets, on local forks:
// the real owner hands over through vm.prank, the guard is deployed by the real
// script at its real address, and limits, fees and the verifier lock are checked
// on the deployed bytecode with the deployed verifiers. Nothing is broadcast.
//
// Withdrawals use real proofs, never a mocked verifier. The cash outs replayed are
// the exact calldata of real transactions (test/fixtures/guard-fork-cash-outs.json),
// sent straight to the vault so they run on the fork's state, guard included.
// (vm.transact would not: it replays on the chain's own state and ignores the
// handover made on the fork.)
//  - Base and Tempo: forks the block before a real cash out, hands over, replays it.
//  - Robinhood Chain: the public RPC keeps no old state, so it forks the latest
//    block, marks one real note unspent on the fork only, and replays its cash out.
//  - Ethereum: no cash out has happened yet, so it forks the block before the
//    vault's first deposit, when its tree was empty, and runs the repo's fixture
//    (final-key proofs) through the live vault: deposits, a private send, cash outs.
//
// Off by default (it reads mainnets over RPC). From contracts/:
//   GUARD_FORK=1 forge test --match-contract VaultOwnerGuardFork --no-match-test tempo -vv
//   GUARD_FORK=1 forge test --match-contract VaultOwnerGuardFork --match-test tempo --network tempo -vv
// Tempo needs --network tempo: its stablecoins are precompiles (code 0xef) that
// plain revm does not run. GUARD_RPC_<CHAIN> picks an RPC. Runs until the real
// handover: after it the vault's owner is no longer the wallet these tests prank.

import {Test, console2} from "forge-std/Test.sol";
import {stdJson} from "forge-std/StdJson.sol";
import {VaultOwnerGuard} from "../../src/VaultOwnerGuard.sol";
import {ShieldPoolCore} from "../../src/ShieldPoolCore.sol";
import {ShieldPoolPayments} from "../../src/ShieldPoolPayments.sol";
import {ChangeTimelock} from "../../src/lib/ChangeTimelock.sol";
import {DeployVaultOwnerGuard} from "../../script/DeployVaultOwnerGuard.s.sol";

interface IERC20Min {
    function balanceOf(address who) external view returns (uint256);
}

interface ITether {
    function approve(address spender, uint256 value) external;
}

contract VaultOwnerGuardForkTest is Test {
    using stdJson for string;

    ShieldPoolPayments constant VAULT = ShieldPoolPayments(payable(0x39E28Cde55CAB798874746ac52cb4B5Cc99a0194));
    address constant OWNER = 0x76b7E410a227c888aBD2Bdc24Ee32E094B0FD4D8;
    address constant TREASURY = 0xB3900ac9350903218e4c7597bAb0f008F01B30B8;
    address constant VERIFIER = 0x1421353d471dF6C847713aee391Db38978fE714a;
    address constant SHIELD_VERIFIER = 0x69Fa6d2De0A66dA718DF022cEe98485AfDb03465;
    bytes32 constant VAULT_CODEHASH = 0x58d9843b0c6d9b81fbbb015de6a2413a7443cc63476185edf43d882f672088f2;
    address constant EVIL = address(0xBAD);
    uint128 constant MAX = type(uint128).max;

    // assets listed on each chain, one for the limit checks
    address constant USDG_RH = 0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168;
    address constant USDC_BASE = 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913;
    address constant USDC_ETH = 0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48;
    address constant USDT_ETH = 0xdAC17F958D2ee523a2206206994597C13D831ec7;
    address constant USDCE_TEMPO = 0x20C000000000000000000000b9537d11c60E8b50;

    // the blocks of the real cash outs in the fixture
    uint256 constant TX_BASE_BLOCK = 53261641;
    uint256 constant TX_TEMPO_BLOCK = 45551624;
    /// The block of the Ethereum vault's first deposit.
    uint256 constant ETH_FIRST_DEPOSIT_BLOCK = 26288890;

    uint256 constant SPENT_SLOT = 50; // ShieldPoolCore.spent, forge inspect storage-layout

    struct CashOut {
        bytes input;
        bytes32 nullifier;
        address asset;
        address to;
        uint256 amount;
    }

    VaultOwnerGuard guard;
    address relayer = makeAddr("relayer");

    function setUp() public {
        if (!vm.envOr("GUARD_FORK", false)) vm.skip(true);
    }

    function _rpc(string memory envName, string memory fallback_) internal view returns (string memory) {
        return vm.envOr(envName, fallback_);
    }

    function _rh() internal view returns (string memory) {
        return _rpc("GUARD_RPC_ROBINHOOD", "https://rpc.mainnet.chain.robinhood.com");
    }

    function _tempo() internal view returns (string memory) {
        return _rpc("GUARD_RPC_TEMPO", "https://rpc.tempo.xyz");
    }

    function _base() internal view returns (string memory) {
        return _rpc("GUARD_RPC_BASE", "https://mainnet.base.org");
    }

    /// Serves old state, which the Ethereum fixture flow needs.
    function _eth() internal view returns (string memory) {
        return _rpc("GUARD_RPC_ETHEREUM", "https://gateway.tenderly.co/public/mainnet");
    }

    // ───────────────────────────────────────────────────────────── handover and limits

    function test_robinhood_handover_limits_fees_lock() public {
        vm.createSelectFork(_rh());
        assertEq(block.chainid, 4663);
        _handoverSuite(USDG_RH);
    }

    function test_base_handover_limits_fees_lock() public {
        vm.createSelectFork(_base());
        assertEq(block.chainid, 8453);
        _handoverSuite(USDC_BASE);
    }

    function test_ethereum_handover_limits_fees_lock() public {
        vm.createSelectFork(_eth());
        assertEq(block.chainid, 1);
        _handoverSuite(USDC_ETH);
    }

    function test_tempo_handover_limits_fees_lock() public {
        vm.createSelectFork(_tempo());
        assertEq(block.chainid, 4217);
        _handoverSuite(USDCE_TEMPO);
    }

    function _handoverSuite(address asset) internal {
        _assertLiveVault();
        (uint128 per, uint128 total) = VAULT.depositLimit(asset);
        assertGt(per, 0, "listed");
        bytes32 rootBefore = VAULT.currentRoot();
        uint256 leavesBefore = VAULT.nextIndex();
        uint256 depositedBefore = VAULT.deposited(asset);

        // A queue entry an attacker with the old key left behind.
        vm.startPrank(OWNER);
        (, uint256 evilEta) = VAULT.queueChange(_evilCall());
        VAULT.queueChange(_evilShieldCall());
        vm.stopPrank();

        _deployGuardAndTakeOver();
        _assertLocked();
        assertEq(VAULT.currentRoot(), rootBefore, "the tree is untouched");
        assertEq(VAULT.nextIndex(), leavesBefore);
        assertEq(VAULT.deposited(asset), depositedBefore);

        _oldOwnerIsOut(asset);
        _lowerWorks(asset, per, total);
        _timelockWorks(asset, per, total, evilEta);
        _queuedChangeRuns(asset);
        _verifierStaysShut();
        _assertLocked();

        // The script's own after-handover check, on this fork.
        new DeployVaultOwnerGuard().check();
    }

    function _oldOwnerIsOut(address asset) internal {
        vm.startPrank(OWNER);
        vm.expectRevert(ShieldPoolCore.NotOwner.selector);
        VAULT.transferOwnership(OWNER);
        vm.expectRevert(ShieldPoolCore.NotOwner.selector);
        VAULT.executeChange(_evilCall());
        vm.expectRevert(ShieldPoolCore.NotOwner.selector);
        VAULT.queueChange(_evilCall());
        vm.expectRevert(ShieldPoolCore.NotOwner.selector);
        VAULT.lowerDepositLimit(asset, 0, 0);
        vm.stopPrank();
    }

    function _lowerWorks(address asset, uint128 per, uint128 total) internal {
        vm.startPrank(OWNER);
        guard.lowerDepositLimit(asset, per - 1, total - 1);
        guard.lowerWithdrawFee(10);
        vm.stopPrank();
        (uint128 p, uint128 t) = VAULT.depositLimit(asset);
        assertEq(p, per - 1);
        assertEq(t, total - 1);
        assertEq(VAULT.withdrawFeeBps(), 10);
        assertEq(VAULT.feeRecipient(), TREASURY);
    }

    /// Queue, cancel and execute through the guard, with the vault's 3 days.
    function _timelockWorks(address asset, uint128 per, uint128 total, uint256 evilEta) internal {
        bytes memory fee = abi.encodeCall(ShieldPoolCore.setWithdrawFee, (uint16(25), TREASURY));
        bytes memory limit = abi.encodeCall(ShieldPoolCore.setDepositLimit, (asset, per, total));
        bytes memory dropped = abi.encodeCall(ShieldPoolCore.setDepositLimit, (asset, 1, 1));

        vm.startPrank(OWNER);
        (, uint256 eta) = guard.queueChange(fee);
        assertEq(eta, block.timestamp + 3 days);
        guard.queueChange(limit);
        guard.queueChange(dropped);
        guard.cancelChange(dropped);
        assertEq(VAULT.changeEta(keccak256(dropped)), 0);
        vm.expectRevert(ChangeTimelock.ChangeNotReady.selector);
        guard.executeChange(fee);

        vm.warp(eta > evilEta ? eta : evilEta);
        guard.executeChange(fee);
        guard.executeChange(limit);
        vm.stopPrank();

        assertEq(VAULT.withdrawFeeBps(), 25);
        (uint128 p, uint128 t) = VAULT.depositLimit(asset);
        assertEq(p, per);
        assertEq(t, total);
    }

    /// A real change the old owner queued, run through the guard, while one is left.
    function _queuedChangeRuns(address asset) internal {
        bytes memory maxCall = abi.encodeCall(ShieldPoolCore.setDepositLimit, (asset, MAX, MAX));
        uint256 maxEta = VAULT.changeEta(keccak256(maxCall));
        if (maxEta == 0) {
            console2.log("no max limit queued for this asset on this block");
            return;
        }
        if (maxEta > block.timestamp) vm.warp(maxEta);
        vm.prank(OWNER);
        guard.executeChange(maxCall);
        (uint128 p, uint128 t) = VAULT.depositLimit(asset);
        assertEq(p, MAX, "the queued max limit landed");
        assertEq(t, MAX);
    }

    /// The matured verifier changes stay shut, by every route.
    function _verifierStaysShut() internal {
        vm.startPrank(OWNER);
        vm.expectRevert(VaultOwnerGuard.ChangeNotAllowed.selector);
        guard.executeChange(_evilCall());
        vm.expectRevert(VaultOwnerGuard.ChangeNotAllowed.selector);
        guard.executeChange(_evilShieldCall());
        vm.expectRevert(VaultOwnerGuard.ChangeNotAllowed.selector);
        guard.queueChange(_evilCall());
        vm.expectRevert(VaultOwnerGuard.ChangeNotAllowed.selector);
        guard.cancelChange(_evilCall());
        (bool ok, ) = address(guard).call(_evilCall());
        vm.stopPrank();
        assertFalse(ok, "not a proxy");
    }

    function _evilCall() internal pure returns (bytes memory) {
        return abi.encodeCall(ShieldPoolCore.setVerifier, (EVIL));
    }

    function _evilShieldCall() internal pure returns (bytes memory) {
        return abi.encodeCall(ShieldPoolCore.setShieldVerifier, (EVIL));
    }

    // ───────────────────────────────────────────────────────────── real proofs

    function test_robinhood_real_cash_out_after_handover() public {
        vm.createSelectFork(_rh());
        _assertLiveVault();
        CashOut memory c = _cashOut(".robinhood.input");
        assertEq(c.asset, USDG_RH);
        assertTrue(VAULT.isSpent(c.nullifier), "the note was spent for real");
        vm.store(address(VAULT), keccak256(abi.encode(c.nullifier, SPENT_SLOT)), bytes32(0));
        assertFalse(VAULT.isSpent(c.nullifier), "on this fork only");

        _deployGuardAndTakeOver();
        _replay(c);
    }

    function test_base_real_cash_out_after_handover() public {
        vm.createSelectFork(_base(), TX_BASE_BLOCK - 1);
        _assertLiveVault();
        CashOut memory c = _cashOut(".base.input");
        assertEq(c.asset, USDC_BASE);
        assertFalse(VAULT.isSpent(c.nullifier), "the block before the real cash out");

        _deployGuardAndTakeOver();
        _replay(c);
    }

    function test_tempo_real_cash_out_after_handover() public {
        vm.createSelectFork(_tempo(), TX_TEMPO_BLOCK - 1);
        _assertLiveVault();
        CashOut memory c = _cashOut(".tempo.input");
        assertEq(c.asset, USDCE_TEMPO);
        assertFalse(VAULT.isSpent(c.nullifier), "the block before the real cash out");

        _deployGuardAndTakeOver();
        _replay(c);
    }

    /// The whole money path on Ethereum's live vault, under the guard, with the
    /// deposit limits lowered to the fixture's amounts first to show they bind.
    function test_ethereum_real_deposit_send_and_cash_out_after_handover() public {
        vm.createSelectFork(_eth(), ETH_FIRST_DEPOSIT_BLOCK - 1);
        _assertLiveVault();
        assertEq(VAULT.nextIndex(), 0, "the live vault, before its first note");

        string memory fx = vm.readFile("test/fixtures/ethereum-fork-proofs.json");
        address recipient = fx.readAddress(".recipient");
        address payer = makeAddr("payer");
        deal(USDT_ETH, payer, 1_000e6);
        vm.deal(payer, 1 ether);

        _deployGuardAndTakeOver();
        vm.prank(OWNER);
        guard.lowerDepositLimit(USDT_ETH, 100e6, 25_000e6);

        vm.startPrank(payer);
        ITether(USDT_ETH).approve(address(VAULT), 100e6);
        VAULT.shieldBound(USDT_ETH, 100e6, fx.readBytes32(".shieldUsdt.commitment"), fx.readBytes(".shieldUsdt.proof"));
        vm.stopPrank();
        assertEq(VAULT.deposited(USDT_ETH), 100e6);

        // A closed asset refuses even a valid proof, at once. (Undone, for the rest.)
        uint256 open = vm.snapshotState();
        vm.prank(OWNER);
        guard.lowerDepositLimit(address(0), 0, 0);
        vm.prank(payer);
        vm.expectRevert(ShieldPoolCore.OverDepositLimit.selector);
        VAULT.shieldBound{value: 0.01 ether}(
            address(0), 0.01 ether, fx.readBytes32(".shieldEth.commitment"), fx.readBytes(".shieldEth.proof")
        );
        vm.revertToState(open);

        vm.prank(payer);
        VAULT.shieldBound{value: 0.01 ether}(
            address(0), 0.01 ether, fx.readBytes32(".shieldEth.commitment"), fx.readBytes(".shieldEth.proof")
        );

        bytes32 sendRoot = fx.readBytes32(".send.root");
        assertTrue(VAULT.isKnownRoot(sendRoot), "the fixture's tree is the vault's tree");
        vm.prank(relayer);
        VAULT.transfer(
            fx.readBytes(".send.proof"),
            sendRoot,
            fx.readBytes32(".send.nullifier"),
            [fx.readBytes32(".send.payment"), fx.readBytes32(".send.change")]
        );

        bytes32 root = fx.readBytes32(".cashOutUsdt.root");
        vm.startPrank(relayer);
        VAULT.unshield(fx.readBytes(".cashOutUsdt.proof"), root, fx.readBytes32(".cashOutUsdt.nullifier"), USDT_ETH, recipient, 60e6);
        VAULT.unshield(fx.readBytes(".cashOutEth.proof"), root, fx.readBytes32(".cashOutEth.nullifier"), address(0), recipient, 0.01 ether);
        vm.stopPrank();
        assertEq(IERC20Min(USDT_ETH).balanceOf(recipient), 60e6 - 150_000, "60 USDT less the 0.25% fee");
        assertEq(recipient.balance, 0.01 ether - 0.000025 ether);

        uint256 before = IERC20Min(USDT_ETH).balanceOf(TREASURY);
        vm.prank(relayer);
        VAULT.collectFees(USDT_ETH);
        assertEq(IERC20Min(USDT_ETH).balanceOf(TREASURY) - before, 150_000);
        _assertLocked();
    }

    // ───────────────────────────────────────────────────────────── helpers

    function _assertLiveVault() internal view {
        assertEq(address(VAULT).codehash, VAULT_CODEHASH, "the deployed vault");
        assertEq(VAULT.owner(), OWNER, "the real owner, until the rollout");
        assertEq(VAULT.pendingOwner(), address(0), "nobody offered");
        assertFalse(VAULT.setupMode(), "setup over");
        assertEq(address(VAULT.verifier()), VERIFIER);
        assertEq(address(VAULT.shieldVerifier()), SHIELD_VERIFIER);
    }

    function _assertLocked() internal view {
        assertEq(VAULT.owner(), address(guard), "the guard owns the vault");
        assertEq(VAULT.pendingOwner(), address(0), "nobody is offered the vault");
        assertEq(address(VAULT.verifier()), VERIFIER, "verifier unchanged");
        assertEq(address(VAULT.shieldVerifier()), SHIELD_VERIFIER, "shield verifier unchanged");
    }

    /// The real script, at the real address, then the two real handover steps.
    function _deployGuardAndTakeOver() internal {
        DeployVaultOwnerGuard script = new DeployVaultOwnerGuard();
        address at = script.predicted();
        guard = script.run();
        assertEq(address(guard), at, "the predicted address");
        assertEq(guard.controller(), OWNER);
        console2.log("guard", at, "chain", block.chainid);

        vm.prank(OWNER);
        VAULT.transferOwnership(address(guard));
        assertEq(VAULT.owner(), OWNER, "nothing moved yet");
        uint256 g = gasleft();
        vm.prank(OWNER);
        guard.acceptVaultOwnership();
        console2.log("gas: acceptVaultOwnership", g - gasleft());
    }

    function _cashOut(string memory key) internal view returns (CashOut memory c) {
        c.input = vm.readFile("test/fixtures/guard-fork-cash-outs.json").readBytes(key);
        assertEq(bytes4(c.input), ShieldPoolCore.unshield.selector, "a direct cash out");
        bytes memory args = new bytes(c.input.length - 4);
        for (uint256 i = 0; i < args.length; i++) args[i] = c.input[i + 4];
        (, , c.nullifier, c.asset, c.to, c.amount) = abi.decode(args, (bytes, bytes32, bytes32, address, address, uint256));
    }

    /// The transaction's exact bytes, through the live verifier, on this fork.
    function _replay(CashOut memory c) internal {
        assertEq(VAULT.owner(), address(guard), "the guard holds the vault during the replay");
        assertGe(VAULT.deposited(c.asset), c.amount, "the vault backs it");
        uint256 paidBefore = IERC20Min(c.asset).balanceOf(c.to);
        uint256 depositedBefore = VAULT.deposited(c.asset);
        uint256 owedBefore = VAULT.feesOwed(c.asset);
        uint256 bps = VAULT.withdrawFeeBps();
        uint256 fee = (c.amount / 10_000) * bps + ((c.amount % 10_000) * bps) / 10_000;

        vm.prank(relayer);
        (bool ok, bytes memory ret) = address(VAULT).call(c.input);
        if (!ok) {
            assembly {
                revert(add(ret, 0x20), mload(ret))
            }
        }

        assertTrue(VAULT.isSpent(c.nullifier));
        assertEq(IERC20Min(c.asset).balanceOf(c.to) - paidBefore, c.amount - fee, "paid in full, less the fee");
        assertEq(depositedBefore - VAULT.deposited(c.asset), c.amount);
        assertEq(VAULT.feesOwed(c.asset) - owedBefore, fee);
        console2.log("cash out replayed, amount", c.amount, "fee", fee);
        _assertLocked();
    }
}
