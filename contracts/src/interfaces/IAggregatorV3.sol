// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title IAggregatorV3
 * @notice Minimal Chainlink Data Feed interface. Robinhood Chain exposes standard
 *         AggregatorV3 feeds for its tokenized equities (Total-Return value, most
 *         USD feeds at 8 decimals). Also used for the L2 Sequencer Uptime Feed,
 *         where answer == 0 means the sequencer is up.
 * @dev Source of truth for addresses: docs.chain.link/data-feeds/price-feeds/addresses?network=robinhood
 */
interface IAggregatorV3 {
    function decimals() external view returns (uint8);

    function latestRoundData()
        external
        view
        returns (
            uint80 roundId,
            int256 answer,
            uint256 startedAt,
            uint256 updatedAt,
            uint80 answeredInRound
        );
}
