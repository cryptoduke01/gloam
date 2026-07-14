// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IShieldPool} from "./interfaces/IShieldPool.sol";
import {IVerifier} from "./interfaces/IVerifier.sol";
import {IncrementalMerkleTree as IMT} from "./lib/IncrementalMerkleTree.sol";

interface IERC20 {
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function transfer(address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

/**
 * @title ShieldPool
 * @notice Phase-1 shielded pool: real custody + Merkle commitments. ZK transfer/unshield need verifier.
 * @dev Testnet only. Not audited. Do not use with mainnet funds.
 *
 * Phase 1 (this file):
 *  - shield() pulls ETH/ERC-20 into the pool and inserts commitment into Merkle tree
 *  - tracks deposited[asset]
 *  - transfer/unshield require IVerifier (private path)
 *
 * Phase 2:
 *  - real circuit public inputs (asset, amount inside note)
 *  - Poseidon hash for circuit-friendly tree
 */
contract ShieldPool is IShieldPool {
    using IMT for IMT.Tree;

    IVerifier public verifier;
    IMT.Tree private tree;

    mapping(bytes32 => bool) public spent;
    mapping(address => uint256) public override deposited;

    address public owner;

    error NotOwner();
    error ZeroCommitment();
    error AlreadySpent();
    error UnknownRoot();
    error VerifierNotSet();
    error InvalidProof();
    error ZeroAddress();
    error TransferFailed();
    error InvalidAmount();
    error InvalidMsgValue();
    error InsufficientPoolBalance();

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    constructor(address verifier_) {
        owner = msg.sender;
        if (verifier_ != address(0)) {
            verifier = IVerifier(verifier_);
        }
        tree.initialize();
    }

    receive() external payable {}

    function setVerifier(address verifier_) external onlyOwner {
        verifier = IVerifier(verifier_);
    }

    function transferOwnership(address newOwner) external onlyOwner {
        if (newOwner == address(0)) revert ZeroAddress();
        owner = newOwner;
    }

    /// @inheritdoc IShieldPool
    function nextIndex() external view returns (uint256) {
        return tree.nextIndex;
    }

    /// @inheritdoc IShieldPool
    function currentRoot() external view returns (bytes32) {
        return tree.currentRoot;
    }

    /// @inheritdoc IShieldPool
    function isKnownRoot(bytes32 root) external view returns (bool) {
        return tree.isKnownRoot(root);
    }

    /// @inheritdoc IShieldPool
    function isSpent(bytes32 nullifier) external view returns (bool) {
        return spent[nullifier];
    }

    /**
     * @notice Deposit public funds + register note commitment.
     * @dev Note encryption / amount binding to commitment is offchain + circuit concern.
     *      Phase-1 binds custody of `amount` of `asset` to the pool.
     */
    function shield(
        address asset,
        uint256 amount,
        bytes32 commitment
    ) external payable override {
        if (commitment == bytes32(0)) revert ZeroCommitment();
        if (amount == 0) revert InvalidAmount();

        if (asset == address(0)) {
            if (msg.value != amount) revert InvalidMsgValue();
        } else {
            if (msg.value != 0) revert InvalidMsgValue();
            bool ok = IERC20(asset).transferFrom(msg.sender, address(this), amount);
            if (!ok) revert TransferFailed();
        }

        deposited[asset] += amount;
        uint256 leafIndex = tree.insert(commitment);

        emit Shielded(commitment, asset, amount, leafIndex, msg.sender);
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
            tree.insert(newCommitments[i]);
        }

        emit Transferred(nullifier, newCommitments);
    }

    /**
     * @notice Exit to public balance after valid unshield proof.
     * @dev Circuit must enforce amount/asset match the spent note (Phase 2 public inputs).
     */
    function unshield(
        bytes calldata proof,
        bytes32 root,
        bytes32 nullifier,
        address asset,
        address to,
        uint256 amount
    ) external override {
        if (to == address(0)) revert ZeroAddress();
        if (amount == 0) revert InvalidAmount();
        _requireProof(proof, root, nullifier);
        if (spent[nullifier]) revert AlreadySpent();
        spent[nullifier] = true;

        if (deposited[asset] < amount) revert InsufficientPoolBalance();
        deposited[asset] -= amount;

        if (asset == address(0)) {
            (bool ok, ) = to.call{value: amount}("");
            if (!ok) revert TransferFailed();
        } else {
            bool ok = IERC20(asset).transfer(to, amount);
            if (!ok) revert TransferFailed();
        }

        emit Unshielded(nullifier, asset, to, amount);
    }

    function _requireProof(
        bytes calldata proof,
        bytes32 root,
        bytes32 nullifier
    ) internal view {
        if (address(verifier) == address(0)) revert VerifierNotSet();
        if (!tree.isKnownRoot(root)) revert UnknownRoot();
        uint256[] memory inputs = new uint256[](2);
        inputs[0] = uint256(root);
        inputs[1] = uint256(nullifier);
        if (!verifier.verify(proof, inputs)) revert InvalidProof();
    }
}
