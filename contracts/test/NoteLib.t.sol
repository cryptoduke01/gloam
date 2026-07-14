// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {NoteLib} from "../src/lib/NoteLib.sol";

contract NoteLibTest is Test {
    function test_commitment_binds_amount_and_asset() public pure {
        bytes32 secret = keccak256("secret");
        bytes32 c1 = NoteLib.commitment(secret, 1 ether, address(0));
        bytes32 c2 = NoteLib.commitment(secret, 2 ether, address(0));
        bytes32 c3 = NoteLib.commitment(secret, 1 ether, address(0xBEEF));
        assertTrue(c1 != c2);
        assertTrue(c1 != c3);
        assertTrue(c1 != bytes32(0));
    }

    function test_nullifier_deterministic() public pure {
        bytes32 secret = keccak256("secret");
        bytes32 c = NoteLib.commitment(secret, 1 ether, address(0));
        bytes32 n1 = NoteLib.nullifier(secret, c);
        bytes32 n2 = NoteLib.nullifier(secret, c);
        assertEq(n1, n2);
        assertTrue(n1 != c);
    }

    function test_different_secrets_different_nullifiers() public pure {
        bytes32 c = keccak256("same-leaf");
        assertTrue(
            NoteLib.nullifier(keccak256("a"), c) !=
                NoteLib.nullifier(keccak256("b"), c)
        );
    }
}
