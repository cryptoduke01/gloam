// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {ShieldPool} from "../src/ShieldPool.sol";
import {IVerifier} from "../src/interfaces/IVerifier.sol";
import {MockERC20} from "./MockERC20.sol";

contract MockVerifier is IVerifier {
    bool public ok = true;

    function setOk(bool v) external {
        ok = v;
    }

    function verify(
        bytes calldata,
        uint256[] calldata
    ) external view returns (bool) {
        return ok;
    }
}

contract ShieldPoolTest is Test {
    ShieldPool pool;
    MockVerifier verifier;
    MockERC20 token;
    address alice = address(0xA11CE);

    function setUp() public {
        verifier = new MockVerifier();
        pool = new ShieldPool(address(verifier));
        token = new MockERC20();
        token.mint(alice, 1_000 ether);
        vm.deal(alice, 100 ether);
    }

    function test_shield_eth_custodies_and_inserts() public {
        bytes32 c = keccak256("note-eth");
        vm.prank(alice);
        pool.shield{value: 1 ether}(address(0), 1 ether, c);

        assertEq(pool.nextIndex(), 1);
        assertEq(pool.deposited(address(0)), 1 ether);
        assertEq(address(pool).balance, 1 ether);
        assertTrue(pool.isKnownRoot(pool.currentRoot()));
    }

    function test_shield_erc20_pulls_tokens() public {
        bytes32 c = keccak256("note-token");
        vm.startPrank(alice);
        token.approve(address(pool), 5 ether);
        pool.shield(address(token), 5 ether, c);
        vm.stopPrank();

        assertEq(pool.deposited(address(token)), 5 ether);
        assertEq(token.balanceOf(address(pool)), 5 ether);
        assertEq(token.balanceOf(alice), 995 ether);
    }

    function test_shield_rejects_zero_commitment() public {
        vm.prank(alice);
        vm.expectRevert(ShieldPool.ZeroCommitment.selector);
        pool.shield{value: 1 ether}(address(0), 1 ether, bytes32(0));
    }

    function test_shield_rejects_msg_value_mismatch() public {
        vm.prank(alice);
        vm.expectRevert(ShieldPool.InvalidMsgValue.selector);
        pool.shield{value: 0.5 ether}(address(0), 1 ether, keccak256("x"));
    }

    function test_multiple_shields_update_root() public {
        bytes32 r0 = pool.currentRoot();
        vm.prank(alice);
        pool.shield{value: 1 ether}(address(0), 1 ether, keccak256("a"));
        bytes32 r1 = pool.currentRoot();
        vm.prank(alice);
        pool.shield{value: 1 ether}(address(0), 1 ether, keccak256("b"));
        bytes32 r2 = pool.currentRoot();

        assertTrue(r0 != r1);
        assertTrue(r1 != r2);
        assertTrue(pool.isKnownRoot(r1));
        assertTrue(pool.isKnownRoot(r2));
        assertEq(pool.nextIndex(), 2);
    }

    function test_transfer_marks_nullifier_spent() public {
        vm.prank(alice);
        pool.shield{value: 1 ether}(address(0), 1 ether, keccak256("a"));
        bytes32 root = pool.currentRoot();
        bytes32 nullifier = keccak256("null-1");
        bytes32[2] memory next = [keccak256("b"), keccak256("c")];

        pool.transfer(hex"00", root, nullifier, next);
        assertTrue(pool.isSpent(nullifier));
        assertEq(pool.nextIndex(), 3);
    }

    function test_transfer_rejects_double_spend() public {
        vm.prank(alice);
        pool.shield{value: 1 ether}(address(0), 1 ether, keccak256("a"));
        bytes32 root = pool.currentRoot();
        bytes32 nullifier = keccak256("null-1");
        bytes32[2] memory next = [keccak256("b"), keccak256("c")];
        pool.transfer(hex"00", root, nullifier, next);

        vm.expectRevert(ShieldPool.AlreadySpent.selector);
        pool.transfer(hex"00", root, nullifier, next);
    }

    function test_transfer_rejects_without_verifier() public {
        ShieldPool bare = new ShieldPool(address(0));
        vm.deal(address(this), 1 ether);
        bare.shield{value: 1 ether}(address(0), 1 ether, keccak256("a"));
        bytes32 root = bare.currentRoot();
        bytes32[2] memory next = [keccak256("b"), keccak256("c")];

        vm.expectRevert(ShieldPool.VerifierNotSet.selector);
        bare.transfer(hex"00", root, keccak256("n"), next);
    }

    function test_unshield_releases_eth() public {
        vm.prank(alice);
        pool.shield{value: 2 ether}(address(0), 2 ether, keccak256("a"));
        bytes32 root = pool.currentRoot();
        address bob = address(0xB0B);

        uint256 before = bob.balance;
        pool.unshield(hex"00", root, keccak256("n1"), address(0), bob, 1 ether);
        assertEq(bob.balance, before + 1 ether);
        assertEq(pool.deposited(address(0)), 1 ether);
        assertTrue(pool.isSpent(keccak256("n1")));
    }

    function test_unshield_releases_erc20() public {
        vm.startPrank(alice);
        token.approve(address(pool), 10 ether);
        pool.shield(address(token), 10 ether, keccak256("t1"));
        vm.stopPrank();

        bytes32 root = pool.currentRoot();
        address bob = address(0xB0B);
        pool.unshield(hex"00", root, keccak256("n2"), address(token), bob, 3 ether);
        assertEq(token.balanceOf(bob), 3 ether);
        assertEq(pool.deposited(address(token)), 7 ether);
    }

    function test_unshield_rejects_overdraw() public {
        vm.prank(alice);
        pool.shield{value: 1 ether}(address(0), 1 ether, keccak256("a"));
        bytes32 root = pool.currentRoot();

        vm.expectRevert(ShieldPool.InsufficientPoolBalance.selector);
        pool.unshield(
            hex"00",
            root,
            keccak256("n"),
            address(0),
            address(0xB0B),
            2 ether
        );
    }

    function test_invalid_proof_reverts() public {
        verifier.setOk(false);
        vm.prank(alice);
        pool.shield{value: 1 ether}(address(0), 1 ether, keccak256("a"));
        bytes32 root = pool.currentRoot();
        bytes32[2] memory next = [keccak256("b"), keccak256("c")];

        vm.expectRevert(ShieldPool.InvalidProof.selector);
        pool.transfer(hex"00", root, keccak256("n"), next);
    }
}
