// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IVerifier} from "../interfaces/IVerifier.sol";

/**
 * @title DualProofVerifier
 * @notice Routes unshield (5 public inputs) vs transfer (4 public inputs).
 * @dev Deploy after UnshieldIVerifier + TransferIVerifier. Owner setVerifier on pool.
 */
contract DualProofVerifier is IVerifier {
    IVerifier public immutable unshieldVerifier;
    IVerifier public immutable transferVerifier;

    constructor(IVerifier unshieldVerifier_, IVerifier transferVerifier_) {
        unshieldVerifier = unshieldVerifier_;
        transferVerifier = transferVerifier_;
    }

    function verify(
        bytes calldata proof,
        uint256[] calldata publicInputs
    ) external view returns (bool) {
        if (publicInputs.length == 5) {
            return unshieldVerifier.verify(proof, publicInputs);
        }
        if (publicInputs.length == 4) {
            return transferVerifier.verify(proof, publicInputs);
        }
        return false;
    }
}
