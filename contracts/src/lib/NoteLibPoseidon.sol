// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IPoseidon2, IPoseidon3} from "./IPoseidon.sol";

/**
 * @title NoteLibPoseidon
 * @notice Circuit-compatible notes (matches unshield.circom + app poseidon notes).
 *
 *   commitment = Poseidon3(secret, amount, asset)
 *   nullifier  = Poseidon2(secret, commitment)
 *
 * Requires deployed Poseidon hasher contracts (circomlibjs bytecode).
 */
library NoteLibPoseidon {
    function commitment(
        IPoseidon3 poseidon3,
        uint256 secret,
        uint256 amount,
        uint256 asset
    ) internal view returns (uint256) {
        uint256[3] memory inputs;
        inputs[0] = secret;
        inputs[1] = amount;
        inputs[2] = asset;
        return poseidon3.poseidon(inputs);
    }

    function nullifier(
        IPoseidon2 poseidon2,
        uint256 secret,
        uint256 commitment_
    ) internal view returns (uint256) {
        uint256[2] memory inputs;
        inputs[0] = secret;
        inputs[1] = commitment_;
        return poseidon2.poseidon(inputs);
    }
}
