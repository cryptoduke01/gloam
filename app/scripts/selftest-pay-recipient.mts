/**
 * Self-test: what the Pay box's recipient field holds (lib/payRecipient).
 *
 * A Gloam address is paid with a private note, as before. A 0x address or an
 * ENS name is not: Pay offers Cash out to that wallet, with the typed amount
 * carried over only when it fits. Nothing here moves money.
 *
 * Run from app/:  pnpm dlx tsx scripts/selftest-pay-recipient.mts
 */
import assert from "node:assert/strict";
import {
  cashOutHandoff,
  classifyPayRecipient,
  ensCandidate,
  isWalletRecipient,
  isContractCode,
  resolveEnsForChain,
  type EnsChainReader,
} from "../src/lib/payRecipient";

let passed = 0;
async function test(name: string, fn: () => void | Promise<void>) {
  await fn();
  passed++;
  console.log(`ok  ${name}`);
}

const VITALIK = "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045";
const kind = (s: string) => classifyPayRecipient(s).kind;

await test("empty or blank text is empty", () => {
  assert.equal(kind(""), "empty");
  assert.equal(kind("   "), "empty");
});

await test("anything starting gloamr1. is a Gloam address, valid or not (the form's own check judges it)", () => {
  assert.equal(kind("gloamr1."), "gloam");
  assert.equal(kind("gloamr1.abc"), "gloam");
  assert.equal(kind("  gloamr1.MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE  "), "gloam");
  assert.equal(isWalletRecipient(classifyPayRecipient("gloamr1.abc")), false);
});

await test("a 0x address is a wallet, checksummed or all one case", () => {
  assert.deepEqual(classifyPayRecipient(VITALIK), { kind: "address", address: VITALIK });
  assert.equal(kind(VITALIK.toLowerCase()), "address");
  assert.equal(kind(`  ${VITALIK}  `), "address");
  assert.equal(isWalletRecipient(classifyPayRecipient(VITALIK)), true);
});

await test("a mixed-case address with a wrong checksum is flagged, not accepted", () => {
  const bad = VITALIK.slice(0, -1) + "4";
  assert.equal(kind(bad), "badAddress");
  assert.equal(isWalletRecipient(classifyPayRecipient(bad)), false);
});

await test("a half-typed 0x address is just other", () => {
  assert.equal(kind("0x"), "other");
  assert.equal(kind("0xd8dA6BF2"), "other");
  assert.equal(kind(VITALIK + "00"), "other");
});

await test("a .eth name is an ENS candidate, normalized", () => {
  assert.deepEqual(classifyPayRecipient("vitalik.eth"), { kind: "ens", name: "vitalik.eth" });
  assert.deepEqual(classifyPayRecipient("  Vitalik.ETH "), { kind: "ens", name: "vitalik.eth" });
  assert.deepEqual(classifyPayRecipient("sub.name.eth"), { kind: "ens", name: "sub.name.eth" });
  assert.equal(isWalletRecipient(classifyPayRecipient("vitalik.eth")), true);
});

await test("other dotted names without spaces are candidates too", () => {
  assert.equal(kind("brantly.xyz"), "ens");
});

await test("spaces, numbers, empty labels and a bare word are not names", () => {
  assert.equal(kind("vitalik"), "other");
  assert.equal(kind("vitalik .eth"), "other");
  assert.equal(kind("my friend.eth"), "other");
  assert.equal(kind("1.5"), "other");
  assert.equal(kind("0.25"), "other");
  assert.equal(kind(".eth"), "other");
  assert.equal(kind("vitalik."), "other");
  assert.equal(kind("a..eth"), "other");
  assert.equal(kind("a.b"), "other");
  assert.equal(ensCandidate("foo bar.eth"), null);
});

await test("names ENS normalization refuses are not candidates", () => {
  assert.equal(kind("bad_name.eth"), "other");
  assert.equal(kind("a\u0000b.eth"), "other");
});

await test("a claim code or a URL is not a name or a wallet", () => {
  assert.equal(kind("gloam1=abc"), "other");
  assert.equal(kind("https://gloam.trade/app"), "other");
});

await test("the hand-off opens Cash out on another address with the typed amount", () => {
  assert.deepEqual(cashOutHandoff(VITALIK, " 12.5 "), { dest: "other", to: VITALIK, amount: "12.5" });
});

await test("an amount too big still comes along (Cash out shows its error), and none typed stays blank", () => {
  assert.deepEqual(cashOutHandoff(VITALIK, "9999999"), { dest: "other", to: VITALIK, amount: "9999999" });
  assert.deepEqual(cashOutHandoff(VITALIK, "   "), { dest: "other", to: VITALIK, amount: "" });
});

// GHSA-wxv6-6fjw-c2m9: a name is paid on the network the app is on, so its
// address must be the one the name sets for that network (ENSIP-11/19), not
// its Ethereum mainnet record. Records are read through a fake resolver.
const MAINNET = "0x1111111111111111111111111111111111111111" as const;
const ON_BASE = "0x2222222222222222222222222222222222222222" as const;
const DEFAULT_EVM = "0x3333333333333333333333333333333333333333" as const;
const BASE_COIN = 0x80000000n | 8453n;
const EVM_COIN = 0x80000000n;

