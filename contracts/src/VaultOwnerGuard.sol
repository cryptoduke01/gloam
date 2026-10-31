// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice The part of a Gloam vault (ShieldPoolCore) this contract calls. The
///         vault's other owner functions are left out on purpose: what is not
///         here cannot be called from here.
interface IGuardedVault {
    function owner() external view returns (address);

    function setupMode() external view returns (bool);

    function acceptOwnership() external;

    function queueChange(bytes calldata call) external returns (bytes32 id, uint256 eta);

    function executeChange(bytes calldata call) external;

    function cancelChange(bytes calldata call) external;

    function lowerDepositLimit(address asset, uint128 perDeposit, uint128 total) external;

    function lowerWithdrawFee(uint16 bps) external;

    function sweepStrayNative(address to) external;
}

/**
 * @title VaultOwnerGuard
 * @notice Becomes the owner of a live Gloam vault and forwards only what running
 *         it needs, so the vault's proof checkers can never be replaced and its
 *         ownership can never move again. The vault itself is not redeployed.
 *
 * What goes through, for the controller only:
 *  - queueChange, executeChange and cancelChange, for setDepositLimit and
 *    setWithdrawFee only, in their one canonical encoding (isAllowedChange).
 *  - lowerDepositLimit, lowerWithdrawFee and sweepStrayNative.
 *  - acceptOwnership of the vault, which works once.
 *
 * What never goes through, because no code here can send it: setVerifier and
 * setShieldVerifier, by the timelock or directly; transferOwnership; endSetup;
 * and every other selector. Every vault call below is a typed call to the
 * immutable `vault`, and the only caller-chosen bytes sent on are a `call` that
 * passed the filter. There is no call to a caller-chosen target, no
 * delegatecall, no upgrade path and no self-destruct.
 *
 * Why the filter holds. The vault's timelock runs a change by reading the first
 * four bytes of `call` and dispatching on them (ChangeTimelock.executeChange,
 * then _applyChange). isAllowedChange reads those same four bytes of the same
 * bytes that are forwarded, and demands the exact length of the setter it
 * names. Nothing else in `call` is interpreted by either contract as a
 * selector, so a call that passes here can only run the setter it passes as.
 *
 * Why it is one-way. Only the vault's owner can name a pending owner
 * (transferOwnership), and this contract cannot call that. acceptOwnership
 * clears pendingOwner, so once this contract owns the vault nobody can be
 * offered it, this contract and its controller included.
 *
 * Changes already queued. The vault keeps a queued change by its keccak256, not
 * by who queued it, so a queue entry survives an ownership move. This matters in
 * both directions: an allowed change queued by the previous owner still runs
 * here, and a setVerifier queued by the previous owner stays in the vault's
 * queue but can never run, since executeChange here refuses it and nobody else
 * is the owner. It cannot be cancelled here either; it just expires.
 *
 * What the controller can still do, on purpose. With no notice: close deposits
 * (lowerDepositLimit), lower the fee, sweep native coin that backs no note. With
 * the vault's 3-day public notice: raise limits, list an asset, raise the fee up
 * to the vault's 1% cap, and name a new fee recipient, who then collects any
 * fees still owed (anyone can call collectFees during the notice to pay out what
 * is owed to the old one). None of these can take what backs a note or stop a
 * cash out, though a raised fee takes its share of each later one, and closed
 * deposits hold up a swap's refund note until the limit is raised again.
 *
 * The cost. A proof checker with a bug can never be patched in place. The only
 * response is to close deposits here and move users to a new vault. Users exit
 * the old vault through unshield as usual, which nothing here can block; a
 * checker that stopped accepting valid proofs could not be fixed at all. See the
 * owner guard section of DEPLOY.md.
 *
 * Controller. Two-step, so it can move to a multisig. If its key is lost the
 * vault keeps running on the limits and fee it has, and withdrawals are not
 * touched.
 */
