/**
 * Retries on a Base Sepolia fork: a payment, a claim link sealed to an
 * address, a cash out and a sweep whose answers were lost, tried again, and an
 * hour going by in between. None of them may move the money twice, and a
 * sweep that never landed must be tried again.
 *
 * The private sends go through relayer keys, like the Gloam relay: when armed,
 * the next one is signed by relayer 1 and held (its answer lost), to be
 * broadcast late or never; later ones go through relayer 2.
 *
 *   BASE_SEPOLIA_RPC_URL=https://sepolia.base.org pnpm --filter @gloamtrade/game-plugin-gloam test:fork
 */
import { after, afterEach, before, test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { BASE_SEPOLIA_USDC, POOL_STATE_ABI, POOL_TRANSFER_ABI } from "@gloamtrade/sdk";
import { createWalletClient, encodeFunctionData, formatUnits, http, parseUnits, toFunctionSelector, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { GloamAgent, shutdownProver, walletCallSender, type Call, type CallSender, type LimitsConfig } from "../src/index.ts";
import { ERC20, findAnvil, startFork, type Fork } from "./fork/harness.mts";

const UPSTREAM = process.env.BASE_SEPOLIA_RPC_URL?.trim();
const SKIP = !UPSTREAM ? "set BASE_SEPOLIA_RPC_URL to run the fork test" : !findAnvil() ? "anvil not found" : false;
const HOLDER = (process.env.GLOAM_FORK_USDC_HOLDER?.trim() || "0xfaec9cdc3ef75713b48f46057b98ba04885e3391") as Address;
const CIRCUITS = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "app", "public", "circuits");
const CACHE = process.env.GLOAM_FORK_CACHE?.trim() || join(tmpdir(), "gloam-fork-vault-cache");
const LIMITS: LimitsConfig = { recipients: "any", assets: { USDC: { maxPerPayment: "25", maxPerDay: "100" } } };
const log = (m: string) => console.log(`  [retry] ${m}`);

let fork: Fork;
let chain: { id: number; name: string; nativeCurrency: { name: string; symbol: string; decimals: number }; rpcUrls: { default: { http: string[] } } };
const realNow = Date.now.bind(Date);

const UNSHIELD_SELECTOR = toFunctionSelector("unshield(bytes,bytes32,bytes32,address,address,uint256)");
const TRANSFER_SELECTOR = toFunctionSelector((POOL_TRANSFER_ABI as readonly { type: string; name?: string }[]).find((x) => x.type === "function" && x.name === "transfer") as never);

/**
 * Deposits from the agent's own key; private sends (transfers and cash outs) from relayer keys. When armed, the
 * next private send is signed by relayer 1 and held, and the wallet answers that it may have been sent.
 */
function relayLike(agentKey: Hex, r1: Hex, r2: Hex) {
  const own = createWalletClient({ account: privateKeyToAccount(agentKey), chain, transport: http(fork.url) });
  const honest = walletCallSender(own as never, fork.client);
  const rel = [r1, r2].map((k) => createWalletClient({ account: privateKeyToAccount(k), chain, transport: http(fork.url) }));
  const state = { armed: false, held: [] as Hex[], sent: [] as Hex[] };
  const sender: CallSender = {
    address: own.account.address,
    async sendCalls(calls: Call[]) {
      const c = calls[calls.length - 1]!;
      const sel = c.data.slice(0, 10).toLowerCase();
      const isPrivate = calls.length === 1 && (sel === TRANSFER_SELECTOR.toLowerCase() || sel === UNSHIELD_SELECTOR.toLowerCase());
      if (!isPrivate) return honest.sendCalls(calls);
      if (state.armed) {
        state.armed = false;
        const w = rel[0]!;
        const req = await w.prepareTransactionRequest({ account: w.account, chain, to: c.to, data: c.data, value: 0n });
        state.held.push(await w.signTransaction(req as never));
        throw new Error("The relay did not answer in time. It may have been sent.");
      }
      const w = rel[1]!;
      const h = await w.sendTransaction({ account: w.account, chain, to: c.to, data: c.data, value: 0n });
      state.sent.push(h);
      return h;
    },
  };
  return { sender, state };
}

async function agentWith(name: string, usdc?: string, senderFor?: (key: Hex) => CallSender) {
  const k = await fork.newKey();
  const r1 = await fork.newKey();
  const r2 = await fork.newKey();
  if (usdc) await fork.sendFromHolder(BASE_SEPOLIA_USDC, HOLDER, k.address, parseUnits(usdc, 6));
  const { sender, state } = relayLike(k.key, r1.key, r2.key);
  const dir = mkdtempSync(join(tmpdir(), `gloam-retry-${name}-`));
  const agent = new GloamAgent({
    network: "base",
    rpc: fork.url,
    submit: "wallet",
    agentId: name,
    dataDir: CACHE,
    env: { GLOAM_AGENT_PRIVATE_KEY: k.key, GLOAM_NOTE_STORE: join(dir, "notes.json"), GLOAM_SPEND_LOG: join(dir, "spend.json") },
    artifacts: { dir: CIRCUITS, url: "http://127.0.0.1:1/never" },
    limits: LIMITS,
    sender: senderFor ? senderFor(k.key) : sender,
  });
  return { agent, state };
}

const later = (ms: number) => {
  Date.now = () => realNow() + ms;
};
const spendable = async (a: GloamAgent) => ((await a.balance()).privateBalance as { asset: string; spendable: string }[]).find((b) => b.asset === "USDC")?.spendable ?? "0";

before(async () => {
  if (SKIP) return;
  mkdirSync(CACHE, { recursive: true });
  fork = await startFork({ upstream: UPSTREAM!, chainId: 84532, log });
  chain = { id: 84532, name: "fork", nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 }, rpcUrls: { default: { http: [fork.url] } } };
});

