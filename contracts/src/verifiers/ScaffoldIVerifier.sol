// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IVerifier} from "../interfaces/IVerifier.sol";
import {ScaffoldUnshieldVerifier} from "./ScaffoldUnshieldVerifier.sol";

/**
 * @title ScaffoldIVerifier
 * @notice Adapts snarkjs Groth16 verifier to IVerifier(bytes,uint256[]).
 *
 * ⚠️  SCAFFOLD ONLY — never setVerifier on a funded pool.
 *     Placeholder circuit does not bind notes; valid proofs ≠ private security.
 *
 * proof encoding: abi.encode(uint[2] a, uint[2][2] b, uint[2] c)
 * publicInputs: length 5 — [root, nullifier, asset, amount, recipient]
 */
contract ScaffoldIVerifier is IVerifier {
    ScaffoldUnshieldVerifier public immutable groth16;

    constructor(ScaffoldUnshieldVerifier groth16_) {
        groth16 = groth16_;
    }

    function verify(
        bytes calldata proof,
        uint256[] calldata publicInputs
    ) external view returns (bool) {
        if (publicInputs.length != 5) return false;
        (uint256[2] memory a, uint256[2][2] memory b, uint256[2] memory c) = abi
            .decode(proof, (uint256[2], uint256[2][2], uint256[2]));
        uint256[5] memory pub;
        for (uint256 i = 0; i < 5; i++) {
            pub[i] = publicInputs[i];
        }
        return groth16.verifyProof(a, b, c, pub);
    }
}
