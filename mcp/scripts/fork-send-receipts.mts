/**
 * Sends that may have landed, end to end on a Base Sepolia fork: the MCP
 * server's own tools with its real signer, provers and tree sync, against the
 * real Gloam vault (0x39e2…0194, final keys), with the agents' wallets sending
 * (no relay). The RPC in front of the fork fails on purpose:
 *
 *   - a receipt wait that throws (HTTP 429) after the transaction was sent
 *   - a broadcast whose reply is lost (HTTP 504 after the node took it)
 *
 * Either way the transaction lands, so the change and the payment (or the
 * deposit, or the payee's swept note) must be kept, pending, until a refresh
 * settles them, and the spend must count against the limits.
 *
 *   BASE_SEPOLIA_RPC_URL=https://sepolia.base.org pnpm --filter @gloamtrade/mcp test:fork
 *
 * Skipped without BASE_SEPOLIA_RPC_URL or without anvil. Fresh keys are made
 * and funded inside the fork; nothing is sent to a live network. The first
 * read of the vault scans its logs 200 blocks at a time, which takes a few
 * minutes against sepolia.base.org.
 */
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { cpSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { keccak256, parseUnits, type Address, type Hex } from "viem";
import { findAnvil, startFork, startProxy, type Fork } from "./fork/harness.mjs";

type Env = Record<string, string | undefined>;

const UPSTREAM = process.env.BASE_SEPOLIA_RPC_URL?.trim();
const SKIP = !UPSTREAM ? "set BASE_SEPOLIA_RPC_URL to run the fork test" : !findAnvil() ? "anvil not found" : false;
/** Holds Circle's test USDC on Base Sepolia; impersonated inside the fork only. */
const USDC_HOLDER = (process.env.GLOAM_FORK_USDC_HOLDER?.trim() || "0xfaec9cdc3ef75713b48f46057b98ba04885e3391") as Address;
const log = (m: string) => console.log(`  [fork] ${m}`);

// The server reads its RPC and artifact paths when it loads: the flaky RPC and a copy of the repo's circuits go in first.
const proxy = SKIP ? null : await startProxy();
if (proxy) {
  process.env.GLOAM_RPC_URL_84532 = proxy.url;
  const circuits = mkdtempSync(join(tmpdir(), "gloam-fork-circuits-"));
  cpSync(join(dirname(fileURLToPath(import.meta.url)), "..", "..", "app", "public", "circuits"), circuits, { recursive: true });
  process.env.GLOAM_ARTIFACTS_DIR = circuits;
  process.env.GLOAM_ARTIFACTS_SOURCE = "http://127.0.0.1:1/never";
}
const { createGloamServer } = await import("../src/server.js");
const { openNoteStore } = await import("../src/noteStore.js");
const { BASE_SEPOLIA_USDC, POOL_STATE_ABI, testnetNetwork } = await import("@gloamtrade/sdk");
const POOL = testnetNetwork("base")!.pool;
const usdc = (v: string) => parseUnits(v, 6);

let fork: Fork;

before(async () => {
  if (SKIP) return;
  fork = await startFork({ upstream: UPSTREAM!, chainId: 84532, proxy: proxy!, log });
  // One slow pass over the vault's logs (200 blocks a request), cached by the proxy for every tool call after it.
  const t = Date.now();
  const res = await fetch(fork.url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_getLogs", params: [{ address: POOL, fromBlock: `0x${testnetNetwork("base")!.deployBlock.toString(16)}`, toBlock: "latest" }] }),
  });
  const logs = ((await res.json()) as { result?: unknown[] }).result;
  assert.ok(Array.isArray(logs), "the vault's logs read through the fork");
  log(`read the vault's ${logs.length} logs (${Date.now() - t} ms)`);
});

after(async () => {
  await fork?.stop();
  // snarkjs keeps its curve's worker threads alive
  await (globalThis as { curve_bn128?: { terminate?: () => Promise<void> } }).curve_bn128?.terminate?.();
});

