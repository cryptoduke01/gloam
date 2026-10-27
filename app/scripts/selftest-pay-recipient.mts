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
  resolveEnsName,
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

await test("the hand-off opens Cash out on another address with the typed amount when it fits", () => {
  assert.deepEqual(cashOutHandoff(VITALIK, " 12.5 ", true), { dest: "other", to: VITALIK, amount: "12.5" });
});

await test("the hand-off leaves the amount blank (the whole balance) when none is typed or it does not fit", () => {
  assert.deepEqual(cashOutHandoff(VITALIK, "", true), { dest: "other", to: VITALIK, amount: "" });
  assert.deepEqual(cashOutHandoff(VITALIK, "   ", true), { dest: "other", to: VITALIK, amount: "" });
  assert.deepEqual(cashOutHandoff(VITALIK, "9999999", false), { dest: "other", to: VITALIK, amount: "" });
});

await test("a name resolves to its address", async () => {
  const seen: string[] = [];
  const got = await resolveEnsName("vitalik.eth", async (n) => {
    seen.push(n);
    return VITALIK as `0x${string}`;
  });
  assert.equal(got, VITALIK);
  assert.deepEqual(seen, ["vitalik.eth"]);
});

await test("no address, a bad answer or a failed lookup all come back as null, quietly", async () => {
  assert.equal(await resolveEnsName("nobody.eth", async () => null), null);
  assert.equal(await resolveEnsName("x.eth", async () => "0x123" as `0x${string}`), null);
  assert.equal(await resolveEnsName("x.eth", async () => { throw new Error("rpc down"); }), null);
});

await test("an answer for text that has since changed is dropped", async () => {
  let current = "a.eth";
  const got = await resolveEnsName(
    "a.eth",
    async () => {
      current = "b.eth";
      return VITALIK as `0x${string}`;
    },
    () => current !== "a.eth"
  );
  assert.equal(got, null);
});

console.log(`\npay recipient: ${passed} passed`);
