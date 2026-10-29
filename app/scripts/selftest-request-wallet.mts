/**
 * Self-test: payment request links that pay a wallet (lib/paymentRequest).
 *
 * A request's `to` can be a Gloam address (a private payment, as before), a
 * 0x address or an ENS name. A wallet is paid through Cash out, the same path
 * as typing it into Pay; the link fills in the wallet, amount, token and
 * network, and the payer still presses the button. Every field is checked:
 * a mistyped checksum, the zero address or text that is no address at all is
 * left out with a reason, never guessed at.
 *
 * Run from app/:  ../mcp/node_modules/.bin/tsx scripts/selftest-request-wallet.mts
 */
import assert from "node:assert/strict";
import "./browser-shim.mjs";
import { createElement as h } from "react";
import { renderToString } from "react-dom/server";

const { readPaymentRequest, requestParamsFrom, isWalletRequest } = await import("../src/lib/paymentRequest");
const { PaymentRequestBanner } = await import("../src/components/app/PaymentRequest");
const { generateReceiveKey } = await import("../../packages/sdk/src/index");
const { NETWORK_KEYS } = await import("../src/lib/networks");

let passed = 0;
function test(name: string, fn: () => void) {
  fn();
  passed++;
  console.log(`ok  ${name}`);
}

const WALLET = "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045";
const USDG_RH_MAINNET = "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168";
const { tag } = await generateReceiveKey();

/** Reads a link the way MoveView does: query, then fragment. */
function read(link: string, fallback = "robinhood" as (typeof NETWORK_KEYS)[number]) {
  const u = new URL(link);
  return readPaymentRequest(requestParamsFrom(u.search, u.hash), fallback);
}

const hasRhMainnet = NETWORK_KEYS.includes("robinhood-mainnet" as never);

test("a 0x address in `to` is kept, checksum and all, and marked as a wallet", () => {
  const r = read(`https://gloam.trade/app/vault?tab=move&mode=pay#to=${WALLET}&amount=25&asset=USDG&chain=robinhood`);
  assert.ok(r);
  assert.equal(r.to, WALLET);
  assert.equal(r.toKind, "address");
  assert.ok(isWalletRequest(r));
  assert.equal(r.amount, "25");
  assert.equal(r.asset?.symbol, "USDG");
  assert.equal(r.network, "robinhood");
  assert.deepEqual(r.problems, []);
});

test("an all-lowercase 0x address is accepted (no checksum to check)", () => {
  const r = read(`https://gloam.trade/app/vault?tab=move&mode=pay#to=${WALLET.toLowerCase()}&chain=robinhood`);
  assert.equal(r?.toKind, "address");
  assert.deepEqual(r?.problems, []);
});

test("a mixed-case address with a wrong checksum is left out with a reason", () => {
  const typo = WALLET.slice(0, -1) + "6"; // one digit off: the checksum no longer matches
  const r = read(`https://gloam.trade/app/vault?tab=move&mode=pay#to=${typo}&chain=robinhood`);
  assert.equal(r?.to, null);
  assert.equal(r?.toKind, null);
  assert.ok(r?.problems.some((p) => p.includes("looks mistyped")));
});

test("the zero address is refused", () => {
  const r = read("https://gloam.trade/app/vault?tab=move&mode=pay#to=0x0000000000000000000000000000000000000000&chain=robinhood");
  assert.equal(r?.to, null);
  assert.ok(r?.problems.some((p) => p.includes("zero address")));
});

test("an ENS name is normalized and marked as a wallet", () => {
  const r = read("https://gloam.trade/app/vault?tab=move&mode=pay#to=Vitalik.ETH&amount=1.5&asset=USDG&chain=robinhood");
  assert.equal(r?.to, "vitalik.eth");
  assert.equal(r?.toKind, "ens");
  assert.ok(isWalletRequest(r));
  assert.equal(r?.amount, "1.5");
});

test("a Gloam address still makes a private payment request", () => {
  const r = read(`https://gloam.trade/app/vault?tab=move&mode=pay#to=${tag}&amount=5&asset=USDG&chain=robinhood`);
  assert.equal(r?.to, tag);
  assert.equal(r?.toKind, "gloam");
  assert.equal(isWalletRequest(r), false);
});

test("text that is no address at all is left out", () => {
  for (const bad of ["hello", "0x1234", "<script>", "gloamr1.broken"]) {
    const r = read(`https://gloam.trade/app/vault?tab=move&mode=pay#to=${encodeURIComponent(bad)}&chain=robinhood`);
    assert.equal(r?.to, null, bad);
    assert.equal(r?.toKind, null, bad);
    assert.equal(r?.problems.length, 1, bad);
  }
});

test("bad amounts and unknown tokens or networks are dropped, never guessed", () => {
  const r = read(`https://gloam.trade/app/vault?tab=move&mode=pay#to=${WALLET}&amount=-5&asset=USDG&chain=robinhood`);
  assert.equal(r?.amount, null);
  const t = read(`https://gloam.trade/app/vault?tab=move&mode=pay#to=${WALLET}&amount=5&asset=FAKE&chain=robinhood`);
  assert.equal(t?.asset, null);
  assert.equal(t?.amount, null);
  const n = read(`https://gloam.trade/app/vault?tab=move&mode=pay#to=${WALLET}&chain=mars`);
  assert.equal(n?.network, null);
  assert.equal(n?.to, WALLET);
});

if (hasRhMainnet) {
  test("Merrymen: fund an agent's smart account with USDG on Robinhood Chain mainnet", () => {
    const r = read(
      `https://gloam.trade/app/vault?tab=move&mode=pay#to=${WALLET}&amount=25&asset=${USDG_RH_MAINNET}&chain=robinhood-mainnet&name=Merrymen+agent`
    );
    assert.equal(r?.toKind, "address");
    assert.equal(r?.network, "robinhood-mainnet");
    assert.equal(r?.asset?.address, USDG_RH_MAINNET);
    assert.equal(r?.amount, "25");
    assert.equal(r?.name, "Merrymen agent");
    assert.deepEqual(r?.problems, []);
  });

  test("Blad: a private withdrawal with no amount lets the payer choose", () => {
    const r = read(`https://gloam.trade/app/vault?tab=move&mode=pay#to=${WALLET}&asset=USDG&chain=robinhood-mainnet&name=Blad`);
    assert.equal(r?.toKind, "address");
    assert.equal(r?.amount, null);
    assert.equal(r?.asset?.symbol, "USDG");
    assert.deepEqual(r?.problems, []);
  });
}

test("the banner names the wallet and the Cash out button, and says what is public", () => {
  const r = read(`https://gloam.trade/app/vault?tab=move&mode=pay#to=${WALLET}&amount=25&asset=USDG&chain=robinhood&name=Agent`);
  assert.ok(r);
  const html = renderToString(
    h(PaymentRequestBanner, {
      request: r,
      contactLabel: null,
      currentNetwork: "robinhood",
      onSwitchNetwork: () => {},
      onDismiss: () => {},
      balanceHint: null,
    })
  )
    .replace(/<!-- -->/g, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ");
  assert.ok(html.includes("0xd8dA…6045") || html.includes("0xd8dA"), html);
  assert.ok(html.includes("Cash out to this address"), html);
  assert.ok(html.includes("The amount and their wallet are public"), html);
  assert.ok(html.includes("Check the address with them"), html);
  assert.ok(!html.includes("Send privately"), html);
});

console.log(`\nrequest wallet: ${passed} passed`);