async function connect(env: Env) {
  const server = createGloamServer({ env });
  const [a, b] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "gloam-fork", version: "0" });
  await Promise.all([server.connect(a), client.connect(b)]);
  return async (name: string, args: Record<string, unknown> = {}) => {
    // proving and the first tree scan take longer than the MCP client's default minute
    const r = await client.callTool({ name, arguments: args }, undefined, { timeout: 15 * 60_000 });
    return JSON.parse((r.content as { type: string; text: string }[])[0]!.text);
  };
}

/** A fresh agent on the fork: its own key (with gas), note store and spending log. */
async function party(name: string, extra: Env = {}, fundUsdc?: string) {
  const { key, address } = await fork.newKey();
  if (fundUsdc) await fork.sendFromHolder(BASE_SEPOLIA_USDC, USDC_HOLDER, address, usdc(fundUsdc));
  const dir = mkdtempSync(join(tmpdir(), `gloam-fork-${name}-`));
  const env: Env = {
    GLOAM_AGENT_ID: name,
    GLOAM_AGENT_PRIVATE_KEY: key,
    GLOAM_NOTE_STORE: join(dir, "notes.json"),
    GLOAM_SPEND_LOG: join(dir, "spend.json"),
    GLOAM_NETWORK: "base",
    ...extra,
  };
  return { env, address, call: await connect(env), notes: () => openNoteStore(env).list() };
}

const PAYER_LIMITS: Env = {
  GLOAM_LIMIT_NETWORK: "base",
  GLOAM_LIMIT_ASSETS: "USDC",
  GLOAM_LIMIT_MAX_PER_PAYMENT: "25",
  GLOAM_LIMIT_MAX_PER_DAY: "100",
  GLOAM_LIMIT_RECIPIENTS: "any",
  GLOAM_LIMIT_TOOLS: "pay,shield",
};

/** Run `fn` with the RPC failing as asked, and always put it back. */
async function withFaults<T>(faults: Partial<Fork["faults"]>, fn: () => Promise<T>): Promise<T> {
  Object.assign(fork.faults, faults);
  try {
    return await fn();
  } finally {
    Object.assign(fork.faults, { failReceipts: 0, loseSends: 0, loseSendsTo: undefined });
  }
}

const read = (functionName: "isSpent" | "commitmentSeen", arg: Hex) =>
  fork.client.readContract({ address: POOL, abi: POOL_STATE_ABI, functionName, args: [arg] }) as Promise<boolean>;

/** A payer holding one 20 USDC note and a payee asking 3 USDC for a resource. */
async function setup(tag: string) {
  const payer = await party(`payer-${tag}`, PAYER_LIMITS, "20");
  const payee = await party(`payee-${tag}`, { GLOAM_LIMITS: "off" });
  let t = Date.now();
  const shield = await payer.call("gloam_execute_shield", { amount: 20, network: "base", asset: BASE_SEPOLIA_USDC });
  assert.equal(shield.status, "confirmed", JSON.stringify(shield));
  log(`${tag}: shielded 20 USDC (${Date.now() - t} ms)`);
  const priced = await payee.call("gloam_payment_requirements", { amount: 3, resource: `https://example.test/${tag}`, network: "base" });
  assert.ok(priced.encoded, JSON.stringify(priced));
  return { payer, payee, priced, input: shield.note.handle as string };
}

function byOrigin<T extends { origin: string }>(notes: T[], origin: string): T[] {
  return notes.filter((n) => n.origin === origin);
}

/** The spend log's view of the payment: it must count against the limits (pending, sent or unconfirmed). */
async function payEntry(call: Awaited<ReturnType<typeof connect>>) {
  const report = await call("gloam_get_spending_report", { recent: 10 });
  const pay = report.recentPayments.find((e: { tool: string }) => e.tool === "pay");
  const usdcToday = report.today.find((x: { symbol: string }) => x.symbol === "USDC");
  return { status: pay?.status as string, spentToday: usdcToday?.spentToday as string };
}

/** What the store holds, for assertion messages. */
const holds = (notes: { origin: string; status: string; amountWei: string }[]) =>
  JSON.stringify(notes.map((n) => `${n.origin} ${Number(n.amountWei) / 1e6} ${n.status}`));

