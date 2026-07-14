// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {ShieldPool} from "../src/ShieldPool.sol";
import {IVerifier} from "../src/interfaces/IVerifier.sol";

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

    function setUp() public {
        verifier = new MockVerifier();
        pool = new ShieldPool(address(verifier));
    }

    function test_shield_records_commitment() public {
        bytes32 c = keccak256("note-1");
        pool.shield(address(0), 0, c);
        assertEq(pool.nextIndex(), 1);
        assertEq(pool.commitments(0), c);
        assertTrue(pool.knownRoot(pool.currentRoot()));
    }

    function test_shield_rejects_zero_commitment() public {
        vm.expectRevert(ShieldPool.ZeroCommitment.selector);
        pool.shield(address(0), 0, bytes32(0));
    }

    function test_transfer_marks_nullifier_spent() public {
        bytes32 c0 = keccak256("a");
        pool.shield(address(0), 0, c0);
        bytes32 root = pool.currentRoot();
        bytes32 nullifier = keccak256("null-1");
        bytes32[2] memory next = [keccak256("b"), keccak256("c")];

        pool.transfer(hex"00", root, nullifier, next);
        assertTrue(pool.isSpent(nullifier));
        assertEq(pool.nextIndex(), 3);
    }

    function test_transfer_rejects_double_spend() public {
        pool.shield(address(0), 0, keccak256("a"));
        bytes32 root = pool.currentRoot();
        bytes32 nullifier = keccak256("null-1");
        bytes32[2] memory next = [keccak256("b"), keccak256("c")];
        pool.transfer(hex"00", root, nullifier, next);

        vm.expectRevert(ShieldPool.AlreadySpent.selector);
        pool.transfer(hex"00", root, nullifier, next);
    }

    function test_transfer_rejects_without_verifier() public {
        ShieldPool bare = new ShieldPool(address(0));
        bare.shield(address(0), 0, keccak256("a"));
        bytes32 root = bare.currentRoot();
        bytes32[2] memory next = [keccak256("b"), keccak256("c")];

        vm.expectRevert(ShieldPool.VerifierNotSet.selector);
        bare.transfer(hex"00", root, keccak256("n"), next);
    }
}
