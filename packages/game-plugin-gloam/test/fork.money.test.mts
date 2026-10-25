/**
 * Money safety on a Base Sepolia fork: what happens to the notes when a send
 * goes out and its answer is lost (a receipt wait that gives up, a smart
 * wallet that throws after submitting), when a Gloam address is not a real key,
 * and when someone posts a payment message that can never be swept.
 *
 * The wallet here broadcasts the last call of a batch and then throws, with
 * the fork's automine off so the transaction is still in the mempool when the
 * agent decides what to keep. Then the block is mined: whatever the agent kept
 * must be enough to find the money again.
 *
 *   BASE_SEPOLIA_RPC_URL=https://sepolia.base.org pnpm --filter @gloamtrade/game-plugin-gloam test:fork
 *
 * GLOAM_FORK_CACHE names a folder for the vault leaf cache (public data) so
 * reruns skip the first long read of the vault.
 */
import { after, afterEach, before, test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  BASE_SEPOLIA_USDC,
  POOL_TRANSFER_ABI,
  artifactProver,
  buildPrivateSendIntent,
  encodeNotePackage,
  payMemoBoardFor,
  sealToReceiveTag,
} from "@gloamtrade/sdk";
import { createWalletClient, encodeFunctionData, http, parseUnits, toHex, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { GloamAgent, shutdownProver, walletCallSender, type Call, type CallSender, type LimitsConfig } from "../src/index.ts";
import { Artifacts } from "../src/artifacts.ts";
import { findAnvil, startFork, type Fork } from "./fork/harness.mts";

const UPSTREAM = process.env.BASE_SEPOLIA_RPC_URL?.trim();
const SKIP = !UPSTREAM ? "set BASE_SEPOLIA_RPC_URL to run the fork test" : !findAnvil() ? "anvil not found" : false;
const USDC_HOLDER = (process.env.GLOAM_FORK_USDC_HOLDER?.trim() || "0xfaec9cdc3ef75713b48f46057b98ba04885e3391") as Address;
const CIRCUITS = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "app", "public", "circuits");
const CACHE = process.env.GLOAM_FORK_CACHE?.trim() || join(tmpdir(), "gloam-fork-vault-cache");
const usdc = (v: string) => parseUnits(v, 6);
const log = (m: string) => console.log(`  [money] ${m}`);
const LIMITS: LimitsConfig = { recipients: "any", assets: { USDC: { maxPerPayment: "25", maxPerDay: "100" } } };
/** The SPKI header of a P-256 key with 64 bytes that are not a point on the curve. */
const BAD_TAG = "gloamr1." + Buffer.from("3059301306072a8648ce3d020106082a8648ce3d03010703420004" + "01".repeat(64), "hex").toString("base64url");

let fork: Fork;
let chain: { id: number; name: string; nativeCurrency: { name: string; symbol: string; decimals: number }; rpcUrls: { default: { http: string[] } } };

/** A wallet that, when armed, broadcasts the last call of the next batch into the mempool and then throws. */
type Flaky = CallSender & { arm: () => void; broadcast: Hex[] };
function flakySender(key: Hex): Flaky {
  const wallet = createWalletClient({ account: privateKeyToAccount(key), chain, transport: http(fork.url) });
  const honest = walletCallSender(wallet as never, fork.client);
  let armed = false;
  const broadcast: Hex[] = [];
  return {
    address: wallet.account.address,
    broadcast,
    arm: () => void (armed = true),
    async sendCalls(calls: Call[]) {
      if (!armed) return honest.sendCalls(calls);
      armed = false;
      if (calls.length > 1) {
        const first = await honest.sendCalls(calls.slice(0, -1));
        await fork.client.waitForTransactionReceipt({ hash: first });
      }
      const c = calls[calls.length - 1]!;
      await fork.rpc("evm_setAutomine", [false]);
      const hash = await wallet.sendTransaction({ to: c.to, data: c.data, value: c.value ?? 0n, chain, account: wallet.account });
      broadcast.push(hash);
      throw new Error("HTTP request failed. Status: 429 (the receipt wait gave up)");
    },
  };
}

/** Mine what is waiting and turn automine back on. */
async function mine() {
  await fork.rpc("evm_mine", []);
  await fork.rpc("evm_setAutomine", [true]);
}

async function agentFor(name: string, opts: { usdc?: string; flaky?: boolean } = {}) {
  const k = await fork.newKey();
  if (opts.usdc) await fork.sendFromHolder(BASE_SEPOLIA_USDC, USDC_HOLDER, k.address, usdc(opts.usdc));
  const dir = mkdtempSync(join(tmpdir(), `gloam-money-${name}-`));
  const sender = opts.flaky ? flakySender(k.key) : undefined;
  const agent = new GloamAgent({
    network: "base",
    rpc: fork.url,
    submit: "wallet",
    agentId: name,
    dataDir: CACHE,
    env: { GLOAM_AGENT_PRIVATE_KEY: k.key, GLOAM_NOTE_STORE: join(dir, "notes.json"), GLOAM_SPEND_LOG: join(dir, "spend.json") },
    artifacts: { dir: CIRCUITS, url: "http://127.0.0.1:1/never" },
    limits: LIMITS,
    ...(sender ? { sender } : {}),
  });
  return { agent, sender: sender as Flaky, key: k.key, address: k.address };
}

