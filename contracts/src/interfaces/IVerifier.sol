// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title IVerifier
 * @notice Onchain verification of shield/transfer/unshield proofs.
 * @dev Concrete system (Groth16 / Plonk / Halo2 wrapper) chosen when circuits land.
 */
interface IVerifier {
    /// @return true if proof is valid for the public inputs
    function verify(
        bytes calldata proof,
        uint256[] calldata publicInputs
    ) external view returns (bool);
}
