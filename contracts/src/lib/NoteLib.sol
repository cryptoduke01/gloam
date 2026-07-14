// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title NoteLib
 * @notice Phase-2 note commitment / nullifier scheme (keccak for EVM parity).
 * @dev Circuits must compute the same preimages. Poseidon swap is a later upgrade
 *      with a matching tree; until then keccak keeps offchain TS and Solidity aligned.
 *
 * Note preimage (secret never on-chain):
 *   commitment = keccak256(abi.encodePacked(secret, amount, asset))
 *   nullifier  = keccak256(abi.encodePacked(secret, commitment))
 *
 * Unshield proof public inputs (order fixed — see ShieldPool._requireUnshieldProof):
 *   [root, nullifier, asset, amount, recipient]
 *
 * Transfer proof public inputs:
 *   [root, nullifier, newCommitment0, newCommitment1]
 */
library NoteLib {
    function commitment(
        bytes32 secret,
        uint256 amount,
        address asset
    ) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(secret, amount, asset));
    }

    function nullifier(
        bytes32 secret,
        bytes32 commitment_
    ) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(secret, commitment_));
    }
}
