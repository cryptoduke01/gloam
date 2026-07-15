// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IVerifier} from "../interfaces/IVerifier.sol";
import {SealedSwapVerifier} from "./SealedSwapVerifier.sol";

/**
 * @title SealedSwapIVerifier
 * @notice abi.encode(a,b,c) + 9 public inputs → Groth16 sealed swap.
 * @dev Dev zkey until production ceremony.
 */
contract SealedSwapIVerifier is IVerifier {
    SealedSwapVerifier public immutable groth16;

    constructor(SealedSwapVerifier groth16_) {
        groth16 = groth16_;
    }

    function verify(
        bytes calldata proof,
        uint256[] calldata publicInputs
    ) external view returns (bool) {
        if (publicInputs.length != 9) return false;
        (uint256[2] memory a, uint256[2][2] memory b, uint256[2] memory c) = abi
            .decode(proof, (uint256[2], uint256[2][2], uint256[2]));
        uint256[9] memory pub;
        for (uint256 i = 0; i < 9; i++) {
            pub[i] = publicInputs[i];
        }
        return groth16.verifyProof(a, b, c, pub);
    }
}
