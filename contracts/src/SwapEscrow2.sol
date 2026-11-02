// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20Balance} from "./SwapEscrow.sol";

/**
 * @notice One vault swap's drop-off point (GloamVaultSwap2). As SwapEscrow, and
 *         for a native ETH note too: the vault pays a swap's input here, and the
 *         router deploys it with CREATE2 in the same transaction or later. The
 *         constructor hands the whole balance to the router and leaves no code.
 * @dev Its own file, so the creation code (and every escrow address the app
 *      works out from it) does not change when GloamVaultSwap2.sol is edited.
 */
contract SwapEscrow2 {
    /// @param token The note's asset; address(0) for native ETH.
    constructor(address token) {
        if (token == address(0)) {
            uint256 amount = address(this).balance;
            if (amount != 0) {
                (bool ok, ) = msg.sender.call{value: amount}("");
                require(ok, "escrow transfer");
            }
        } else {
            uint256 amount = IERC20Balance(token).balanceOf(address(this));
            if (amount != 0) {
                (bool ok, bytes memory ret) = token.call(abi.encodeWithSelector(0xa9059cbb, msg.sender, amount));
                require(ok && (ret.length == 0 || abi.decode(ret, (bool))), "escrow transfer");
            }
        }
        assembly {
            return(0, 0)
        }
    }
}
