// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title GloamPayMemo
 * @notice On-chain encrypted payment memos for direct private pay (Zcash-like discovery).
 * @dev Does NOT hold funds. After a vault `transfer`, the sender posts ciphertext so the
 *      recipient can scan logs and open notes with their receive tag — no QR required.
 *
 *      Solana-style UX: pay-to-identity once the memo is on-chain.
 *      Memo is opaque bytes (app uses gloam2t / ECDH packages).
 */
contract GloamPayMemo {
    event PaymentMemo(
        bytes32 indexed paymentCommitment,
        address indexed poster,
        bytes memo
    );

    error ZeroCommitment();
    error BadMemo();

    uint256 public constant MAX_MEMO = 8192;

    /**
     * @param paymentCommitment Payment leaf commitment from the vault transfer (newCommitment0).
     * @param memo Opaque ciphertext for the recipient.
     */
    function postMemo(bytes32 paymentCommitment, bytes calldata memo) external {
        if (paymentCommitment == bytes32(0)) revert ZeroCommitment();
        if (memo.length == 0 || memo.length > MAX_MEMO) revert BadMemo();
        emit PaymentMemo(paymentCommitment, msg.sender, memo);
    }
}
