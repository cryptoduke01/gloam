// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {GloamVaultSwap2} from "./GloamVaultSwap2.sol";
import {IStablecoinDex} from "./GloamVaultSwapTempo.sol";

/**
 * @title GloamVaultSwapTempo2
 * @notice Vault swaps between stablecoins on Tempo, through the Stablecoin DEX
 *         fixed at deploy, with GloamVaultSwap2's exit. Tempo blocks native
 *         value and the vault holds no native coin there, so neither end of a
 *         swap can be address(0). As in GloamVaultSwapTempo, the DEX routes the
 *         pair itself, so there is no route to pass and none a caller could
 *         change. It pulls the input from this contract (TIP-20 implicit
 *         approval for the DEX; the approval set here covers any token without
 *         it and is cleared after) and sends the output straight back here.
 */
contract GloamVaultSwapTempo2 is GloamVaultSwap2 {
    IStablecoinDex public immutable dex;

    error BadRoute();
    error NativeNotSupported();

    constructor(address vault_, address treasury_, address dex_) GloamVaultSwap2(vault_, treasury_) {
        if (dex_ == address(0)) revert ZeroAddress();
        dex = IStablecoinDex(dex_);
    }

    function _swapExactOut(
        address assetIn,
        address assetOut,
        uint256 amountOut,
        uint256 maxIn,
        bytes calldata route
    ) internal override returns (uint256 amountIn) {
        if (route.length != 0) revert BadRoute();
        if (assetIn == NATIVE || assetOut == NATIVE) revert NativeNotSupported();
        if (amountOut > type(uint128).max) revert InvalidAmount();
        uint128 cap = maxIn > type(uint128).max ? type(uint128).max : uint128(maxIn);
        _approve(assetIn, address(dex), cap);
        amountIn = dex.swapExactAmountOut(assetIn, assetOut, uint128(amountOut), cap);
        _approve(assetIn, address(dex), 0);
    }
}
