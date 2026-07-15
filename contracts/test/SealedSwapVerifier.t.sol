// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {SealedSwapVerifier} from "../src/verifiers/SealedSwapVerifier.sol";
import {SealedSwapIVerifier} from "../src/verifiers/SealedSwapIVerifier.sol";

/**
 * @dev Smoke: verifier deploys and rejects wrong input length / garbage proof.
 * Full e2e needs a real proof from snarkjs (dev keys).
 */
contract SealedSwapVerifierTest is Test {
    SealedSwapIVerifier internal adapter;

    function setUp() public {
        SealedSwapVerifier g = new SealedSwapVerifier();
        adapter = new SealedSwapIVerifier(g);
    }

    function test_rejects_wrong_input_count() public view {
        uint256[] memory bad = new uint256[](4);
        bytes memory proof = abi.encode(
            [uint256(1), uint256(2)],
            [[uint256(1), uint256(2)], [uint256(3), uint256(4)]],
            [uint256(5), uint256(6)]
        );
        assertFalse(adapter.verify(proof, bad));
    }

    function test_accepts_length_9_but_invalid_proof() public view {
        uint256[] memory pub = new uint256[](9);
        bytes memory proof = abi.encode(
            [uint256(1), uint256(2)],
            [[uint256(1), uint256(2)], [uint256(3), uint256(4)]],
            [uint256(5), uint256(6)]
        );
        // Garbage proof should not verify
        assertFalse(adapter.verify(proof, pub));
    }
}
