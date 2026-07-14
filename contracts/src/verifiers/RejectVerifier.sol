// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IVerifier} from "../interfaces/IVerifier.sol";

/**
 * @title RejectVerifier
 * @notice Always returns false. Safe placeholder for wiring tests — cannot drain a pool.
 * @dev Do NOT replace with AlwaysTrue. Deploy only as a temporary plug before real keys.
 */
contract RejectVerifier is IVerifier {
    function verify(
        bytes calldata,
        uint256[] calldata
    ) external pure returns (bool) {
        return false;
    }
}
