// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IShieldPool} from "./interfaces/IShieldPool.sol";
import {IVerifier} from "./interfaces/IVerifier.sol";
import {IPoseidon2} from "./lib/IPoseidon.sol";
import {IncrementalMerkleTreePoseidon as IMT} from "./lib/IncrementalMerkleTreePoseidon.sol";

interface IERC20 {
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function transfer(address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

/**
 * @title ShieldPoolPoseidon
 * @notice Phase-2 pool: Poseidon Merkle tree + unshield public inputs layout v2.
 * @dev Pairs with UnshieldVerifier (Poseidon circuit). Not the live keccak pool.
 *
 * Leaves/roots stored as uint256 field elements, exposed as bytes32 for IShieldPool.
 */
contract ShieldPoolPoseidon is IShieldPool {
    using IMT for IMT.Tree;

    IVerifier public verifier;
    /// @notice Optional sealed-swap verifier (9 public inputs). Separate from dual unshield/transfer.
    IVerifier public sealedSwapVerifier;
    IPoseidon2 public immutable poseidon2;
    IMT.Tree private tree;

    mapping(bytes32 => bool) public spent;
    mapping(address => uint256) public override deposited;

    address public owner;

    uint256 public constant PROOF_LAYOUT_VERSION = 2;
    string public constant HASH_SCHEME = "poseidon";

    event SealedSwapped(
        bytes32 indexed nullifier,
        address indexed assetIn,
        address indexed assetOut,
        bytes32 newCommitmentOut,
        bytes32 newCommitmentChange
    );

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
    error FeeOnTransferNotSupported();
    error SameAsset();

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    /**
     * @param poseidon2_ Circomlib Poseidon (2 inputs)
     * @param verifier_ UnshieldIVerifier or address(0) until set
     */
    constructor(address poseidon2_, address verifier_) {
        if (poseidon2_ == address(0)) revert ZeroAddress();
        owner = msg.sender;
        poseidon2 = IPoseidon2(poseidon2_);
        if (verifier_ != address(0)) {
            verifier = IVerifier(verifier_);
        }
        tree.initialize(IPoseidon2(poseidon2_));
    }

    receive() external payable {}

    function setVerifier(address verifier_) external onlyOwner {
        verifier = IVerifier(verifier_);
    }

    function setSealedSwapVerifier(address verifier_) external onlyOwner {
        sealedSwapVerifier = IVerifier(verifier_);
    }

    function transferOwnership(address newOwner) external onlyOwner {
        if (newOwner == address(0)) revert ZeroAddress();
        owner = newOwner;
    }

    function emergencyWithdraw(
        address asset,
        address to,
        uint256 amount
    ) external onlyOwner {
        if (to == address(0)) revert ZeroAddress();
        if (amount == 0) revert InvalidAmount();
        if (deposited[asset] < amount) revert InsufficientPoolBalance();
        deposited[asset] -= amount;
        _pushAsset(asset, to, amount);
    }

    function nextIndex() external view returns (uint256) {
        return tree.nextIndex;
    }

    function currentRoot() external view returns (bytes32) {
        return bytes32(tree.currentRoot);
    }

    function isKnownRoot(bytes32 root) external view returns (bool) {
        return tree.isKnownRoot(uint256(root));
    }

    function isSpent(bytes32 nullifier) external view returns (bool) {
        return spent[nullifier];
    }

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
            uint256 before = IERC20(asset).balanceOf(address(this));
            _pullERC20(msg.sender, amount, asset);
            uint256 received = IERC20(asset).balanceOf(address(this)) - before;
            if (received != amount) revert FeeOnTransferNotSupported();
        }

        deposited[asset] += amount;
        uint256 leafIndex = tree.insert(uint256(commitment));

        emit Shielded(commitment, asset, amount, leafIndex, msg.sender);
    }

    function transfer(
        bytes calldata proof,
        bytes32 root,
        bytes32 nullifier,
        bytes32[2] calldata newCommitments
    ) external override {
        _requireTransferProof(proof, root, nullifier, newCommitments);
        if (spent[nullifier]) revert AlreadySpent();
        spent[nullifier] = true;

        for (uint256 i = 0; i < 2; i++) {
            if (newCommitments[i] == bytes32(0)) revert ZeroCommitment();
            tree.insert(uint256(newCommitments[i]));
        }

        emit Transferred(nullifier, newCommitments);
    }

