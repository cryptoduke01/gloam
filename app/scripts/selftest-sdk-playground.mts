/**
 * Self-test: the SDK playground (/sdk/playground, lib/playground).
 *
 * The playground shows three small apps as they work today and with
 * @gloamtrade/sdk added, and Copy hands out the "with Gloam" file. So the code
 * has to be real:
 *   - all six files (before and after) typecheck, strict, against the real
 *     packages/sdk and viem, with no unused imports;
 *   - every name a file imports from the SDK is one the SDK exports;
 *   - the request links the tip jar and the checkout build are what the SDK
 *     and the app read back: the right network, token, amount and note;
 *   - the public versions point at the real USDG and USDC.e contracts.
 * Then the diff (lib/playground/diff): either side of it gives back the file
 * exactly, removed lines come before added ones in a block, and a lone bracket
 * or blank line does not split a change. And the explorer's story holds
 * together: the relay and the vault are Gloam's real addresses, each history
 * opens on this payment, and the copy keeps the house rules.
 *
 * Run from app/:  ../mcp/node_modules/.bin/tsx scripts/selftest-sdk-playground.mts
 */
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import ts from "typescript";
import * as sdk from "../../packages/sdk/src/index";
import { diffLines, diffStats, isTrivialLine, sideOf, type DiffLine } from "../src/lib/playground/diff";
import {
  GLOAM_RELAYER,
  GLOAM_VAULT,
  SCENARIOS,
  relayPage,
  scenarioById,
  sdkImports,
  shortAddress,
  tokenOf,
  vaultPage,
  type AddressPage,
} from "../src/lib/playground/scenarios";

const appDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
let passed = 0;
async function test(name: string, fn: () => void | Promise<void>) {
  await fn();
  passed++;
  console.log(`ok  ${name}`);
}

// ---------------------------------------------------------------- the code

// The six files go in a scratch project laid out like a reader's after
// \`npm i @gloamtrade/sdk viem\`: the SDK from packages/sdk, and the one viem it
// is built against (the app pins a newer one of its own).
const sdkDir = resolve(appDir, "../packages/sdk");
const work = mkdtempSync(join(tmpdir(), "gloam-playground-"));
mkdirSync(join(work, "node_modules/@gloamtrade"), { recursive: true });
symlinkSync(sdkDir, join(work, "node_modules/@gloamtrade/sdk"), "dir");
symlinkSync(join(sdkDir, "node_modules/viem"), join(work, "node_modules/viem"), "dir");
const files: string[] = [];
for (const s of SCENARIOS) {
  for (const side of ["before", "after"] as const) {
    mkdirSync(join(work, side), { recursive: true });
    const f = join(work, side, s.file);
    writeFileSync(f, s[side]);
    files.push(f);
  }
}

