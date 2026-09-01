// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IAggregatorV3} from "../interfaces/IAggregatorV3.sol";

/**
 * @title OracleRates
 * @notice Chainlink-bound swap-rate validation for the sealed swap (M3). Reads two
 *         Robinhood Chain price feeds with L2 sequencer-uptime + staleness +
 *         positivity guards, then checks the caller's public (rateIn, rateOut)
 *         RATIO against the live oracle ratio within a bps tolerance. Absolute
 *         rates are free; only the ratio conserves value, and the tolerance
 *         absorbs oracle drift between the client's read and the tx mining.
 * @dev Binds the PRICE only. It does NOT fix sealed-swap solvency accounting
 *      (audit H1): deposited[] is still not updated per asset. A pool that turns
 *      on oracle rates must ALSO implement H1 before holding real assetOut
 *      inventory. This is why swaps ship disabled until both land.
 */
library OracleRates {
    error SequencerDown();
    error SequencerGracePeriod();
    error RoundInvalid();
    error BadPrice();
    error StalePrice();
    error RateOutOfBand();
    error FeedNotSet();

    struct Config {
        IAggregatorV3 sequencer; // L2 sequencer uptime feed (address(0) = skip)
        uint64 sequencerGrace; // seconds to wait after a sequencer restart
        uint64 maxStaleness; // max age of a price round, in seconds
        uint64 toleranceBps; // allowed |ratio - oracleRatio|, in basis points
    }

    /// @notice Read a feed price with all safety guards. Returns the raw price at
    ///         the feed's own decimals (RH USD feeds are 8-decimal).
    function readPrice(
        Config memory cfg,
        IAggregatorV3 feed
    ) internal view returns (uint256) {
        if (address(feed) == address(0)) revert FeedNotSet();

        // Arbitrum L2 sequencer uptime: answer == 0 means up. Reject if down, or
        // if we are still inside the grace window after a restart (stale prices).
        if (address(cfg.sequencer) != address(0)) {
            (, int256 up, uint256 startedAt, , ) = cfg
                .sequencer
                .latestRoundData();
            if (up != 0) revert SequencerDown();
            if (startedAt == 0) revert RoundInvalid();
            if (block.timestamp - startedAt <= cfg.sequencerGrace) {
                revert SequencerGracePeriod();
            }
        }

        (, int256 answer, , uint256 updatedAt, ) = feed.latestRoundData();
        if (answer <= 0) revert BadPrice();
        if (updatedAt == 0) revert RoundInvalid();
        if (block.timestamp - updatedAt > cfg.maxStaleness) revert StalePrice();
        return uint256(answer);
    }

    /// @notice Require the caller's (rateIn, rateOut) ratio to match
    ///         priceIn/priceOut within cfg.toleranceBps. Reverts otherwise.
    function requireRatio(
        Config memory cfg,
        IAggregatorV3 feedIn,
        IAggregatorV3 feedOut,
        uint256 rateIn,
        uint256 rateOut
    ) internal view {
        uint256 priceIn = readPrice(cfg, feedIn);
        uint256 priceOut = readPrice(cfg, feedOut);
        // Fair: rateIn/rateOut == priceIn/priceOut  <=>  rateIn*priceOut == rateOut*priceIn.
        // rateIn/rateOut are bounded to uint128 by the caller and prices are
        // Chainlink-bounded, so these products fit well within uint256.
        uint256 lhs = rateIn * priceOut;
        uint256 rhs = rateOut * priceIn;
        uint256 diff = lhs > rhs ? lhs - rhs : rhs - lhs;
        if (diff * 10_000 > uint256(cfg.toleranceBps) * rhs) {
            revert RateOutOfBand();
        }
    }
}