/** After the payer's send went out with no clear answer: what it kept, and that a refresh settles it with nothing lost. */
async function assertKeptAndSettles(r: Awaited<ReturnType<typeof setup>>, paid: Record<string, any>, sentHash: Hex) {
  // The transfer is on chain: the 20 note is spent, and the 17 change and the 3 payment exist.
  assert.equal((await fork.client.waitForTransactionReceipt({ hash: sentHash })).status, "success", "the transfer landed");
  const kept = r.payer.notes();
  const [change] = byOrigin(kept, "change");
  const [payment] = byOrigin(kept, "payment");
  assert.equal(change?.status, "pending", `the 17 USDC change is kept: the transfer landed, and the store holds ${holds(kept)}`);
  assert.equal(change?.amountWei, usdc("17").toString());
  assert.equal(await read("commitmentSeen", change!.commitment), true);
  assert.equal(payment?.status, "pending", `the payee's 3 USDC is kept until it is handed over: ${holds(kept)}`);
  assert.equal(kept.find((n) => n.handle === r.input)?.status, "pending", "the 20 USDC note stays reserved, not spendable again");

  assert.equal(paid.status, "error", JSON.stringify(paid));
  assert.equal(paid.hash, sentHash, "the result names the transaction that went out");
  assert.match(paid.check ?? "", /refresh/, JSON.stringify(paid));
  assert.match(paid.paymentHeader ?? "", /^gloamx402pay1:/, "the sealed payment comes back, to present once it lands");

  // It counts against the limits: 20 shielded plus the 3 that may have moved.
  const entry = await payEntry(r.payer.call);
  assert.equal(entry.status, "unconfirmed", JSON.stringify(entry));
  assert.equal(entry.spentToday, "23");

  const list = await r.payer.call("gloam_list_notes", { refresh: true });
  assert.ok(list.refreshed.some((x: string) => x.includes(`${change!.handle}: confirmed`)), JSON.stringify(list.refreshed));
  assert.ok(list.refreshed.some((x: string) => x.includes(`${payment!.handle}: payment landed`)), JSON.stringify(list.refreshed));
  assert.equal(list.balances.find((b: { symbol: string }) => b.symbol === "USDC")?.spendable, "17", JSON.stringify(list.balances));

  const t = Date.now();
  const v = await r.payee.call("gloam_verify_payment", { requirements: r.priced.encoded, payment: paid.paymentHeader });
  assert.equal(v.status, "settled", JSON.stringify(v));
  assert.equal(v.grantAccess, true);
  const payeeBal = (await r.payee.call("gloam_list_notes", {})).balances.find((b: { symbol: string }) => b.symbol === "USDC");
  assert.equal(payeeBal?.spendable, "3", "the payee holds the 3 USDC");
  log(`swept by the payee (${Date.now() - t} ms)`);
}

test("wallet send: the receipt wait throws after the transfer landed; change and payment are kept and settle", { skip: SKIP, timeout: 30 * 60_000 }, async () => {
  const r = await setup("receipt");
  const t = Date.now();
  const paid = await withFaults({ failReceipts: Infinity }, () => r.payer.call("gloam_execute_private_pay", { requirements: r.priced.encoded }));
  log(`pay with receipts failing: ${paid.status}, ${paid.error?.slice(0, 80)} (${Date.now() - t} ms)`);
  await assertKeptAndSettles(r, paid, paid.hash);
});

test("wallet send: the reply to the broadcast is lost; change and payment are kept and settle", { skip: SKIP, timeout: 30 * 60_000 }, async () => {
  const r = await setup("lost-send");
  const t = Date.now();
  const paid = await withFaults({ loseSends: 1 }, () => r.payer.call("gloam_execute_private_pay", { requirements: r.priced.encoded }));
  log(`pay with the broadcast reply lost: ${paid.status}, ${String(paid.error).slice(0, 80)} (${Date.now() - t} ms)`);
  assert.equal(fork.lostSends.length, 1, "the node took the transfer");
  await assertKeptAndSettles(r, paid, keccak256(fork.lostSends.at(-1)!));
});

