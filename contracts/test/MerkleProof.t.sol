// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {ShieldPool} from "../src/ShieldPool.sol";
import {MerkleProof} from "../src/lib/MerkleProof.sol";
import {IncrementalMerkleTree as IMT} from "../src/lib/IncrementalMerkleTree.sol";

/**
 * @dev Rebuilds paths the same way as app/src/lib/merkle.ts (layer walk + zeros).
 */
contract MerkleProofTest is Test {
    using IMT for IMT.Tree;

    uint256 internal constant DEPTH = 20;

    function test_verify_single_leaf_against_pool() public {
        ShieldPool pool = new ShieldPool(address(0));
        vm.deal(address(this), 1 ether);
        bytes32 leaf = keccak256("only");
        pool.shield{value: 1 ether}(address(0), 1 ether, leaf);

        bytes32[DEPTH] memory path = _pathFor(new bytes32[](1), 0);
        // rebuild leaves array
        bytes32[] memory leaves = new bytes32[](1);
        leaves[0] = leaf;
        path = _pathFor(leaves, 0);

        assertTrue(MerkleProof.verify(leaf, 0, path, pool.currentRoot()));
    }

    function test_verify_three_leaves() public {
        bytes32[] memory leaves = new bytes32[](3);
        leaves[0] = keccak256("a");
        leaves[1] = keccak256("b");
        leaves[2] = keccak256("c");

        ShieldPool pool = new ShieldPool(address(0));
        vm.deal(address(this), 3 ether);
        for (uint256 i = 0; i < 3; i++) {
            pool.shield{value: 1 ether}(address(0), 1 ether, leaves[i]);
        }

        bytes32 root = pool.currentRoot();
        for (uint256 i = 0; i < 3; i++) {
            bytes32[DEPTH] memory path = _pathFor(leaves, i);
            assertTrue(MerkleProof.verify(leaves[i], i, path, root));
        }
    }

    function test_bad_path_fails() public {
        bytes32[] memory leaves = new bytes32[](1);
        leaves[0] = keccak256("x");
        ShieldPool pool = new ShieldPool(address(0));
        vm.deal(address(this), 1 ether);
        pool.shield{value: 1 ether}(address(0), 1 ether, leaves[0]);

        bytes32[DEPTH] memory path = _pathFor(leaves, 0);
        path[0] = bytes32(uint256(1)); // corrupt
        assertFalse(MerkleProof.verify(leaves[0], 0, path, pool.currentRoot()));
    }

    /// Layer-walk path builder (mirrors TS IncrementalMerkleTree.path)
    function _pathFor(
        bytes32[] memory leaves,
        uint256 leafIndex
    ) internal pure returns (bytes32[DEPTH] memory pathElements) {
        bytes32[DEPTH] memory zeros = _zeros();
        bytes32[] memory layer = new bytes32[](leaves.length);
        for (uint256 i = 0; i < leaves.length; i++) {
            layer[i] = leaves[i];
        }
        uint256 idx = leafIndex;

        for (uint256 level = 0; level < DEPTH; level++) {
            bool isRight = idx % 2 == 1;
            uint256 siblingIdx = isRight ? idx - 1 : idx + 1;
            bytes32 sibling = zeros[level];
            if (siblingIdx < layer.length) {
                sibling = layer[siblingIdx];
            }
            pathElements[level] = sibling;

            uint256 nextLen = (layer.length + 1) / 2;
            if (nextLen == 0) nextLen = 1;
            bytes32[] memory next = new bytes32[](nextLen);
            uint256 n;
            for (uint256 i = 0; i < layer.length; i += 2) {
                bytes32 left = layer[i];
                bytes32 right = zeros[level];
                if (i + 1 < layer.length) right = layer[i + 1];
                next[n++] = MerkleProof.hashLeftRight(left, right);
            }
            if (n == 0) {
                next[0] = zeros[level];
            }
            layer = next;
            idx /= 2;
        }
    }

    function _zeros() internal pure returns (bytes32[DEPTH] memory zeros) {
        bytes32 z = bytes32(0);
        for (uint256 i = 0; i < DEPTH; i++) {
            zeros[i] = z;
            z = MerkleProof.hashLeftRight(z, z);
        }
    }
}
