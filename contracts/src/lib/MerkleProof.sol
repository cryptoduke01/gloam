// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title MerkleProof
 * @notice Verify keccak paths for IncrementalMerkleTree (DEPTH = 20).
 * @dev Same layout as app/src/lib/merkle.ts `verifyMerklePath`.
 */
library MerkleProof {
    uint256 internal constant DEPTH = 20;

    function hashLeftRight(bytes32 left, bytes32 right) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(left, right));
    }

    /**
     * @param leaf Commitment leaf
     * @param leafIndex Index in the tree
     * @param pathElements Siblings bottom → top (length DEPTH)
     * @param root Expected root
     */
    function verify(
        bytes32 leaf,
        uint256 leafIndex,
        bytes32[DEPTH] memory pathElements,
        bytes32 root
    ) internal pure returns (bool) {
        bytes32 hash = leaf;
        uint256 idx = leafIndex;
        for (uint256 i = 0; i < DEPTH; i++) {
            bytes32 sib = pathElements[i];
            if (idx % 2 == 0) {
                hash = hashLeftRight(hash, sib);
            } else {
                hash = hashLeftRight(sib, hash);
            }
            idx /= 2;
        }
        return hash == root;
    }

    /// @notice Recompute root from leaf + path (for tests / offchain parity)
    function computeRoot(
        bytes32 leaf,
        uint256 leafIndex,
        bytes32[DEPTH] memory pathElements
    ) internal pure returns (bytes32) {
        bytes32 hash = leaf;
        uint256 idx = leafIndex;
        for (uint256 i = 0; i < DEPTH; i++) {
            bytes32 sib = pathElements[i];
            if (idx % 2 == 0) {
                hash = hashLeftRight(hash, sib);
            } else {
                hash = hashLeftRight(sib, hash);
            }
            idx /= 2;
        }
        return hash;
    }
}