contract VaultOwnerGuard {
    /// @notice setDepositLimit(address,uint128,uint128): selector and three words.
    bytes4 public constant SET_DEPOSIT_LIMIT = bytes4(keccak256("setDepositLimit(address,uint128,uint128)"));
    /// @notice setWithdrawFee(uint16,address): selector and two words.
    bytes4 public constant SET_WITHDRAW_FEE = bytes4(keccak256("setWithdrawFee(uint16,address)"));

    uint256 private constant SET_DEPOSIT_LIMIT_LENGTH = 4 + 3 * 32;
    uint256 private constant SET_WITHDRAW_FEE_LENGTH = 4 + 2 * 32;

    /// @notice The one vault this contract can call. Fixed at deploy.
    IGuardedVault public immutable vault;

    /// @notice Who may use this contract.
    address public controller;
    /// @notice Set by transferController, claimed by the incoming controller.
    address public pendingController;

    event VaultOwnershipAccepted(address indexed previousOwner);
    event ControllerTransferStarted(address indexed previousController, address indexed newController);
    event ControllerTransferred(address indexed previousController, address indexed newController);

    error ZeroAddress();
    error NotAContract();
    error NotController();
    error NotPendingController();
    error ChangeNotAllowed();
    error AlreadyVaultOwner();
    error VaultInSetup();

    modifier onlyController() {
        if (msg.sender != controller) revert NotController();
        _;
    }

    modifier onlyAllowedChange(bytes calldata call) {
        if (!isAllowedChange(call)) revert ChangeNotAllowed();
        _;
    }

    /**
     * @param vault_ The vault to guard
     * @param controller_ The first controller. Not msg.sender: a deploy through a
     *        CREATE2 factory has the factory as msg.sender.
     */
    constructor(address vault_, address controller_) {
        if (vault_ == address(0) || controller_ == address(0)) revert ZeroAddress();
        if (vault_.code.length == 0) revert NotAContract();
        vault = IGuardedVault(vault_);
        controller = controller_;
        emit ControllerTransferred(address(0), controller_);
    }

    /**
     * @notice Whether `call` may be queued, executed or cancelled through here.
     * @dev Exact length first, so a call shorter than a selector, a longer one
     *      with data trailing an allowed selector, and a selector that needs a
     *      different length are all refused by the same line.
     */
    function isAllowedChange(bytes calldata call) public pure returns (bool) {
        if (call.length == SET_DEPOSIT_LIMIT_LENGTH) return bytes4(call[:4]) == SET_DEPOSIT_LIMIT;
        if (call.length == SET_WITHDRAW_FEE_LENGTH) return bytes4(call[:4]) == SET_WITHDRAW_FEE;
        return false;
    }

    // ───────────────────────────────────────────────────────────── taking over

    /**
     * @notice Take ownership of the vault, after its owner offered it with
     *         transferOwnership(address(this)). Works once: from here on only
     *         the owner can make a new offer, and that is this contract.
     * @dev Refuses a vault still in setup: its rules could be set directly, and
     *      only its owner could end setup, neither of which is forwarded here.
     */
    function acceptVaultOwnership() external onlyController {
        address previous = vault.owner();
        if (previous == address(this)) revert AlreadyVaultOwner();
        if (vault.setupMode()) revert VaultInSetup();
        vault.acceptOwnership();
        emit VaultOwnershipAccepted(previous);
    }

    // ───────────────────────────────────────────────────────────── the timelock

    /// @notice Announce a deposit limit or fee change. Same rules as the vault's.
    function queueChange(bytes calldata call)
        external
        onlyController
        onlyAllowedChange(call)
        returns (bytes32 id, uint256 eta)
    {
        return vault.queueChange(call);
    }

    /// @notice Run a matured deposit limit or fee change.
    function executeChange(bytes calldata call) external onlyController onlyAllowedChange(call) {
        vault.executeChange(call);
    }

    /// @notice Drop a queued deposit limit or fee change.
    function cancelChange(bytes calldata call) external onlyController onlyAllowedChange(call) {
        vault.cancelChange(call);
    }

    // ───────────────────────────────────────────────────────────── no notice

    /// @notice Lower an asset's deposit limits at once, e.g. to (0, 0) in an incident.
    function lowerDepositLimit(address asset, uint128 perDeposit, uint128 total) external onlyController {
        vault.lowerDepositLimit(asset, perDeposit, total);
    }

    /// @notice Lower the cash-out fee at once, down to 0.
    function lowerWithdrawFee(uint16 bps) external onlyController {
        vault.lowerWithdrawFee(bps);
    }

    /// @notice Send native coin that backs no note and no owed fee to `to`.
    function sweepStrayNative(address to) external onlyController {
        vault.sweepStrayNative(to);
    }

    // ───────────────────────────────────────────────────────────── controller

    /**
     * @notice Start handing this contract to `newController`, who must accept.
     * @dev To drop a pending handover, name the current controller and accept.
     */
    function transferController(address newController) external onlyController {
        if (newController == address(0)) revert ZeroAddress();
        pendingController = newController;
        emit ControllerTransferStarted(controller, newController);
    }

    /// @notice Claim this contract after transferController named you.
    function acceptController() external {
        if (msg.sender != pendingController) revert NotPendingController();
        address previous = controller;
        controller = msg.sender;
        pendingController = address(0);
        emit ControllerTransferred(previous, msg.sender);
    }
}
