// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title IShieldPool
 * @notice Application-layer privacy on Robinhood Chain (testnet first).
 * @dev Commitments / nullifiers / proofs — not a UI skin.
 *
 * Lifecycle:
 *  1. shield   — public asset in, commitment out (note enters set)
 *  2. transfer — nullify + reissue (private move)
 *  3. unshield — note out, public asset to recipient
 *  4. trade    — later adapter; not in v0 interface surface
 */
interface IShieldPool {
    event Shielded(
        bytes32 indexed commitment,
        address indexed asset,
        uint256 leafIndex
    );

    event Transferred(bytes32 indexed nullifier, bytes32[2] newCommitments);

    event Unshielded(
        bytes32 indexed nullifier,
        address indexed asset,
        address indexed to,
        uint256 amount
    );

    /// @notice Deposit public `asset` / ETH into a shielded commitment.
    /// @param asset ERC-20 address; address(0) = native ETH (if supported)
    /// @param amount amount of asset (ignored for msg.value path if native)
    /// @param commitment Poseidon/Pedersen-style note commitment (circuit-defined)
    function shield(
        address asset,
        uint256 amount,
        bytes32 commitment
    ) external payable;

    /// @notice Private transfer: spend one note, create new notes.
    /// @param proof zero-knowledge proof bytes (format TBD by verifier)
    /// @param root Merkle root of the note set used in the proof
    /// @param nullifier spent note nullifier
    /// @param newCommitments new note commitments (length circuit-defined; v0 uses 2)
    function transfer(
        bytes calldata proof,
        bytes32 root,
        bytes32 nullifier,
        bytes32[2] calldata newCommitments
    ) external;

    /// @notice Exit to public balance.
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
}