try {
  await test("all six files typecheck against packages/sdk and viem, with no unused imports", () => {
    const program = ts.createProgram(files, {
      strict: true,
      noEmit: true,
      noUnusedLocals: true,
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      lib: ["lib.es2022.d.ts", "lib.dom.d.ts"],
      types: [],
      skipLibCheck: true,
      allowImportingTsExtensions: false,
    });
    const ours = new Set(files.map((f) => resolve(f)));
    const problems = ts
      .getPreEmitDiagnostics(program)
      .filter((d) => d.file && ours.has(resolve(d.file.fileName)))
      .map((d) => {
        const { line } = d.file!.getLineAndCharacterOfPosition(d.start ?? 0);
        const where = d.file!.fileName.slice(work.length + 1);
        return `${where}:${line + 1} ${ts.flattenDiagnosticMessageText(d.messageText, "\n")}`;
      });
    assert.deepEqual(problems, [], problems.join("\n"));
    // and the SDK really was the one in packages/sdk
    const sdkFile = program.getSourceFiles().find((f) => /packages[\\/]sdk[\\/]src[\\/]x402\.ts$/.test(f.fileName));
    assert.ok(sdkFile, "the files were checked against packages/sdk/src");
  });

  await test("every name imported from @gloamtrade/sdk is one the SDK exports", () => {
    for (const s of SCENARIOS) {
      const { values, types } = sdkImports(s.after);
      assert.ok(values.length > 0, `${s.id} uses the SDK`);
      for (const name of values) assert.ok(name in sdk, `${s.id}: ${name} is exported by the SDK`);
      // types have no runtime trace; the typecheck above proves they exist
      assert.ok(types.every((t) => /^[A-Z]\w+$/.test(t)), `${s.id}: type names read cleanly`);
      // the file today has nothing to do with Gloam
      assert.deepEqual(sdkImports(s.before), { values: [], types: [] }, `${s.id}: today's file has no SDK`);
    }
  });

  // Placeholders a reader replaces ("gloamr1.…", "0x9C4e…b21F") stand in for
  // real values here, so the files can run.
  const { tag } = await sdk.generateReceiveKey();
  const load = async (id: string, side: "before" | "after", swap: [string, string][] = []) => {
    let code = scenarioById(id as never)[side];
    for (const [from, to] of swap) {
      assert.ok(code.includes(from), `${id} ${side} has ${from}`);
      code = code.split(from).join(to);
    }
    const f = join(work, `${side}-${id}-run.ts`);
    writeFileSync(f, code);
    return import(pathToFileURL(f).href);
  };

  await test("the tip jar's link pays your Gloam address in USDG on Robinhood Chain, with the note", async () => {
    const after = await load("tip", "after", [['"gloamr1.…"', JSON.stringify(tag)]]);
    const link: string = after.tipLink("5");
    const read = sdk.parsePaymentRequestLink(link);
    assert.equal(read.payTo, tag);
    assert.equal(read.networkKey, "robinhood-mainnet");
    assert.equal(read.asset?.toLowerCase(), sdk.RH_MAINNET_USDG.toLowerCase());
    assert.equal(read.amount, "5");
    assert.equal(read.note, "tip");
    assert.ok(link.startsWith("https://gloam.trade/app/vault?"), link);
    // the details ride after the #, which no server sees
    assert.ok(!new URL(link).search.includes(tag), "the address is in the fragment");

    const wallet = "0x9C4e00000000000000000000000000000000b21F";
    const before = await load("tip", "before", [['"0x9C4e…b21F"', JSON.stringify(wallet)]]);
    assert.equal(before.tipLink("5"), `ethereum:${sdk.RH_MAINNET_USDG}@${sdk.RH_MAINNET_CHAIN_ID}/transfer?address=${wallet}&uint256=5e6`);
  });

  await test("the checkout's link carries the invoice id sealed, in USDC.e on Tempo", async () => {
    const after = await load("checkout", "after");
    const shop = { key: { tag } };
    const link: string = after.invoiceLink(shop, "1042", "120");
    const read = sdk.parsePaymentRequestLink(link);
    assert.equal(read.payTo, tag);
    assert.equal(read.networkKey, "tempo-mainnet");
    assert.equal(read.asset?.toLowerCase(), sdk.TEMPO_USDCE.toLowerCase());
    assert.equal(read.amount, "120");
    assert.equal(read.note, "1042");

    const before = await load("checkout", "before");
    const wallet = "0x2B9f0000000000000000000000000000000061Cc";
    assert.equal(
      before.invoiceLink({ wallet }, "1042", "120"),
      `ethereum:${sdk.TEMPO_USDCE}@${sdk.TEMPO_MAINNET_CHAIN_ID}/transfer?address=${wallet}&uint256=120e6`
    );
    // the network the shop scans is Tempo mainnet, which has a payment-message board
    const net = sdk.mainnetNetwork("tempo");
    assert.ok(net && sdk.payMemoBoardFor(net.chainId), "Tempo mainnet has a board to scan");
  });

  await test("the agent only pays on a 402, and passes anything else straight back", async () => {
    const after = await load("agent", "after");
    const before = await load("agent", "before");
    const real = globalThis.fetch;
    try {
      let calls = 0;
      globalThis.fetch = (async () => {
        calls++;
        return new Response("ok", { status: 200 });
      }) as typeof fetch;
      const nothing = { client: null, note: null, tree: null, prove: null, keep: null };
      assert.equal((await after.paidFetch("https://api.example.com/v1/summarize", nothing)).status, 200);
      assert.equal((await before.paidFetch("https://api.example.com/v1/summarize", nothing)).status, 200);
      assert.equal(calls, 2, "one request each, no payment");
    } finally {
      globalThis.fetch = real;
    }
  });
} finally {
  rmSync(work, { recursive: true, force: true });
}

