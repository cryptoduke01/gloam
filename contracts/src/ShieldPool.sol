// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IShieldPool} from "./interfaces/IShieldPool.sol";
import {IVerifier} from "./interfaces/IVerifier.sol";

/**
 * @title ShieldPool
 * @notice Testnet scaffold of Gloam shielded balances.
 * @dev NOT production. Verifier is pluggable; until set, shield/transfer/unshield revert
 *      on proof paths. Commitments are stored in a simple append-only set for plumbing tests.
 *
 * Security: no audits. Do not use with real funds. Robinhood testnet only.
 */
contract ShieldPool is IShieldPool {
    IVerifier public verifier;

    /// @dev append-only commitment list (testnet plumbing; production uses Merkle tree)
    bytes32[] public commitments;

    mapping(bytes32 => bool) public spent;
    mapping(bytes32 => bool) public knownRoot;

    bytes32 public currentRoot;
    address public owner;

    error NotOwner();
    error ZeroCommitment();
    error AlreadySpent();
    error UnknownRoot();
    error VerifierNotSet();
    error InvalidProof();
    error ZeroAddress();
    error TransferFailed();

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    constructor(address verifier_) {
        owner = msg.sender;
        if (verifier_ != address(0)) {
            verifier = IVerifier(verifier_);
        }
        // empty tree root placeholder
        currentRoot = bytes32(0);
        knownRoot[currentRoot] = true;
    }

    function setVerifier(address verifier_) external onlyOwner {
        verifier = IVerifier(verifier_);
    }

    /// @inheritdoc IShieldPool
    function nextIndex() external view returns (uint256) {
        return commitments.length;
    }

    /// @inheritdoc IShieldPool
    function isSpent(bytes32 nullifier) external view returns (bool) {
        return spent[nullifier];
    }

    /**
     * @notice Testnet deposit: records commitment. Does NOT yet custody assets in a proven way.
     * @dev Phase 1: commitment registry for client integration tests.
     *      Phase 2: pull ERC-20 / ETH into pool + Merkle insert + real note encryption offchain.
     */
    function shield(
        address /* asset */,
        uint256 /* amount */,
        bytes32 commitment
    ) external payable override {
        if (commitment == bytes32(0)) revert ZeroCommitment();
        uint256 leafIndex = commitments.length;
        commitments.push(commitment);
        // naive root update for scaffolding (replace with incremental Merkle)
        currentRoot = keccak256(abi.encodePacked(currentRoot, commitment));
        knownRoot[currentRoot] = true;
        emit Shielded(commitment, address(0), leafIndex);
    }

    /// @inheritdoc IShieldPool
    function transfer(
        bytes calldata proof,
        bytes32 root,
        bytes32 nullifier,
        bytes32[2] calldata newCommitments
    ) external override {
        _requireProof(proof, root, nullifier);
        if (spent[nullifier]) revert AlreadySpent();
        spent[nullifier] = true;

        for (uint256 i = 0; i < 2; i++) {
            if (newCommitments[i] == bytes32(0)) revert ZeroCommitment();
            commitments.push(newCommitments[i]);
            currentRoot = keccak256(
                abi.encodePacked(currentRoot, newCommitments[i])
            );
            knownRoot[currentRoot] = true;
        }

        emit Transferred(nullifier, newCommitments);
    }

    /// @inheritdoc IShieldPool
    function unshield(
        bytes calldata proof,
        bytes32 root,
        bytes32 nullifier,
        address asset,
        address to,
        uint256 amount
    ) external override {
        if (to == address(0)) revert ZeroAddress();
        _requireProof(proof, root, nullifier);
        if (spent[nullifier]) revert AlreadySpent();
        spent[nullifier] = true;

        // Phase 2: release asset to `to`. Scaffold does not hold balances yet.
        emit Unshielded(nullifier, asset, to, amount);
    }

    function _requireProof(
        bytes calldata proof,
        bytes32 root,
        bytes32 nullifier
    ) internal view {
        if (address(verifier) == address(0)) revert VerifierNotSet();
        if (!knownRoot[root]) revert UnknownRoot();
        // public inputs layout TBD with circuit; placeholder single-field packing
        uint256[] memory inputs = new uint256[](2);
        inputs[0] = uint256(root);
        inputs[1] = uint256(nullifier);
        if (!verifier.verify(proof, inputs)) revert InvalidProof();
    }
}
