/**
 * The examples that carry logic of their own, loaded without running their main.
 *
 * receive-and-credit credits the right token.
 *
 * Anyone can pay a Gloam address in any token the vault takes, and amounts are
 * in that token's base units. The example must credit only payments in the
 * token it credits, read with that token's decimals: a GLOAM payment of
 * 25,000,000 base units is 0.000000000025 GLOAM, not 25 USDG. Loads the example
 * itself (types stripped by the TypeScript compiler, the SDK import pointed at
 * this build) and checks what it would credit, without running its main loop.
 *
 * examples/san-verano keeps its nightly-root helpers, its burn call and its
 * allowlist honest, and its whole dry run (real proofs on the dev keys, a local
 * model of the vault) checks out when the circuit files are in the repo.
 *
 * Run after build:  node test/examples.selftest.mjs
 */
import { mkdtempSync, readFileSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { dirname, join } from "path";
import { fileURLToPath, pathToFileURL } from "url";
import ts from "typescript";
import { existsSync } from "fs";
import { decodeFunctionData, erc20Abi, keccak256, stringToHex } from "viem";
import { mainnetNetwork, RH_MAINNET_USDG, RH_MAINNET_GRIFT, GLOAM_TOKEN, verifyPaymentReceiptLeaf } from "../dist/index.js";

let checks = 0;
function assert(cond, msg) {
  if (!cond) {
    console.error("FAIL:", msg);
    process.exit(1);
  }
  checks++;
}

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

/** Load an example's module (types stripped, the SDK pointed at this build) without running its main. */
async function loadExample(path) {
  const source = readFileSync(path, "utf8");
  // Written outside dist, so a test run never ends up in the published package.
  const js = ts
    .transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } })
    .outputText.replace(/from "@gloamtrade\/sdk"/g, `from "${pathToFileURL(join(root, "dist/index.js")).href}"`)
    .replace(/from "viem"/g, `from "${import.meta.resolve("viem")}"`)
    .replace(/from "viem\/accounts"/g, `from "${import.meta.resolve("viem/accounts")}"`);
  const out = join(mkdtempSync(join(tmpdir(), "gloam-example-")), path.split("/").pop().replace(/\.ts$/, ".mjs"));
  writeFileSync(out, js);
  // Importing must not run the example's main (it would make a key and exit, or watch forever).
  const exit = process.exit;
  process.exit = (code) => {
    throw new Error(`the example ran its main on import (exit ${code})`);
  };
  try {
    return { mod: await import(pathToFileURL(out).href), error: null };
  } catch (e) {
    return { mod: null, error: e };
  } finally {
    process.exit = exit;
  }
}

const { mod: example, error: loadError } = await loadExample(join(root, "examples/receive-and-credit.ts"));
assert(!loadError, `the example loads without running: ${loadError?.message}`);
assert(typeof example.creditFor === "function", "the example exports creditFor");

const net = mainnetNetwork("robinhood");
const payment = (asset, amountWei, note) => ({
  commitment: "0x" + "c1".repeat(32),
  nullifier: "0x" + "0f".repeat(32),
  amountWei,
  asset,
  note,
  sealedTicket: "gloam2t.x",
  notePackage: { v: 1, type: "gloam-private-note", scheme: "poseidon", pool: net.pool, asset, amountWei, secret: "0x01", commitment: "0x01" },
  blockNumber: null,
  txHash: null,
});

const usdg = example.creditFor(payment(RH_MAINNET_USDG, "25000000", "agent:42"));
assert(usdg.agentId === "42" && usdg.amount === "25", `25 USDG credits agent 42 (got ${JSON.stringify(usdg)})`);
const lower = example.creditFor(payment(RH_MAINNET_USDG.toLowerCase(), "1500000", "agent:7"));
assert(lower.agentId === "7" && lower.amount === "1.5", "the asset match ignores address case");
const gloam = example.creditFor(payment(GLOAM_TOKEN, "25000000", "agent:42"));
assert("skip" in gloam && /GLOAM/.test(gloam.skip), `a GLOAM payment is not credited as USDG (got ${JSON.stringify(gloam)})`);
const stranger = example.creditFor(payment("0x000000000000000000000000000000000000dEaD", "25000000", "agent:42"));
assert("skip" in stranger, "a token the vault does not list is not credited");
const noNote = example.creditFor(payment(RH_MAINNET_USDG, "25000000", null));
assert("skip" in noNote && /agent note/.test(noNote.skip), "a payment with no agent note is not credited");