// ---------------------------------------------------------------- the diff

const kinds = (d: DiffLine[]) => d.map((l) => (l.kind === "same" ? " " : l.kind === "add" ? "+" : "-")).join("");

await test("either side of every scenario's diff is its file, exactly", () => {
  for (const s of SCENARIOS) {
    const d = diffLines(s.before, s.after);
    assert.equal(sideOf(d, "before"), s.before, `${s.id} before`);
    assert.equal(sideOf(d, "after"), s.after, `${s.id} after`);
    const { added, removed } = diffStats(d);
    assert.ok(added > 0 && removed > 0, `${s.id} changes something`);
    // line numbers count up through each file with no gaps
    assert.deepEqual(d.filter((l) => l.a !== null).map((l) => l.a), s.before.split("\n").map((_, i) => i + 1));
    assert.deepEqual(d.filter((l) => l.b !== null).map((l) => l.b), s.after.split("\n").map((_, i) => i + 1));
  }
});

await test("in every block of changes, the removed lines come first", () => {
  for (const s of SCENARIOS) {
    const shape = kinds(diffLines(s.before, s.after));
    assert.ok(!/\+-/.test(shape), `${s.id}: no removal after an addition in one block (${shape})`);
  }
});

await test("the same file is all unchanged; from nothing it is all added", () => {
  const code = "const a = 1;\n\nexport function f() {\n  return a;\n}";
  assert.equal(kinds(diffLines(code, code)), "     ");
  assert.equal(kinds(diffLines("", "a\nb")), "-++");
  assert.equal(sideOf(diffLines("", "a\nb"), "after"), "a\nb");
});

await test("a lone bracket or blank line between edits does not split them", () => {
  const before = "f(a);\n}\ng(a);";
  const after = "f(b);\n}\ng(b);";
  // the "}" matches, but it sits between two edits: one block, removals first
  assert.equal(kinds(diffLines(before, after)), "---+++");
  // real code between edits still anchors
  assert.equal(kinds(diffLines("f(a);\nkeep();\ng(a);", "f(b);\nkeep();\ng(b);")), "-+ -+");
  assert.equal(isTrivialLine("  });"), true);
  assert.equal(isTrivialLine(""), true);
  assert.equal(isTrivialLine("  return x;"), false);
});

await test("Windows line endings and a final newline make no difference", () => {
  const d = diffLines("a\r\nb\r\n", "a\nb");
  assert.equal(kinds(d), "  ");
});

// ---------------------------------------------------------------- the explorer

await test("the relay and the vault are Gloam's real addresses", () => {
  for (const id of [sdk.RH_MAINNET_CHAIN_ID, sdk.TEMPO_MAINNET_CHAIN_ID] as const) {
    assert.equal(sdk.mainnetPoolFor(id)?.pool.toLowerCase(), GLOAM_VAULT.toLowerCase(), `vault on ${id}`);
  }
  // The docs and /verify name the relayer from lib/contractDirectory.
  const listed = readFileSync(join(appDir, "src/lib/contractDirectory.ts"), "utf8");
  assert.ok(listed.toLowerCase().includes(GLOAM_RELAYER.toLowerCase()), "the relayer the docs list");
  assert.equal(relayPage().address, shortAddress(GLOAM_RELAYER));
  assert.equal(vaultPage("USDG").address, shortAddress(GLOAM_VAULT));
  assert.equal(shortAddress(GLOAM_VAULT), "0x39e2…0194");
  assert.equal(shortAddress("0xA11c…7e21"), "0xA11c…7e21", "a short address stays as it is");
});

