/**
 * Self-test: a payment request names its network as testnet or mainnet. A
 * chain's testnet and its mainnet share a label ("Robinhood Chain", "Tempo",
 * "Base", "Ethereum"), so a testnet request opened on that chain's mainnet
 * said "This request is for Robinhood Chain." with a "Switch to Robinhood
 * Chain" button, on Robinhood Chain mainnet. The banner and the link's
 * problems now say networkName() (final sweep, 26 Oct 2026).
 *
 * Run from app/:  ../mcp/node_modules/.bin/tsx scripts/selftest-request-network.mts
 */
import assert from "node:assert/strict";
import "./browser-shim.mjs";
import { createElement as h } from "react";
import { renderToString } from "react-dom/server";

const { PaymentRequestBanner } = await import("../src/components/app/PaymentRequest");
const { readPaymentRequest } = await import("../src/lib/paymentRequest");
const { NETWORK_KEYS, getNetwork, networkName } = await import("../src/lib/networks");
type NetworkKey = (typeof NETWORK_KEYS)[number];

let passed = 0;
function test(name: string, fn: () => void) {
  fn();
  passed++;
  console.log(`ok  ${name}`);
}

/** The banner's text for a request made on `requestNet`, opened while the payer is on `currentNet`. */
function bannerText(requestNet: NetworkKey, currentNet: NetworkKey): string {
  const request = readPaymentRequest(new URLSearchParams({ amount: "5", chain: requestNet }), currentNet);
  assert.ok(request, "the link reads as a request");
  assert.equal(request.network, requestNet);
  const html = renderToString(
    h(PaymentRequestBanner, {
      request,
      contactLabel: null,
      currentNetwork: currentNet,
      onSwitchNetwork: () => {},
      onDismiss: () => {},
      balanceHint: null,
    })
  );
  return html.replace(/<!-- -->/g, "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
}

// every pair of networks Gloam runs on that share a chain: a testnet and its mainnet
const pairs = NETWORK_KEYS.flatMap((a) =>
  NETWORK_KEYS.filter((b) => a !== b && getNetwork(a).family === getNetwork(b).family).map((b) => [a, b] as const)
);
assert.ok(
  pairs.some(([a, b]) => getNetwork(a).testnet && !getNetwork(b).testnet),
  "at least one chain has its testnet and its mainnet on"
);

test("a request opened on the same chain's other network names that network as testnet or mainnet", () => {
  for (const [req, cur] of pairs) {
    const want = networkName(getNetwork(req));
    const text = bannerText(req, cur);
    assert.ok(text.includes(`This request is for ${want}.`), `request on ${req}, payer on ${cur}: ${text}`);
    assert.ok(text.includes(`Switch to ${want}`), `request on ${req}, payer on ${cur}: ${text}`);
  }
});

test("a testnet request never reads as its chain's mainnet", () => {
  for (const [req, cur] of pairs.filter(([a]) => getNetwork(a).testnet)) {
    const text = bannerText(req, cur);
    assert.match(text, /This request is for [^.]*(testnet|Sepolia)\./, `request on ${req}, payer on ${cur}: ${text}`);
  }
});

test("a token the link's network does not list is named with that network, testnet or mainnet", () => {
  for (const key of NETWORK_KEYS) {
    const request = readPaymentRequest(new URLSearchParams({ amount: "5", chain: key, asset: "NOTATOKEN" }), key);
    assert.ok(request);
    assert.equal(request.asset, null);
    const line = request.problems.find((p) => p.startsWith("This link asks for a token"));
    assert.equal(line, `This link asks for a token Gloam does not support on ${networkName(getNetwork(key))}.`);
  }
});

console.log(`\nrequest network: ${passed} passed`);
