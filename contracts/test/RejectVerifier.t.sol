// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {ShieldPool} from "../src/ShieldPool.sol";
import {RejectVerifier} from "../src/verifiers/RejectVerifier.sol";

contract RejectVerifierTest is Test {
    function test_reject_blocks_unshield() public {
        RejectVerifier v = new RejectVerifier();
        ShieldPool pool = new ShieldPool(address(v));
        vm.deal(address(this), 1 ether);
        pool.shield{value: 1 ether}(address(0), 1 ether, keccak256("a"));
        bytes32 root = pool.currentRoot();

        vm.expectRevert(ShieldPool.InvalidProof.selector);
        pool.unshield(
            hex"00",
            root,
            keccak256("n"),
            address(0),
            address(0xB0B),
            1 ether
        );
    }

    function test_reject_returns_false() public {
        RejectVerifier v = new RejectVerifier();
        uint256[] memory inputs = new uint256[](5);
        assertFalse(v.verify(hex"", inputs));
    }
}