const view = (a: GloamAgent) => a.notes().map((n) => `${n.origin}:${n.amount}:${n.status}`).sort();
const spendable = async (a: GloamAgent) => ((await a.balance()).privateBalance as { spendable: string }[])[0]?.spendable ?? "0";
const usedToday = (a: GloamAgent) => (a.limitsReport() as { assets?: { usedLast24h: string }[] }).assets?.[0]?.usedLast24h;

before(async () => {
  if (SKIP) return;
  mkdirSync(CACHE, { recursive: true });
  fork = await startFork({ upstream: UPSTREAM!, chainId: 84532, log });
  chain = { id: 84532, name: "fork", nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 }, rpcUrls: { default: { http: [fork.url] } } };
});

// A test that fails before it mines must not leave the fork with automine off for the next one.
afterEach(async () => {
  if (SKIP || !fork) return;
  await fork.rpc("evm_setAutomine", [true]).catch(() => undefined);
  await fork.rpc("evm_mine", []).catch(() => undefined);
});

after(async () => {
  await shutdownProver();
  await fork?.stop();
});

test("a deposit whose answer is lost keeps its note, and refresh finds the money", { skip: SKIP, timeout: 15 * 60_000 }, async () => {
  const { agent, sender } = await agentFor("money-add", { usdc: "30", flaky: true });
  sender.arm();
  const out = await agent.add({ amount: "10" });
  assert.notEqual(out.status, "done");
  assert.match(String(out.check ?? out.message), /refresh/i, JSON.stringify(out));
  assert.deepEqual(view(agent), ["shield:10:pending"], "the note is kept while the deposit may still land");
  await mine();
  const r = await fork.client.getTransactionReceipt({ hash: sender.broadcast[0]! });
  assert.equal(r.status, "success", "the deposit landed");
  await agent.refresh();
  assert.deepEqual(view(agent), ["shield:10:unspent"]);
  assert.equal(await spendable(agent), "10");
  log(`deposit ${sender.broadcast[0]} landed after its answer was lost; the note was kept and refresh made it spendable`);
});

test("a private payment whose answer is lost keeps every note, counts against the cap, blocks a second try, and is delivered once it lands", { skip: SKIP, timeout: 20 * 60_000 }, async () => {
  const { agent: alice, sender } = await agentFor("money-pay", { usdc: "30", flaky: true });
  const { agent: bob } = await agentFor("money-payee");
  assert.equal((await alice.add({ amount: "20" })).status, "done");
  const bobTag = await bob.address();
  sender.arm();
  const out = await alice.pay({ to: bobTag, amount: "3", note: "inv-9" });
  assert.notEqual(out.status, "done", JSON.stringify(out));
  assert.match(String(out.check), /refresh/i, JSON.stringify(out));
  // Nothing is forgotten: the input may be spent, the change and the payment may exist.
  assert.deepEqual(view(alice), ["change:17:pending", "payment:3:pending", "shield:20:pending"], "every note is kept while the payment may still land");
  assert.equal(usedToday(alice), "3", "a payment that may have gone out counts against the cap");
  // The same payment again is refused while the first one is unconfirmed.
  const again = await alice.pay({ to: bobTag, amount: "3", note: "inv-9" });
  assert.notEqual(again.status, "done");
  assert.match(String(again.message), /confirm/i, JSON.stringify(again));
  assert.equal(sender.broadcast.length, 1, "nothing else was sent");
  await mine();
  assert.equal((await fork.client.getTransactionReceipt({ hash: sender.broadcast[0]! })).status, "success", "the transfer landed");
  await alice.refresh();
  assert.deepEqual(view(alice), ["change:17:unspent", "payment:3:spent", "shield:20:spent"]);
  assert.equal(await spendable(alice), "17");
  // Refresh posted the sealed payment message, so bob finds the money.
  const got = (await bob.checkIncoming()).received as { amount: string; status: string; note: string }[];
  assert.deepEqual(got.map((g) => [g.amount, g.status, g.note]), [["3 USDC", "swept", "inv-9"]]);
  log("payment landed after its answer was lost: change kept, cap counted, second try refused, payee found it");

  // A cash out that splits the note first: the split's answer is lost too.
  sender.arm();
  const carol = (await fork.newKey(0n)).address;
  const split = await alice.cashOut({ amount: "5", to: carol });
  assert.notEqual(split.status, "done");
  assert.deepEqual(view(alice), ["change:12:pending", "change:17:pending", "change:5:pending", "payment:3:spent", "shield:20:spent"], "the split keeps its notes");
  await mine();
  await alice.refresh();
  assert.deepEqual(view(alice), ["change:12:unspent", "change:17:spent", "change:5:unspent", "payment:3:spent", "shield:20:spent"]);
  assert.equal(await spendable(alice), "17");
  log("cash-out split landed after its answer was lost; both halves kept");
});

