/**
 * Self-test: the approvals before an Add privately (lib/tokens approvalSteps
 * and approvalsBeforeDeposit, what ShieldView sends).
 *
 * Only Tether's USDT on Ethereum refuses to change one non-zero allowance into
 * another, so only it is ever reset to 0 first, and only when a non-zero
 * allowance was actually read. USDC and every other token approve the exact
 * amount once, or nothing when the allowance already covers the deposit. An
 * allowance that could not be read never turns into a reset: a standard token
 * is approved for the exact amount (approve() sets it outright), and USDT is
 * read again instead of guessed. The SDK's approvalSteps, which the MCP uses,
 * gives the same calls for every listed token.
 *
 * Run from app/:  ../mcp/node_modules/.bin/tsx scripts/selftest-approvals.mts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { approvalSteps as sdkApprovalSteps, approveNeedsReset } from "@gloamtrade/sdk";

globalThis.fetch = (async (url: unknown) => {
  throw new Error(`selftest-approvals: no network calls allowed (${String(url)})`);
}) as typeof fetch;

const { approvalSteps, approvalsBeforeDeposit, shieldTokensFor } = await import("../src/lib/tokens");

let n = 0;
function check(name: string, fn: () => void) {
  try {
    fn();
    n++;
  } catch (e) {
    console.error(`FAIL ${name}`);
    throw e;
  }
}

const AMOUNT = 20_000_000n; // 20 of a 6-decimal stablecoin
const show = (s: bigint[] | null) => (s === null ? "read again" : `[${s.join(", ")}]`);
const sepoliaUsdc = shieldTokensFor(11155111).find((t) => t.symbol === "USDC")!;
const usdt = shieldTokensFor(1).find((t) => t.symbol === "USDT")!;

check("USDC on Ethereum Sepolia: no reset, ever", () => {
  assert.equal(sepoliaUsdc.approveResetFirst, undefined);
  assert.equal(show(approvalsBeforeDeposit(sepoliaUsdc, BigInt(0), AMOUNT)), "[20000000]", "none yet: one exact approval");
  assert.equal(show(approvalsBeforeDeposit(sepoliaUsdc, BigInt(5_000_000), AMOUNT)), "[20000000]", "a smaller one: one exact approval, no 0 first");
  assert.equal(show(approvalsBeforeDeposit(sepoliaUsdc, AMOUNT, AMOUNT)), "[]", "covered: no approval, straight to the deposit");
  assert.equal(show(approvalsBeforeDeposit(sepoliaUsdc, BigInt(40_000_000), AMOUNT)), "[]");
  assert.equal(show(approvalsBeforeDeposit(sepoliaUsdc, undefined, AMOUNT)), "[20000000]", "not read: one exact approval, never [0, amount]");
});

check("USDT on Ethereum: reset to 0 only when a non-zero allowance was read", () => {
  assert.equal(usdt.approveResetFirst, true);
  assert.equal(show(approvalsBeforeDeposit(usdt, BigInt(0), AMOUNT)), "[20000000]", "read as 0: no reset");
  assert.equal(show(approvalsBeforeDeposit(usdt, BigInt(5_000_000), AMOUNT)), "[0, 20000000]", "a stale one read: 0 first");
  assert.equal(show(approvalsBeforeDeposit(usdt, AMOUNT, AMOUNT)), "[]", "covered: nothing");
  assert.equal(show(approvalsBeforeDeposit(usdt, undefined, AMOUNT)), "read again", "not read: no guessed reset, no blind approval");
});

check("every listed token: only Ethereum's USDT resets, and the SDK agrees", () => {
  for (const chainId of [46630, 42431, 84532, 11155111, 4663, 4217, 8453, 1]) {
    for (const t of shieldTokensFor(chainId)) {
      const resets = chainId === 1 && t.symbol === "USDT";
      assert.equal(Boolean(t.approveResetFirst), resets, `${chainId} ${t.symbol}`);
      assert.equal(approveNeedsReset(chainId, t.address), resets, `SDK ${chainId} ${t.symbol}`);
      for (const allowance of [BigInt(0), BigInt(1), AMOUNT - BigInt(1), AMOUNT, AMOUNT * BigInt(2)]) {
        assert.equal(
          show(approvalSteps(t, allowance, AMOUNT)),
          show(sdkApprovalSteps(chainId, t.address, allowance, AMOUNT)),
          `${chainId} ${t.symbol} at ${allowance}`
        );
      }
    }
  }
});

check("Add privately reads the allowance at the click and never resets an unread one", () => {
  const view = readFileSync(new URL("../src/components/app/ShieldView.tsx", import.meta.url), "utf8");
  assert.ok(view.includes("approvalsBeforeDeposit(selectedToken, await allowanceNow, value)"), "decided on a fresh read");
  assert.ok(view.includes("refetchAllow().then("), "the allowance read again at the click");
  assert.ok(!/\[BigInt\(0\), value\]/.test(view), "no [0, amount] guessed for an allowance not read");
});

console.log(`approvals: ${n} passed`);
