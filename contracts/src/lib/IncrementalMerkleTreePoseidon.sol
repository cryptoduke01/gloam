// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IPoseidon2} from "./IPoseidon.sol";

/**
 * @title IncrementalMerkleTreePoseidon
 * @notice Same insert API as keccak tree, but H(left,right)=Poseidon2(left,right).
 * @dev Pair with unshield.circom MerkleTreeChecker. Depth 20.
 */
library IncrementalMerkleTreePoseidon {
    uint256 internal constant DEPTH = 20;
    uint256 internal constant MAX_LEAVES = uint256(1) << DEPTH;

    struct Tree {
        uint256 nextIndex;
        uint256 currentRoot;
        uint256[DEPTH] filledSubtrees;
        uint256[DEPTH] zeros;
        mapping(uint256 => bool) knownRoots;
        uint32 rootHistorySize;
        uint32 currentRootIndex;
        mapping(uint256 => uint256) rootHistory;
        IPoseidon2 poseidon;
        bool initialized;
    }

    error TreeFull();
    error ZeroLeaf();
    error NotInitialized();

    function initialize(Tree storage self, IPoseidon2 poseidon_) internal {
        self.poseidon = poseidon_;
        uint256 z = 0;
        for (uint256 i = 0; i < DEPTH; i++) {
            self.zeros[i] = z;
            self.filledSubtrees[i] = z;
            z = _hash(self, z, z);
        }
        self.currentRoot = z;
        self.knownRoots[z] = true;
        self.rootHistory[0] = z;
        self.rootHistorySize = 100;
        self.currentRootIndex = 0;
        self.nextIndex = 0;
        self.initialized = true;
    }

    function insert(Tree storage self, uint256 leaf) internal returns (uint256 index) {
        if (!self.initialized) revert NotInitialized();
        if (leaf == 0) revert ZeroLeaf();
        if (self.nextIndex >= MAX_LEAVES) revert TreeFull();

        index = self.nextIndex;
        uint256 currentIndex = index;
        uint256 currentLevelHash = leaf;

        for (uint256 i = 0; i < DEPTH; i++) {
            if (currentIndex % 2 == 0) {
                self.filledSubtrees[i] = currentLevelHash;
                currentLevelHash = _hash(self, currentLevelHash, self.zeros[i]);
            } else {
                currentLevelHash = _hash(
                    self,
                    self.filledSubtrees[i],
                    currentLevelHash
                );
            }
            currentIndex /= 2;
        }

        self.currentRoot = currentLevelHash;
        self.knownRoots[currentLevelHash] = true;

        uint32 newRootIndex = (self.currentRootIndex + 1) % self.rootHistorySize;
        self.currentRootIndex = newRootIndex;
        self.rootHistory[newRootIndex] = currentLevelHash;

        self.nextIndex = index + 1;
    }

    /// @dev Every root ever produced stays valid permanently (via `knownRoots`), so an
    ///      in-flight proof never expires. The `rootHistory` ring buffer is retained only
    ///      for off-chain observability; it is intentionally NOT the validity source.
    function isKnownRoot(Tree storage self, uint256 root) internal view returns (bool) {
        if (root == 0) return false;
        return self.knownRoots[root];
    }

    function _hash(
        Tree storage self,
        uint256 left,
        uint256 right
    ) private view returns (uint256) {
        uint256[2] memory inputs;
        inputs[0] = left;
        inputs[1] = right;
        return self.poseidon.poseidon(inputs);
    }
}