test("a sweep still in the mempool when its answer is lost keeps the fresh note", { skip: SKIP, timeout: 15 * 60_000 }, async () => {
  const { agent: alice } = await agentFor("money-sweep-payer", { usdc: "10" });
  const { agent: bob, sender } = await agentFor("money-sweep", { flaky: true });
  assert.equal((await alice.add({ amount: "5" })).status, "done");
  assert.equal((await alice.pay({ to: await bob.address(), amount: "2" })).status, "done");
  sender.arm();
  const got = (await bob.checkIncoming()).received as { status: string }[];
  assert.notEqual(got[0]?.status, "swept");
  assert.deepEqual(view(bob), ["received:2:pending"], "the fresh note is kept while the sweep may still land");
  await mine();
  await bob.refresh();
  assert.deepEqual(view(bob), ["received:2:unspent"]);
  assert.equal(await spendable(bob), "2");
  log("sweep landed after its answer was lost; the fresh note was kept");
});

test("a Gloam address that is not a P-256 key is refused before any money moves", { skip: SKIP, timeout: 10 * 60_000 }, async () => {
  const { agent } = await agentFor("money-badtag", { usdc: "10" });
  assert.equal((await agent.add({ amount: "8" })).status, "done");
  await assert.rejects(agent.pay({ to: BAD_TAG, amount: "4" }), /Gloam address/);
  await assert.rejects(agent.payByClaimLink({ amount: "4", sealTo: BAD_TAG }), /Gloam address/);
  assert.deepEqual(view(agent), ["shield:8:unspent"], "the note was not touched");
  assert.equal(usedToday(agent), "0");
});

test("a payment message that can never be swept is recorded and skipped, not scanned forever", { skip: SKIP, timeout: 20 * 60_000 }, async () => {
  const { agent: mallory, key } = await agentFor("money-mallory", { usdc: "5" });
  const { agent: alice } = await agentFor("money-honest", { usdc: "5" });
  const { agent: bob } = await agentFor("money-target");
  const bobTag = await bob.address();
  assert.equal((await mallory.add({ amount: "2" })).status, "done");
  // Mallory spends its whole note to itself, which leaves a zero-value change note in the vault, and
  // posts that note to bob's address: in the vault, unspent, sealed to bob, worth nothing.
  const note = mallory.store.list()[0]!;
  const vault = await mallory.syncVault();
  const path = await vault.pathForCommitment(note.commitment);
  const prove = artifactProver(await new Artifacts({ dir: CIRCUITS }).paths("transfer", mallory.network.ceremony));
  const intent = await buildPrivateSendIntent({ secretHex: note.secret, amountInWei: BigInt(note.amountWei), amountPayWei: BigInt(note.amountWei), asset: note.asset, path: path!, prove, poolAddress: mallory.network.pool, chainId: 84532 });
  const wallet = createWalletClient({ account: privateKeyToAccount(key), chain, transport: http(fork.url) });
  const send = async (to: Address, data: Hex) => {
    const hash = await wallet.sendTransaction({ to, data, chain, account: wallet.account });
    assert.equal((await fork.client.waitForTransactionReceipt({ hash })).status, "success");
    return hash;
  };
  await send(mallory.network.pool, encodeFunctionData({ abi: POOL_TRANSFER_ABI, functionName: "transfer", args: intent.exec.args as never }));
  const zero = encodeNotePackage({ pool: mallory.network.pool, chainId: 84532, asset: note.asset, amountWei: "0", secret: intent.changeNote.secret, commitment: intent.changeNote.commitment });
  const board = payMemoBoardFor(84532)!;
  const memo = toHex(new TextEncoder().encode(await sealToReceiveTag(zero, bobTag)));
  await send(board.address, encodeFunctionData({
    abi: [{ type: "function", name: "postMemo", stateMutability: "nonpayable", inputs: [{ name: "c", type: "bytes32" }, { name: "m", type: "bytes" }], outputs: [] }] as const,
    functionName: "postMemo",
    args: [intent.changeNote.commitment, memo],
  }));
  const memoBlock = await fork.client.getBlockNumber();
  // A real payment after it.
  assert.equal((await alice.add({ amount: "3" })).status, "done");
  assert.equal((await alice.pay({ to: bobTag, amount: "1" })).status, "done");

  const first = (await bob.checkIncoming()).received as { status: string; amount: string }[];
  assert.deepEqual(first.map((r) => r.status).sort(), ["bad_note", "swept"], JSON.stringify(first));
  assert.ok((bob.store.scanFrom(84532) ?? 0n) > memoBlock, "the scan moved past the bad message");
  const second = (await bob.checkIncoming()).received as { status: string }[];
  assert.deepEqual(second, [], "the bad message is not read again");
  assert.equal(await spendable(bob), "1");
  log("a zero-value payment message was recorded as bad_note once and skipped after");
});
