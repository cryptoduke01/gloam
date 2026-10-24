/**
 * Self-test: once the launch time has passed, the server HTML already says
 * mainnet is live, and before it the server still renders the neutral
 * countdown (so the first client render matches it).
 *
 * Review, 24 Oct 2026: the countdown state was null until mounted, so every
 * page's HTML (what a crawler, a link preview or a slow phone sees first) kept
 * saying "Gloam goes live on mainnet" with -- digits days after launch.
 *
 * Run from app/:  ../mcp/node_modules/.bin/tsx scripts/selftest-mainnet-ssr.mts
 */
import assert from "node:assert/strict";
import { createElement as h } from "react";
import { renderToString } from "react-dom/server";
import {
  CountdownDigits,
  MainnetCopy,
  MainnetHeadline,
  MainnetTestnetLine,
  useMainnetLive,
} from "../src/components/MainnetCountdown";
import { MAINNET_CONFIGURED, MAINNET_LAUNCH_MS } from "../src/lib/mainnet";

let passed = 0;
function test(name: string, fn: () => void) {
  fn();
  passed++;
  console.log(`ok  ${name}`);
}

function Live() {
  return useMainnetLive() ? "live" : "not live";
}

/** Render as a server would at `when`. */
function at<T>(when: number, fn: () => T): T {
  const now = Date.now;
  Date.now = () => when;
  try {
    return fn();
  } finally {
    Date.now = now;
  }
}

const html = (el: Parameters<typeof renderToString>[0]) => renderToString(el).replace(/<!-- -->/g, "");

assert.ok(MAINNET_CONFIGURED, "the mainnet pools are filled in");
const after = MAINNET_LAUNCH_MS + 3 * 86_400_000;
const before = MAINNET_LAUNCH_MS - 3_600_000;

test("after launch, the server HTML says mainnet is live", () => {
  at(after, () => {
    assert.equal(html(h(Live)), "live");
    assert.match(html(h(MainnetHeadline)), /Gloam is live on mainnet/);
    assert.equal(html(h(MainnetCopy, { live: "Open the app", before: "Try the testnet" })), "Open the app");
    assert.equal(html(h(CountdownDigits, { onLive: "Live now", onDone: "Rolling out" })), "Live now");
    assert.match(html(h(MainnetTestnetLine)), /testnet stays open/);
  });
});

test("before launch, the server HTML is the neutral countdown, as it was", () => {
  at(before, () => {
    assert.equal(html(h(Live)), "not live");
    assert.match(html(h(MainnetHeadline)), /Gloam goes live on mainnet/);
    assert.equal(html(h(MainnetCopy, { live: "Open the app", before: "Try the testnet" })), "Try the testnet");
    const digits = html(h(CountdownDigits, { onLive: "Live now", onDone: "Rolling out" }));
    assert.match(digits, /Countdown to mainnet/);
    assert.equal((digits.match(/>--</g) ?? []).length, 4, "no clock-dependent digits on the server");
  });
});

console.log(`\n${passed} mainnet render checks passed`);
