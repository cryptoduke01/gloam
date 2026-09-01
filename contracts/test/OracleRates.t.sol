// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {OracleRates} from "../src/lib/OracleRates.sol";
import {IAggregatorV3} from "../src/interfaces/IAggregatorV3.sol";

contract MockFeed is IAggregatorV3 {
    uint8 public decimals;
    int256 public answer;
    uint256 public updatedAt;

    constructor(uint8 d, int256 a, uint256 u) {
        decimals = d;
        answer = a;
        updatedAt = u;
    }

    function set(int256 a, uint256 u) external {
        answer = a;
        updatedAt = u;
    }

    function latestRoundData()
        external
        view
        returns (uint80, int256, uint256, uint256, uint80)
    {
        return (1, answer, updatedAt, updatedAt, 1);
    }
}

/// Harness so the tests can call the internal library.
contract OracleHarness {
    OracleRates.Config public cfg;

    constructor(OracleRates.Config memory c) {
        cfg = c;
    }

    function requireRatio(
        IAggregatorV3 fin,
        IAggregatorV3 fout,
        uint256 ri,
        uint256 ro
    ) external view {
        OracleRates.requireRatio(cfg, fin, fout, ri, ro);
    }

    function readPrice(IAggregatorV3 f) external view returns (uint256) {
        return OracleRates.readPrice(cfg, f);
    }
}

contract OracleRatesTest is Test {
    uint256 constant NOW = 1_900_000_000;
    MockFeed sequencer; // answer 0 == up
    MockFeed tsla; // $250
    MockFeed amzn; // $190
    OracleHarness h;

    function setUp() public {
        vm.warp(NOW);
        // sequencer up, came up well before the grace window
        sequencer = new MockFeed(0, 0, NOW - 10_000);
        tsla = new MockFeed(8, 250e8, NOW);
        amzn = new MockFeed(8, 190e8, NOW);
        OracleRates.Config memory cfg = OracleRates.Config({
            sequencer: IAggregatorV3(address(sequencer)),
            sequencerGrace: 3600,
            maxStaleness: 86_400,
            toleranceBps: 100 // 1%
        });
        h = new OracleHarness(cfg);
    }

    function test_ratio_ok_exact() public view {
        h.requireRatio(tsla, amzn, 250e8, 190e8);
    }

    function test_ratio_ok_scaled_same_ratio() public view {
        // Absolute rates are free; only the ratio matters (2x here).
        h.requireRatio(tsla, amzn, 500e8, 380e8);
    }

    function test_ratio_ok_within_tolerance() public view {
        // ~0.5% off, inside the 1% band
        h.requireRatio(tsla, amzn, 250e8, 191e8);
    }

    function test_ratio_reverts_out_of_band() public {
        vm.expectRevert(OracleRates.RateOutOfBand.selector);
        h.requireRatio(tsla, amzn, 250e8, 100e8);
    }

    function test_reverts_on_stale_price() public {
        tsla.set(250e8, NOW - 90_000); // older than maxStaleness
        vm.expectRevert(OracleRates.StalePrice.selector);
        h.requireRatio(tsla, amzn, 250e8, 190e8);
    }

    function test_reverts_on_bad_price() public {
        tsla.set(0, NOW);
        vm.expectRevert(OracleRates.BadPrice.selector);
        h.requireRatio(tsla, amzn, 250e8, 190e8);
    }

    function test_reverts_when_sequencer_down() public {
        sequencer.set(1, NOW - 10_000); // 1 == down
        vm.expectRevert(OracleRates.SequencerDown.selector);
        h.requireRatio(tsla, amzn, 250e8, 190e8);
    }

    function test_reverts_within_sequencer_grace() public {
        sequencer.set(0, NOW - 100); // just came up, inside 3600s grace
        vm.expectRevert(OracleRates.SequencerGracePeriod.selector);
        h.requireRatio(tsla, amzn, 250e8, 190e8);
    }

    function test_reverts_on_unset_feed() public {
        vm.expectRevert(OracleRates.FeedNotSet.selector);
        h.readPrice(IAggregatorV3(address(0)));
    }
}