afterEach(async () => {
  Date.now = realNow;
  if (SKIP || !fork) return;
  await fork.rpc("evm_setAutomine", [true]).catch(() => undefined);
  await fork.rpc("evm_mine", []).catch(() => undefined);
});

after(async () => {
  await shutdownProver();
  await fork?.stop();
});

test("an hour after a payment's answer was lost, paying it again spends the same note, so the payee is paid once", { skip: SKIP, timeout: 20 * 60_000 }, async () => {
  const { agent: alice, state } = await agentWith("retry-alice", "40");
  const { agent: bob } = await agentWith("retry-bob");
  const bobTag = await bob.address();
  assert.equal((await alice.add({ amount: "20" })).status, "done");
  state.armed = true;
  assert.equal((await alice.pay({ to: bobTag, amount: "3", note: "inv-77" })).status, "unconfirmed");
  assert.equal((await alice.add({ amount: "5" })).status, "done");
  assert.equal((await alice.pay({ to: bobTag, amount: "3", note: "inv-77" })).code, "unconfirmed_payment", "refused within the hour");
  later(61 * 60_000);
  await alice.refresh();
  const again = await alice.pay({ to: bobTag, amount: "3", note: "inv-77" });
  log(`pay again after an hour: ${again.status} ${again.code ?? ""}`);
  // Relayer 1's transaction turns up late. Only one of the two can land: they spend the same note.
  const late = await fork.client.sendRawTransaction({ serializedTransaction: state.held[0]! });
  const lateStatus = (await fork.client.waitForTransactionReceipt({ hash: late })).status;
  log(`relayer 1's held transfer lands late: ${lateStatus}`);
  await alice.refresh();
  const got = (await bob.checkIncoming()).received as { amount: string; status: string; note: string }[];
  assert.deepEqual(got.map((g) => [g.amount, g.status, g.note]), [["3 USDC", "swept", "inv-77"]], "the payee is paid once");
  assert.equal(await spendable(alice), "22", "20 + 5 - 3");
  assert.ok(!alice.notes().some((n) => n.status === "pending"), JSON.stringify(alice.notes()));
});

test("a claim link sealed to an address whose answer was lost is not sent again while it may land", { skip: SKIP, timeout: 20 * 60_000 }, async () => {
  const { agent: alice, state } = await agentWith("retry-claim", "20");
  const { agent: bob } = await agentWith("retry-claim-bob");
  const bobTag = await bob.address();
  assert.equal((await alice.add({ amount: "5" })).status, "done");
  assert.equal((await alice.add({ amount: "5" })).status, "done");
  state.armed = true;
  assert.equal((await alice.payByClaimLink({ amount: "2", sealTo: bobTag, note: "gift" })).status, "unconfirmed");
  const again = await alice.payByClaimLink({ amount: "2", sealTo: bobTag, note: "gift" });
  assert.equal(again.code, "unconfirmed_payment", JSON.stringify(again));
  assert.equal(state.sent.length, 0, "nothing else went out");
  await fork.client.waitForTransactionReceipt({ hash: await fork.client.sendRawTransaction({ serializedTransaction: state.held[0]! }) });
  await alice.refresh();
  assert.equal(await spendable(alice), "8");
});

test("a cash out whose answer was lost is not paid again on a retry", { skip: SKIP, timeout: 20 * 60_000 }, async () => {
  const { agent: a, state } = await agentWith("retry-cash", "20");
  assert.equal((await a.add({ amount: "5" })).status, "done");
  assert.equal((await a.add({ amount: "5" })).status, "done");
  const carol = (await fork.newKey(0n)).address;
  state.armed = true;
  const first = await a.cashOut({ amount: "5", to: carol });
  assert.equal(first.status, "unconfirmed");
  // The planner tries again (as it would after a function that failed).
  const second = await a.cashOut({ amount: "5", to: carol });
  assert.notEqual(second.status, "done", JSON.stringify(second));
  assert.equal(second.code, "unconfirmed_cash_out");
  await fork.client.waitForTransactionReceipt({ hash: await fork.client.sendRawTransaction({ serializedTransaction: state.held[0]! }) });
  await a.refresh();
  const got = await fork.client.readContract({ address: BASE_SEPOLIA_USDC, abi: ERC20, functionName: "balanceOf", args: [carol] });
  assert.equal(formatUnits(got, 6), "4.9875", "one cash out of 5, less the 0.25% fee");
  assert.equal(await spendable(a), "5");
});