test("wallet deposit: the reply to shieldBound's broadcast is lost; the note is kept and settles", { skip: SKIP, timeout: 30 * 60_000 }, async () => {
  const payer = await party("payer-lost-shield", PAYER_LIMITS, "20");
  const before = fork.lostSends.length;
  const shield = await withFaults({ loseSends: 1, loseSendsTo: POOL }, () =>
    payer.call("gloam_execute_shield", { amount: 20, network: "base", asset: BASE_SEPOLIA_USDC })
  );
  log(`shield with the broadcast reply lost: ${shield.status}, ${String(shield.error).slice(0, 80)}`);
  assert.equal(fork.lostSends.length, before + 1, "the node took shieldBound");
  const sent = keccak256(fork.lostSends.at(-1)!);
  const receipt = await fork.client.waitForTransactionReceipt({ hash: sent });
  assert.equal(receipt.status, "success", "the deposit landed");
  const kept = payer.notes();
  assert.equal(kept[0]?.status, "pending", `the deposited note is kept: 20 USDC went into the vault, and the store holds ${holds(kept)}`);
  assert.equal(await read("commitmentSeen", kept[0]!.commitment), true);
  assert.equal(shield.status, "error", JSON.stringify(shield));
  assert.equal(shield.hash, sent);
  const spend = (await payer.call("gloam_get_spending_report", {})).recentPayments[0];
  assert.equal(spend.status, "unconfirmed", "the deposit counts against the limits");
  const list = await payer.call("gloam_list_notes", { refresh: true });
  assert.equal(list.balances.find((b: { symbol: string }) => b.symbol === "USDC")?.spendable, "20", JSON.stringify(list));
});

/** A paid payment, then the payee's sweep sent while blocks are held back, so it sits in the mempool when the send's trouble surfaces. */
async function sweepWhileHeld(tag: string, faults: Partial<Fork["faults"]>) {
  const r = await setup(tag);
  const paid = await r.payer.call("gloam_execute_private_pay", { requirements: r.priced.encoded });
  assert.equal(paid.status, "paid", JSON.stringify(paid));
  await fork.setAutomine(false);
  let v: Record<string, any>;
  try {
    v = await withFaults(faults, () => r.payee.call("gloam_verify_payment", { requirements: r.priced.encoded, payment: paid.paymentHeader }));
  } finally {
    await fork.mine();
    await fork.setAutomine(true);
  }
  log(`${tag}: verify while the sweep is in the mempool: ${v.status}`);
  assert.equal(v.grantAccess, false, "not final yet");
  // The block is mined: the payment note is spent by the sweep, so the fresh note is the payee's 3 USDC.
  const paymentNullifier = byOrigin(r.payer.notes(), "payment")[0]!.nullifier;
  assert.equal(await read("isSpent", paymentNullifier), true, "the sweep landed once the block was mined");
  const kept = r.payee.notes();
  const [fresh] = byOrigin(kept, "received");
  assert.equal(fresh?.status, "pending", `the payee's fresh note is kept: the sweep landed, and the payee's store holds ${holds(kept)} (verify said ${v.status})`);
  assert.equal(await read("commitmentSeen", fresh!.commitment), true);
  assert.equal(v.status, "unconfirmed", JSON.stringify(v));
  const list = await r.payee.call("gloam_list_notes", { refresh: true });
  assert.ok(list.refreshed.some((x: string) => x.includes(`${fresh!.handle}: confirmed`)), JSON.stringify(list.refreshed));
  assert.equal(list.balances.find((b: { symbol: string }) => b.symbol === "USDC")?.spendable, "3", "the payee holds the 3 USDC");
}

test("wallet sweep: the receipt wait throws while the sweep is pending; the fresh note is kept", { skip: SKIP, timeout: 30 * 60_000 }, async () => {
  await sweepWhileHeld("sweep-receipt", { failReceipts: Infinity });
});

test("wallet sweep: the reply to the sweep's broadcast is lost while it is pending; the fresh note is kept", { skip: SKIP, timeout: 30 * 60_000 }, async () => {
  await sweepWhileHeld("sweep-lost-send", { loseSends: 1 });
});

