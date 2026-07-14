// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title IShieldPool
 * @notice Application-layer privacy on Robinhood Chain (testnet first).
 */
interface IShieldPool {
    event Shielded(
        bytes32 indexed commitment,
        address indexed asset,
        uint256 amount,
        uint256 leafIndex,
        address indexed from
    );

    event Transferred(bytes32 indexed nullifier, bytes32[2] newCommitments);

    event Unshielded(
        bytes32 indexed nullifier,
        address indexed asset,
        address indexed to,
        uint256 amount
    );

    /// @notice Deposit public asset into pool; insert note commitment.
    /// @param asset ERC-20; address(0) = native ETH (msg.value must equal amount)
    function shield(
        address asset,
        uint256 amount,
        bytes32 commitment
    ) external payable;

    function transfer(
        bytes calldata proof,
        bytes32 root,
        bytes32 nullifier,
        bytes32[2] calldata newCommitments
    ) external;

    function unshield(
        bytes calldata proof,
        bytes32 root,
        bytes32 nullifier,
        address asset,
        address to,
        uint256 amount
    ) external;

    function isSpent(bytes32 nullifier) external view returns (bool);

    function currentRoot() external view returns (bytes32);

    function nextIndex() external view returns (uint256);

    function isKnownRoot(bytes32 root) external view returns (bool);

    function deposited(address asset) external view returns (uint256);
}