test("a sweep that never lands keeps the scan on its payment, and is tried again after the hour", { skip: SKIP, timeout: 20 * 60_000 }, async () => {
  const { agent: alice } = await agentWith("retry-sweep-payer", "10");
  const { agent: bob, state } = await agentWith("retry-sweep");
  assert.equal((await alice.add({ amount: "5" })).status, "done");
  assert.equal((await alice.pay({ to: await bob.address(), amount: "2" })).status, "done");
  state.armed = true; // the sweep is signed and never sent
  const first = (await bob.checkIncoming()).received as { status: string }[];
  assert.equal(first[0]?.status, "unconfirmed");
  const second = (await bob.checkIncoming()).received as { status: string }[];
  assert.equal(second[0]?.status, "unconfirmed", "a pending sweep is not counted as secured; the scan stays on it");
  later(61 * 60_000);
  await bob.refresh();
  const third = (await bob.checkIncoming()).received as { status: string }[];
  assert.equal(third[0]?.status, "swept", JSON.stringify(third));
  await bob.refresh();
  assert.equal(await spendable(bob), "2");
});

test("two jobs paying the same payee, amount and note are two payments: the second is not answered with the first's handle", { skip: SKIP, timeout: 20 * 60_000 }, async () => {
  const { agent: alice, state } = await agentWith("retry-twojobs", "40");
  const { agent: bob } = await agentWith("retry-twojobs-bob");
  const bobTag = await bob.address();
  assert.equal((await alice.add({ amount: "20" })).status, "done");
  state.armed = true;
  const first = await alice.pay({ to: bobTag, amount: "3", note: "inv-9", label: "acp 84532:500 payout 1" });
  assert.equal(first.status, "unconfirmed");
  await fork.client.waitForTransactionReceipt({ hash: await fork.client.sendRawTransaction({ serializedTransaction: state.held[0]! }) });
  const second = await alice.pay({ to: bobTag, amount: "3", note: "inv-9", label: "acp 84532:501 payout 1" });
  assert.equal(second.status, "done", JSON.stringify(second));
  assert.notEqual(second.payment, first.payment, "job 501 has its own payment");
  assert.ok(!second.alreadyPaid);
  const got = (await bob.checkIncoming()).received as { amount: string }[];
  assert.deepEqual(got.map((g) => g.amount), ["3 USDC", "3 USDC"], "bob is paid for both jobs");
});

test("a deposit through a smart account whose inner call reverted (outer transaction succeeds) is not counted", { skip: SKIP, timeout: 20 * 60_000 }, async () => {
  const runtime = `0x${readFileSync(join(dirname(fileURLToPath(import.meta.url)), "fork", "SmartAccountLike.runtime.hex"), "utf8").trim()}` as Hex;
  const account = (await fork.newKey()).address;
  await fork.rpc("anvil_setCode", [account, runtime]);
  await fork.sendFromHolder(BASE_SEPOLIA_USDC, HOLDER, account, parseUnits("10", 6));
  const sink = (await fork.newKey(0n)).address;
  const EXEC = [{ type: "function", name: "execute", stateMutability: "payable", inputs: [{ name: "calls", type: "tuple[]", components: [{ name: "to", type: "address" }, { name: "value", type: "uint256" }, { name: "data", type: "bytes" }] }], outputs: [] }] as const;
  const { agent } = await agentWith("retry-aa", undefined, (k) => {
    const bundler = createWalletClient({ account: privateKeyToAccount(k), chain, transport: http(fork.url) });
    return {
      address: account,
      async sendCalls(calls: Call[]) {
        // Another operation from the same account spends the tokens first; the bundle transaction succeeds
        // while the operation inside it reverts.
        const bal = await fork.client.readContract({ address: BASE_SEPOLIA_USDC, abi: ERC20, functionName: "balanceOf", args: [account] });
        await fork.sendAs(account, BASE_SEPOLIA_USDC, encodeFunctionData({ abi: ERC20, functionName: "transfer", args: [sink, bal] }));
        return bundler.sendTransaction({ account: bundler.account, chain, to: account, data: encodeFunctionData({ abi: EXEC, functionName: "execute", args: [calls.map((c) => ({ to: c.to, value: c.value ?? 0n, data: c.data }))] }) });
      },
    };
  });
  const out = await agent.add({ amount: "5" });
  assert.notEqual(out.status, "done", JSON.stringify(out));
  const stored = agent.store.list();
  for (const n of stored) {
    const seen = await fork.client.readContract({ address: agent.network.pool, abi: POOL_STATE_ABI, functionName: "commitmentSeen", args: [n.commitment] });
    assert.ok(n.status !== "unspent" || seen, "no note counts as spendable unless it is in the vault");
  }
  await agent.refresh();
  assert.equal(await spendable(agent), "0");
  assert.equal(agent.largestPayment(), 0n);
});