    /**
     * @notice Private-size swap: spend assetIn note → assetOut note + assetIn change.
     * @dev Public inputs (9): root, nullifier, newCOut, newCChange, assetIn, assetOut,
     *      amountOutMin, rateIn, rateOut. Actual size is private in the circuit.
     *      Pool must already hold assetOut for later unshields (inventory / LP seed).
     *      Live RH pool may not have this method until redeploy — check code version.
     */
    function sealedSwap(
        bytes calldata proof,
        bytes32 root,
        bytes32 nullifier,
        bytes32 newCommitmentOut,
        bytes32 newCommitmentChange,
        address assetIn,
        address assetOut,
        uint256 amountOutMin,
        uint256 rateIn,
        uint256 rateOut
    ) external {
        if (assetIn == assetOut) revert SameAsset();
        if (rateIn == 0 || rateOut == 0) revert InvalidAmount();
        _requireSealedSwapProof(
            proof,
            root,
            nullifier,
            newCommitmentOut,
            newCommitmentChange,
            assetIn,
            assetOut,
            amountOutMin,
            rateIn,
            rateOut
        );
        if (spent[nullifier]) revert AlreadySpent();
        spent[nullifier] = true;

        if (newCommitmentOut == bytes32(0) || newCommitmentChange == bytes32(0)) {
            revert ZeroCommitment();
        }
        tree.insert(uint256(newCommitmentOut));
        tree.insert(uint256(newCommitmentChange));

        emit SealedSwapped(
            nullifier,
            assetIn,
            assetOut,
            newCommitmentOut,
            newCommitmentChange
        );
    }

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
        _requireUnshieldProof(proof, root, nullifier, asset, to, amount);
        if (spent[nullifier]) revert AlreadySpent();
        spent[nullifier] = true;

        if (deposited[asset] < amount) revert InsufficientPoolBalance();
        deposited[asset] -= amount;
        _pushAsset(asset, to, amount);

        emit Unshielded(nullifier, asset, to, amount);
    }

    function _requireTransferProof(
        bytes calldata proof,
        bytes32 root,
        bytes32 nullifier,
        bytes32[2] calldata newCommitments
    ) internal view {
        if (address(verifier) == address(0)) revert VerifierNotSet();
        if (!tree.isKnownRoot(uint256(root))) revert UnknownRoot();
        uint256[] memory inputs = new uint256[](4);
        inputs[0] = uint256(root);
        inputs[1] = uint256(nullifier);
        inputs[2] = uint256(newCommitments[0]);
        inputs[3] = uint256(newCommitments[1]);
        if (!verifier.verify(proof, inputs)) revert InvalidProof();
    }

    function _requireUnshieldProof(
        bytes calldata proof,
        bytes32 root,
        bytes32 nullifier,
        address asset,
        address to,
        uint256 amount
    ) internal view {
        if (address(verifier) == address(0)) revert VerifierNotSet();
        if (!tree.isKnownRoot(uint256(root))) revert UnknownRoot();
        uint256[] memory inputs = new uint256[](5);
        inputs[0] = uint256(root);
        inputs[1] = uint256(nullifier);
        inputs[2] = uint256(uint160(asset));
        inputs[3] = amount;
        inputs[4] = uint256(uint160(to));
        if (!verifier.verify(proof, inputs)) revert InvalidProof();
    }

    function _requireSealedSwapProof(
        bytes calldata proof,
        bytes32 root,
        bytes32 nullifier,
        bytes32 newCommitmentOut,
        bytes32 newCommitmentChange,
        address assetIn,
        address assetOut,
        uint256 amountOutMin,
        uint256 rateIn,
        uint256 rateOut
    ) internal view {
        if (address(sealedSwapVerifier) == address(0)) revert VerifierNotSet();
        if (!tree.isKnownRoot(uint256(root))) revert UnknownRoot();
        uint256[] memory inputs = new uint256[](9);
        inputs[0] = uint256(root);
        inputs[1] = uint256(nullifier);
        inputs[2] = uint256(newCommitmentOut);
        inputs[3] = uint256(newCommitmentChange);
        inputs[4] = uint256(uint160(assetIn));
        inputs[5] = uint256(uint160(assetOut));
        inputs[6] = amountOutMin;
        inputs[7] = rateIn;
        inputs[8] = rateOut;
        if (!sealedSwapVerifier.verify(proof, inputs)) revert InvalidProof();
    }

    function _pullERC20(address from, uint256 amount, address asset) internal {
        (bool success, bytes memory data) = asset.call(
            abi.encodeWithSelector(
                IERC20.transferFrom.selector,
                from,
                address(this),
                amount
            )
        );
        if (!success || (data.length != 0 && !abi.decode(data, (bool)))) {
            revert TransferFailed();
        }
    }

    function _pushAsset(address asset, address to, uint256 amount) internal {
        if (asset == address(0)) {
            (bool ok, ) = to.call{value: amount}("");
            if (!ok) revert TransferFailed();
        } else {
            (bool success, bytes memory data) = asset.call(
                abi.encodeWithSelector(IERC20.transfer.selector, to, amount)
            );
            if (!success || (data.length != 0 && !abi.decode(data, (bool)))) {
                revert TransferFailed();
            }
        }
    }
}
