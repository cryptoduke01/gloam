/**
 * Self-test: Max on a public send leaves room for the network fee, and its
 * amount is the raw balance's, not a display string's.
 *
 * Review, 24 Oct 2026: Max copied the displayed balance into the field. That
 * was the whole balance (no fee left, so the wallet refused the send), rounded
 * to 6 places (sometimes up, past the balance), "<0.0001" became 0, a balance
 * over a million read "1.5M", and in a German browser 1,5 ETH became 15 after
 * the commas were stripped. lib/nativeSend works from the raw balance and the
 * fee read from the chain, and returns the gas and fee it set aside so the
 * send asks the wallet for exactly those.
 *
 * Run from app/:  ../mcp/node_modules/.bin/tsx scripts/selftest-public-send-max.mts
 */
import assert from "node:assert/strict";
import { formatEther, parseEther, parseGwei, type Address } from "viem";
import { estimateMaxNativeSend, maxAfterFee, type MaxSendClient } from "../src/lib/nativeSend";
import { safeParseEther } from "../src/lib/amount";

let passed = 0;
async function test(name: string, fn: () => Promise<void> | void) {
  await fn();
  passed++;
  console.log(`ok  ${name}`);
}

const ME = "0x00000000000000000000000000000000000000a1" as Address;
const THEM = "0x00000000000000000000000000000000000000b2" as Address;

/** A chain with EIP-1559 fees whose transfers cost `gasFor(value)`. */
function chain(balance: bigint, gasFor: (value: bigint) => bigint = () => 21_000n, legacy = false) {
  const calls: bigint[] = [];
  const client = {
    getBalance: async () => balance,
    estimateFeesPerGas: async () => {
      if (legacy) throw new Error("Chain does not support EIP-1559 fees.");
      return { maxFeePerGas: parseGwei("0.02"), maxPriorityFeePerGas: 0n };
    },
    getGasPrice: async () => parseGwei("0.05"),
    estimateGas: async ({ value }: { value?: bigint }) => {
      calls.push(value ?? 0n);
      return gasFor(value ?? 0n);
    },
  } as unknown as MaxSendClient;
  return { client, calls };
}

/** What the wallet checks before it signs: value plus gas times the max fee. */
function fits(balance: bigint, max: Awaited<ReturnType<typeof estimateMaxNativeSend>>) {
  const perGas = "gasPrice" in max.fees ? max.fees.gasPrice : max.fees.maxFeePerGas;
  return max.value + max.gas * perGas <= balance;
}

await test("Max plus the fee it set aside fits the balance, for small and huge balances", async () => {
  for (const eth of ["0.00009", "0.0123456789", "1.5", "1234.5", "2500000", "1000000000000.123456789012345678"]) {
    const balance = parseEther(eth);
    const { client } = chain(balance);
    const max = await estimateMaxNativeSend(client, ME, THEM);
    assert.ok(max.value > 0n, eth);
    assert.ok(max.value < balance, `${eth}: never the whole balance`);
    assert.ok(fits(balance, max), `${eth}: value + gas x fee fits`);
    assert.ok(max.gas >= 21_000n, `${eth}: the gas set aside covers the transfer`);
  }
});

await test("the amount Max writes reads back to the same value, whatever the browser's language", async () => {
  const balance = parseEther("1.5");
  const max = await estimateMaxNativeSend(chain(balance).client, ME, THEM);
  const text = formatEther(max.value);
  assert.match(text, /^\d+(\.\d+)?$/, "digits and one dot, no grouping or suffix");
  assert.equal(safeParseEther(text), max.value);
  // what the old Max copied: the display string, which in German is "1,5"
  assert.equal((1.5).toLocaleString("de-DE"), "1,5");
  assert.equal(text.startsWith("1.4999"), true);
});

await test("Max is floored to 6 decimals, never rounded up", () => {
  const v = maxAfterFee(parseEther("0.1234569999"), 21_000n, 1n);
  assert.equal(v, parseEther("0.123456"));
  assert.equal(maxAfterFee(parseEther("0.0000001"), 21_000n, 1n), null, "under 6 decimals left: nothing to send");
});

await test("when the fee takes the whole balance, Max says so", async () => {
  await assert.rejects(estimateMaxNativeSend(chain(1_000n).client, ME, THEM), /Not enough ETH to cover the network fee/);
});

await test("a recipient that needs more gas for the real amount gets it set aside", async () => {
  const balance = parseEther("2");
  // a contract that does more work when it receives a lot
  const { client, calls } = chain(balance, (v) => (v > parseEther("1") ? 60_000n : 30_000n));
  const max = await estimateMaxNativeSend(client, ME, THEM);
  assert.ok(max.gas >= 60_000n);
  assert.ok(fits(balance, max));
  assert.ok(calls.length >= 3, "the amount Max landed on was estimated again");
});

await test("a chain without EIP-1559 fees falls back to the gas price", async () => {
  const balance = parseEther("1");
  const max = await estimateMaxNativeSend(chain(balance, undefined, true).client, ME, THEM);
  assert.ok("gasPrice" in max.fees);
  assert.ok(fits(balance, max));
});

await test("a transfer the chain refuses to estimate is an error, never the whole balance", async () => {
  const { client } = chain(parseEther("1"));
  (client as { estimateGas: unknown }).estimateGas = async () => {
    throw new Error("execution reverted");
  };
  await assert.rejects(estimateMaxNativeSend(client, ME, THEM), /execution reverted/);
});

console.log(`\n${passed} public send Max checks passed`);
