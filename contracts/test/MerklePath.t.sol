// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {ShieldPool} from "../src/ShieldPool.sol";
import {IncrementalMerkleTree as IMT} from "../src/lib/IncrementalMerkleTree.sol";

/**
 * @dev Path rebuild logic mirrored in app/src/lib/merkle.ts — keep roots aligned.
 */
contract MerklePathTest is Test {
    using IMT for IMT.Tree;

    function test_empty_root_deterministic() public {
        ShieldPool a = new ShieldPool(address(0));
        ShieldPool b = new ShieldPool(address(0));
        assertEq(a.currentRoot(), b.currentRoot());
        assertEq(a.nextIndex(), 0);
    }

    function test_single_leaf_root() public {
        ShieldPool pool = new ShieldPool(address(0));
        vm.deal(address(this), 1 ether);
        bytes32 leaf = keccak256("leaf-0");
        pool.shield{value: 1 ether}(address(0), 1 ether, leaf);
        assertEq(pool.nextIndex(), 1);
        // root must change from empty
        ShieldPool empty = new ShieldPool(address(0));
        assertTrue(pool.currentRoot() != empty.currentRoot());
        assertTrue(pool.isKnownRoot(pool.currentRoot()));
    }

    function test_two_leaves_known_roots() public {
        ShieldPool pool = new ShieldPool(address(0));
        vm.deal(address(this), 2 ether);
        pool.shield{value: 1 ether}(address(0), 1 ether, keccak256("a"));
        bytes32 r1 = pool.currentRoot();
        pool.shield{value: 1 ether}(address(0), 1 ether, keccak256("b"));
        bytes32 r2 = pool.currentRoot();
        assertTrue(pool.isKnownRoot(r1));
        assertTrue(pool.isKnownRoot(r2));
        assertTrue(r1 != r2);
    }
}
