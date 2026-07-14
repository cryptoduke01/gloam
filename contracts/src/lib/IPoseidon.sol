// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IPoseidon2 {
    function poseidon(uint256[2] memory input) external pure returns (uint256);
}

interface IPoseidon3 {
    function poseidon(uint256[3] memory input) external pure returns (uint256);
}
