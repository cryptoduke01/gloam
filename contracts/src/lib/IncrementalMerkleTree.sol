// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title IncrementalMerkleTree
 * @notice Keccak-based incremental Merkle tree for testnet plumbing.
 * @dev Production circuits often use Poseidon; tree API stays the same when we swap hash.
 *      Depth fixed at 20 → capacity 2^20 leaves.
 */
library IncrementalMerkleTree {
    uint256 internal constant DEPTH = 20;
    uint256 internal constant MAX_LEAVES = 1 << DEPTH;

    struct Tree {
        uint256 nextIndex;
        bytes32 currentRoot;
        /// @dev filledSubtrees[i] = current left node at level i
        bytes32[DEPTH] filledSubtrees;
        /// @dev zeros[i] = zero hash at level i
        bytes32[DEPTH] zeros;
        mapping(bytes32 => bool) knownRoots;
        uint32 rootHistorySize;
        uint32 currentRootIndex;
        /// @dev ring buffer of recent roots for proof verification window
        mapping(uint256 => bytes32) rootHistory;
    }

    error TreeFull();
    error ZeroLeaf();

    function initialize(Tree storage self) internal {
        bytes32 z = bytes32(0);
        for (uint256 i = 0; i < DEPTH; i++) {
            self.zeros[i] = z;
            self.filledSubtrees[i] = z;
            z = _hashLeftRight(z, z);
        }
        self.currentRoot = z;
        self.knownRoots[z] = true;
        self.rootHistory[0] = z;
        self.rootHistorySize = 100;
        self.currentRootIndex = 0;
        self.nextIndex = 0;
    }

    function insert(Tree storage self, bytes32 leaf) internal returns (uint256 index) {
        if (leaf == bytes32(0)) revert ZeroLeaf();
        if (self.nextIndex >= MAX_LEAVES) revert TreeFull();

        index = self.nextIndex;
        uint256 currentIndex = index;
        bytes32 currentLevelHash = leaf;
        bytes32 left;
        bytes32 right;

        for (uint256 i = 0; i < DEPTH; i++) {
            if (currentIndex % 2 == 0) {
                left = currentLevelHash;
                right = self.zeros[i];
                self.filledSubtrees[i] = currentLevelHash;
            } else {
                left = self.filledSubtrees[i];
                right = currentLevelHash;
            }
            currentLevelHash = _hashLeftRight(left, right);
            currentIndex /= 2;
        }

        self.currentRoot = currentLevelHash;
        self.knownRoots[currentLevelHash] = true;

        uint32 newRootIndex = (self.currentRootIndex + 1) % self.rootHistorySize;
        self.currentRootIndex = newRootIndex;
        self.rootHistory[newRootIndex] = currentLevelHash;

        self.nextIndex = index + 1;
    }

    function isKnownRoot(Tree storage self, bytes32 root) internal view returns (bool) {
        if (root == bytes32(0)) return false;
        return self.knownRoots[root];
    }

    function _hashLeftRight(bytes32 left, bytes32 right) private pure returns (bytes32) {
        return keccak256(abi.encodePacked(left, right));
    }
}