await test("each public history opens on this payment, and the private side shows no amount", () => {
  for (const s of SCENARIOS) {
    const n = s.amount.split(" ")[0]!;
    assert.deepEqual(s.payer.rows[0], { when: "Just now", what: `To ${s.payee.address}`, amount: `−${n}` }, `${s.id} payer`);
    assert.deepEqual(s.payee.rows[0], { when: "Just now", what: `From ${s.payer.address}`, amount: `+${n}` }, `${s.id} payee`);
    assert.ok(s.payTo.public.includes(s.id === "agent" ? s.payer.address : s.payee.address), `${s.id}: today names the wallet`);
    assert.ok(!/0x/.test(s.payTo.private), `${s.id}: with Gloam names no wallet`);
    assert.ok(s.steps.public.some((x) => x.includes(s.payer.address)) || s.id === "agent", `${s.id}: the public run names the payer`);
    assert.ok(!s.steps.private.some((x) => /0x/.test(x)), `${s.id}: the private run names no wallet`);
    assert.match(s.firstTx, /^0x[0-9a-f]{64}$/, `${s.id}: a transaction hash`);
    // the vault's own page keeps adds and cash outs public, in this scenario's token
    const vault = vaultPage(tokenOf(s));
    assert.ok(vault.rows.some((r) => r.what.startsWith("Added") && r.amount?.endsWith(tokenOf(s))), `${s.id}: adds show`);
    assert.ok(vault.rows.some((r) => r.what.startsWith("Cashed out") && r.amount?.endsWith(tokenOf(s))), `${s.id}: cash outs show`);
    assert.ok(vault.rows.filter((r) => r.what === "Private payment").every((r) => r.amount === null), `${s.id}: payments show no amount`);
  }
  assert.ok(relayPage().rows.every((r) => r.amount === null), "the relay's payments show no amount");
  assert.equal(tokenOf(scenarioById("checkout")), "USDC.e");
  assert.equal(scenarioById("nope" as never).id, "tip", "an unknown scenario falls back to the first");
});

await test("the copy keeps the house rules", () => {
  const pages: AddressPage[] = [relayPage(), vaultPage("USDG"), ...SCENARIOS.flatMap((s) => [s.payer, s.payee])];
  const text = [
    ...SCENARIOS.flatMap((s) => [s.tab, s.line, s.action, s.amount, s.payTo.public, s.payTo.private, ...s.steps.public, ...s.steps.private]),
    ...pages.flatMap((p) => [p.who, p.line, ...p.rows.flatMap((r) => [r.what, r.hint ?? ""])]),
    ...SCENARIOS.flatMap((s) => [s.before, s.after]),
  ].join("\n");
  const ui = [
    readFileSync(join(appDir, "src/app/sdk/playground/Playground.tsx"), "utf8"),
    readFileSync(join(appDir, "src/app/sdk/playground/page.tsx"), "utf8"),
  ].join("\n");
  for (const [what, re] of [
    ["an em dash", /—/],
    ["anonymous or untraceable", /\banonym|untraceable/i],
    ["audited", /\baudited\b/i],
    ["a gloss on mainnet or testnet", /real money|play money|test money|no real value/i],
    ["first or only", /\b(the )?(first|only) (private|privacy)\b/i],
  ] as const) {
    assert.ok(!re.test(text), `scenario copy has no ${what}`);
    assert.ok(!re.test(ui), `playground UI has no ${what}`);
  }
  assert.ok(ui.includes("Simulation, no real funds"), "labelled as a simulation");
  assert.ok(ui.includes("/docs/privacy-model"), "the footnote links the privacy model");
});

console.log(`\n${passed} passed`);