/** A resolver answering only the records given; undefined is addr(bytes32), coinType 60. */
function fakeResolver(records: Partial<Record<string, `0x${string}`>>, calls: string[] = []): EnsChainReader {
  return async (_name, coinType) => {
    const key = coinType == null ? "60" : coinType.toString();
    calls.push(key);
    return (records[key] as `0x${string}` | undefined) ?? null;
  };
}
const eoa = async () => false;
const contract = async () => true;

await test("on Base, a name's Base record is paid, not its mainnet record", async () => {
  const calls: string[] = [];
  const read = fakeResolver({ "60": MAINNET, [BASE_COIN.toString()]: ON_BASE }, calls);
  const got = await resolveEnsForChain("treasury.eth", 8453, { read, isContract: eoa });
  assert.deepEqual(got, { status: "found", address: ON_BASE, source: "chain" });
  assert.equal(calls[0], BASE_COIN.toString());
});

await test("with no record for the network, the default EVM record (ENSIP-19) is used", async () => {
  const read = fakeResolver({ "60": MAINNET, [EVM_COIN.toString()]: DEFAULT_EVM });
  const got = await resolveEnsForChain("treasury.eth", 4663, { read, isContract: eoa });
  assert.deepEqual(got, { status: "found", address: DEFAULT_EVM, source: "evm" });
});

await test("a mainnet-only name that is a plain wallet falls back to it, marked so the screen can say so", async () => {
  const read = fakeResolver({ "60": MAINNET });
  const got = await resolveEnsForChain("alice.eth", 4217, { read, isContract: eoa });
  assert.deepEqual(got, { status: "found", address: MAINNET, source: "mainnet" });
});

await test("a mainnet-only name whose address is a smart account is refused off Ethereum", async () => {
  const read = fakeResolver({ "60": MAINNET });
  const got = await resolveEnsForChain("dao.eth", 8453, { read, isContract: contract });
  assert.deepEqual(got, { status: "unsafe", address: MAINNET });
});

await test("when the code check fails, the mainnet fallback is refused rather than guessed", async () => {
  const read = fakeResolver({ "60": MAINNET });
  const got = await resolveEnsForChain("dao.eth", 8453, {
    read,
    isContract: async () => {
      throw new Error("rpc down");
    },
  });
  assert.equal(got.status, "unsafe");
});

await test("a smart account set on purpose for the network is paid (the owner chose it)", async () => {
  const read = fakeResolver({ "60": MAINNET, [BASE_COIN.toString()]: ON_BASE });
  const got = await resolveEnsForChain("dao.eth", 8453, { read, isContract: contract });
  assert.deepEqual(got, { status: "found", address: ON_BASE, source: "chain" });
});

await test("on Ethereum mainnet the mainnet record is the network's own record", async () => {
  const calls: string[] = [];
  const read = fakeResolver({ "60": MAINNET, [BASE_COIN.toString()]: ON_BASE }, calls);
  const got = await resolveEnsForChain("treasury.eth", 1, { read, isContract: contract });
  assert.deepEqual(got, { status: "found", address: MAINNET, source: "chain" });
  assert.deepEqual(calls, ["60"]);
});

await test("no record anywhere, or a failed lookup, is none; a stale answer is dropped", async () => {
  assert.deepEqual(await resolveEnsForChain("nobody.eth", 8453, { read: fakeResolver({}), isContract: eoa }), {
    status: "none",
  });
  const failing: EnsChainReader = async () => {
    throw new Error("rpc down");
  };
  assert.deepEqual(await resolveEnsForChain("x.eth", 8453, { read: failing, isContract: eoa }), { status: "none" });
  const got = await resolveEnsForChain(
    "x.eth",
    8453,
    { read: fakeResolver({ [BASE_COIN.toString()]: ON_BASE }), isContract: eoa },
    () => true
  );
  assert.deepEqual(got, { status: "none" });
});

await test("a non-address answer for a network record (other bytes) is treated as no record", async () => {
  const read = fakeResolver({ [BASE_COIN.toString()]: "0x1234" as `0x${string}`, "60": MAINNET });
  const got = await resolveEnsForChain("x.eth", 8453, { read, isContract: eoa });
  assert.deepEqual(got, { status: "found", address: MAINNET, source: "mainnet" });
});

await test("contract code is told apart from a plain or EIP-7702 delegated wallet", () => {
  assert.equal(isContractCode(undefined), false);
  assert.equal(isContractCode("0x"), false);
  assert.equal(isContractCode("0xef0100" + "ab".repeat(20)), false);
  assert.equal(isContractCode("0x6080604052"), true);
  assert.equal(isContractCode("0xef0100" + "ab".repeat(21)), true);
});

console.log(`\npay recipient: ${passed} passed`);