// ── examples/san-verano ─────────────────────────────────────────────────────

const sv = await loadExample(join(root, "../../examples/san-verano/san-verano.ts"));
assert(!sv.error, `san-verano loads without running: ${sv.error?.message}`);
const S = sv.mod;

const L = (s) => keccak256(stringToHex(s));
for (const n of [1, 2, 3, 5, 8]) {
  const leaves = Array.from({ length: n }, (_, i) => L(`leaf ${i}`));
  const r = S.nightlyRoot(leaves);
  let all = true;
  for (let i = 0; i < n; i++) all &&= S.verifyNightlyProof(r, leaves[i], S.nightlyProof(leaves, i));
  assert(all, `nightly root over ${n} leaves: every leaf proves into it`);
  assert(!S.verifyNightlyProof(r, L("not a leaf"), S.nightlyProof(leaves, 0)), `nightly root over ${n} leaves: an outside leaf does not`);
}
assert(S.nightlyRoot([L("a")]) === L("a"), "one leaf is its own root");
let threw = false;
try {
  S.nightlyRoot([]);
} catch {
  threw = true;
}
assert(threw, "no leaves, no root");

const burn = S.burnCall(RH_MAINNET_GRIFT, 10n ** 18n);
const decoded = decodeFunctionData({ abi: erc20Abi, data: burn.data });
assert(burn.to === RH_MAINNET_GRIFT && burn.selector === "0xa9059cbb", "the burn is GRIFT's transfer(address,uint256)");
assert(decoded.functionName === "transfer" && decoded.args[0] === S.BURN_ADDRESS && decoded.args[1] === 10n ** 18n, "the burn sends the amount to 0x…dEaD");
assert(S.BURN_ADDRESS === "0x000000000000000000000000000000000000dEaD", "the burn address is 0x…dEaD");

const allow = S.sanVeranoAllowlist();
assert(
  JSON.stringify(allow.map((e) => e.id)) ===
    JSON.stringify(["erc20.usdg.approve", "erc20.grift.approve", "gloam.vault.shieldBound", "gloam.vault.transfer", "gloam.vault.unshield", "gloam.memo.postMemo"]),
  "the San Verano allowlist: USDG and GRIFT approvals, the three vault calls, the memo"
);
assert(allow.every((e) => e.chainId === 4663), "every entry is on Robinhood Chain mainnet");

const circuits = join(root, "../../app/public/circuits");
let dry = "skipped (circuit files absent)";
if (existsSync(join(circuits, "transfer_final.zkey")) && existsSync(join(circuits, "receipt_final.zkey"))) {
  const r = await S.dryRun({ circuitsDir: circuits, quiet: true });
  assert(r.swept, "dry run: the supplier's sweep is final");
  assert(r.leafRecomputes && verifyPaymentReceiptLeaf(r.record.leaf, r.record), "dry run: the leaf recomputes");
  assert(r.inRoot, "dry run: the leaf proves into the nightly root");
  assert(r.check.ok && r.check.checks.every((c) => c.state === "pass"), `dry run: the record passes every check (${JSON.stringify(r.check.checks)})`);
  assert(r.record.amount === null && r.record.verifier === "san-verano:sale:8812", "dry run: the amount stays hidden, the label is the sale");
  assert(r.calls.map((c) => c.selector).join() === "0xd02dddd1,0x82301844", "dry run: the agent signs the vault transfer and the memo");
  dry = "ran";
  globalThis.curve_bn128?.terminate?.();
}

console.log(`examples.selftest: ok (${checks} assertions; san-verano dry run ${dry})`);
process.exit(0);
