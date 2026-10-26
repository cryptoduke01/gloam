/**
 * The ACP provider against Virtuals' real ACP contract and FundTransferHook on a
 * Base Sepolia fork: a client that funds with its own fund-transfer params, and
 * two jobs whose payout lines are the same. Fresh keys funded inside the fork only.
 *
 *   BASE_SEPOLIA_RPC_URL=https://sepolia.base.org pnpm --filter gloam-virtuals-acp-provider-example test
 */
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createWalletClient, decodeEventLog, encodeFunctionData, http, parseUnits, toFunctionSelector, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { BASE_SEPOLIA_USDC, POOL_TRANSFER_ABI } from "@gloamtrade/sdk";
import { GloamAgent, shutdownProver, walletCallSender, type Call, type CallSender, type LimitsConfig } from "@gloamtrade/game-plugin-gloam";
import { ERC20, findAnvil, startFork, type Fork } from "../../../packages/game-plugin-gloam/test/fork/harness.mts";
import { ACP_ABI, ACP_CONTRACTS, FUND_TRANSFER_HOOKS, assetToken, encodeFundTransfer, type AssetTokenLike, type DerivedStatus, type JobRoomEntry, type JobSessionLike } from "../src/acp.ts";
import { OFFERING_NAME } from "../src/offering.ts";
import { PrivatePayoutProvider } from "../src/provider.ts";

const upstream = process.env.BASE_SEPOLIA_RPC_URL?.trim();
const SKIP = !upstream ? "set BASE_SEPOLIA_RPC_URL" : !findAnvil() ? "anvil not found" : false;
const CIRCUITS = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "app", "public", "circuits");
const CACHE = process.env.GLOAM_FORK_CACHE?.trim() || join(tmpdir(), "gloam-fork-vault-cache");
const HOLDER = "0xfaec9cdc3ef75713b48f46057b98ba04885e3391" as Address;
const chainId = 84532;
const acp = ACP_CONTRACTS[chainId]!;
const hook = FUND_TRANSFER_HOOKS[chainId]!;
const usdc = (v: string) => parseUnits(v, 6);
const limits: LimitsConfig = { recipients: "any", assets: { USDC: { maxPerPayment: "25", maxPerDay: "200" } } };
const log = (m: string) => console.log(`  [jobs] ${m}`);
const TRANSFER_SELECTOR = toFunctionSelector((POOL_TRANSFER_ABI as readonly { type: string; name?: string }[]).find((x) => x.type === "function" && x.name === "transfer") as never);

let fork: Fork;
let chain: { id: number; name: string; nativeCurrency: { name: string; symbol: string; decimals: number }; rpcUrls: { default: { http: string[] } } };

before(async () => {
  if (SKIP) return;
  mkdirSync(CACHE, { recursive: true });
  fork = await startFork({ upstream: upstream!, chainId, log });
  chain = { id: chainId, name: "fork", nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 }, rpcUrls: { default: { http: [fork.url] } } };
});
after(async () => {
  await shutdownProver();
  await fork?.stop();
});

async function setup(tag: string) {
  const pk = await fork.newKey();
  const ck = await fork.newKey();
  const r1 = await fork.newKey();
  const r2 = await fork.newKey();
  await fork.sendFromHolder(BASE_SEPOLIA_USDC, HOLDER, pk.address, usdc("40"));
  await fork.sendFromHolder(BASE_SEPOLIA_USDC, HOLDER, ck.address, usdc("20"));
  await fork.setTokenBalance(acp.paymentToken, 0, ck.address, usdc("5"));
  const pw = createWalletClient({ account: privateKeyToAccount(pk.key), chain, transport: http(fork.url) });
  const cw = createWalletClient({ account: privateKeyToAccount(ck.key), chain, transport: http(fork.url) });
  const send = async (w: typeof pw, to: Address, data: Hex) => {
    const h = await w.sendTransaction({ to, data, chain, account: w.account });
    const r = await fork.client.waitForTransactionReceipt({ hash: h });
    if (r.status !== "success") throw new Error(`reverted ${h}`);
    return r;
  };
  // The provider's private sends go out like the relay's: armed, the next one is signed by relayer 1 and held.
  const honest = walletCallSender(pw as never, fork.client);
  const rel = [r1, r2].map((k) => createWalletClient({ account: privateKeyToAccount(k.key), chain, transport: http(fork.url) }));
  const relay = { armed: false, held: [] as Hex[], sent: [] as Hex[] };
  const sender: CallSender = {
    address: pk.address,
    async sendCalls(calls: Call[]) {
      const c = calls[calls.length - 1]!;
      if (!(calls.length === 1 && c.data.slice(0, 10).toLowerCase() === TRANSFER_SELECTOR.toLowerCase())) return honest.sendCalls(calls);
      if (relay.armed) {
        relay.armed = false;
        const req = await rel[0]!.prepareTransactionRequest({ account: rel[0]!.account, chain, to: c.to, data: c.data, value: 0n });
        relay.held.push(await rel[0]!.signTransaction(req as never));
        throw new Error("The relay did not answer in time. It may have been sent.");
      }
      const h = await rel[1]!.sendTransaction({ account: rel[1]!.account, chain, to: c.to, data: c.data, value: 0n });
      relay.sent.push(h);
      return h;
    },
  };
  const agent = (name: string, key: Hex, s?: CallSender) => {
    const dir = mkdtempSync(join(tmpdir(), `gloam-jobs-${name}-`));
    return new GloamAgent({
      network: "base", rpc: fork.url, submit: "wallet", agentId: name, dataDir: CACHE,
      env: { GLOAM_AGENT_PRIVATE_KEY: key, GLOAM_NOTE_STORE: join(dir, "notes.json"), GLOAM_SPEND_LOG: join(dir, "spend.json") },
      artifacts: { dir: CIRCUITS, url: "http://127.0.0.1:1/never" }, limits, ...(s ? { sender: s } : {}),
    });
  };
  const provider = agent(`${tag}-provider`, pk.key, sender);
  const bob = agent(`${tag}-bob`, (await fork.newKey()).key);
  for (let i = 0; i < 3; i++) assert.equal((await provider.add({ amount: "10" })).status, "done");
  const bobTag = await bob.address();
  const platform = Number(await fork.client.readContract({ address: acp.acp, abi: ACP_ABI, functionName: "platformFeeBP" }));
  const evalFee = Number(await fork.client.readContract({ address: acp.acp, abi: ACP_ABI, functionName: "evaluatorFeeBP" }));
  const service = new PrivatePayoutProvider({
    wallet: provider,
    budgetToken: (raw) => assetToken(acp.paymentToken, "tUSDC", 6, raw),
    acpFeeBps: () => platform + evalFee,
    journalPath: join(mkdtempSync(join(tmpdir(), "gloam-jobs-journal-")), "jobs.json"),
    log: (m) => console.log(`  [provider] ${m}`),
  });
  const floatOf = () => provider.notes().filter((n) => n.status === "unspent" && n.origin !== "payment").reduce((s, n) => s + usdc(n.amount), 0n);
  const toProvider = async () => fork.client.readContract({ address: BASE_SEPOLIA_USDC, abi: ERC20, functionName: "balanceOf", args: [pk.address] });

  const newJob = async () => {
    const now = Number((await fork.client.getBlock()).timestamp);
    const rc = await send(cw, acp.acp, encodeFunctionData({ abi: ACP_ABI, functionName: "createJob", args: [pk.address, ck.address, BigInt(now + 3600), OFFERING_NAME, hook] }));
    let jobId = "";
    for (const l of rc.logs) {
      try {
        const d = decodeEventLog({ abi: ACP_ABI, data: l.data, topics: l.topics });
        if (d.eventName === "JobCreated") jobId = String((d.args as { jobId: bigint }).jobId);
      } catch {
        /* another event */
      }
    }
    const readJob = async () => (await fork.client.readContract({ address: acp.acp, abi: ACP_ABI, functionName: "jobs", args: [BigInt(jobId)] })) as readonly unknown[];
    let request = 0n;
    /** The client funds; `opt` lets a client name its own fund-transfer params. */
    const fund = async (opt?: { amount?: bigint; to?: Address; approve?: bigint }) => {
      const budget = (await readJob())[6] as bigint;
      await send(cw, acp.paymentToken, encodeFunctionData({ abi: ERC20, functionName: "approve", args: [acp.acp, budget] }));
      await send(cw, BASE_SEPOLIA_USDC, encodeFunctionData({ abi: ERC20, functionName: "approve", args: [hook, opt?.approve ?? request] }));
      return send(cw, acp.acp, encodeFunctionData({ abi: ACP_ABI, functionName: "fund", args: [BigInt(jobId), budget, encodeFundTransfer(BASE_SEPOLIA_USDC, opt?.amount ?? request, opt?.to ?? pk.address)] }));
    };
    let submitted = 0;
    const session: JobSessionLike & { status: DerivedStatus } = {
      jobId,
      chainId,
      status: "open",
      get job() {
        return { chainId, clientAddress: ck.address, providerAddress: pk.address, evaluatorAddress: ck.address, description: OFFERING_NAME, budget: assetToken(acp.paymentToken, "tUSDC", 6, 0n), expiredAt: BigInt(now + 3600), hookAddress: hook };
      },
      async setBudget() {
        throw new Error("not used");
      },
      async setBudgetWithFundRequest(amount: AssetTokenLike, t: AssetTokenLike, dest: string) {
        request = t.rawAmount;
        await send(pw, acp.acp, encodeFunctionData({ abi: ACP_ABI, functionName: "setBudget", args: [BigInt(jobId), amount.rawAmount, encodeFundTransfer(t.address, t.rawAmount, dest as Address)] }));
      },
      async submit() {
        submitted++;
        await send(pw, acp.acp, encodeFunctionData({ abi: ACP_ABI, functionName: "submit", args: [BigInt(jobId), `0x${"ab".repeat(32)}` as Hex, "0x"] }));
      },
      async sendMessage() {},
      async reject() {},
    };
    const req = (payouts: unknown): JobRoomEntry => ({ kind: "message", onChainJobId: jobId, chainId, from: ck.address, contentType: "requirement", content: JSON.stringify({ payouts }), timestamp: 0 });
    const fundedEntry: JobRoomEntry = { kind: "system", onChainJobId: jobId, chainId, event: { type: "job.funded", jobId, client: ck.address, amount: 0 }, timestamp: 0 };
    return { jobId, session, req, fund, fundedEntry, submitted: () => submitted, request: () => request };
  };
  return { pk, ck, provider, bob, bobTag, service, relay, newJob, floatOf, toProvider, send, cw };
}

test("a client that funds with its own fund-transfer params (less, or to itself) gets no payout", { skip: SKIP, timeout: 20 * 60_000 }, async () => {
  const s = await setup("p1");
  for (const [what, opt] of [
    ["1 unit instead of the request", { amount: 1n }],
    ["the request, sent to the client itself", { to: s.ck.address }],
  ] as const) {
    const j = await s.newJob();
    await s.service.onEntry(j.session, j.req([{ to: s.bobTag, amount: "5" }]));
    const before = await s.toProvider();
    const f0 = s.floatOf();
    let funded = "funded";
    try {
      await j.fund({ ...opt, approve: j.request() });
    } catch (e) {
      funded = `fund reverted (${(e as Error).message.slice(0, 80)})`;
    }
    const moved = (await s.toProvider()) - before;
    j.session.status = "funded";
    await s.service.onEntry(j.session, j.fundedEntry);
    const st = s.service.status(chainId, j.jobId);
    log(`${what}: ${funded}; moved to provider ${moved}; journal state ${st?.state} received ${st?.receivedRaw} blocked ${st?.blocked ?? "-"}; float change ${f0 - s.floatOf()}`);
    assert.equal(f0 - s.floatOf() <= moved, true, "payouts never exceed what reached the provider");
  }
});

test("two jobs (same payee, amount, note): the second job's payout is really sent, not answered with the first job's payment", { skip: SKIP, timeout: 20 * 60_000 }, async () => {
  const s = await setup("p2");
  const line = [{ to: s.bobTag, amount: "3", note: "inv-9" }];
  // Job A: its payout's answer is lost (the relay times out); the transfer is held.
  const a = await s.newJob();
  await s.service.onEntry(a.session, a.req(line));
  await a.fund();
  a.session.status = "funded";
  s.relay.armed = true;
  await s.service.onEntry(a.session, a.fundedEntry);
  log(`job ${a.jobId}: ${s.service.status(chainId, a.jobId)?.state}`);
  // The held transfer lands.
  const landed = (await fork.client.waitForTransactionReceipt({ hash: await fork.client.sendRawTransaction({ serializedTransaction: s.relay.held[0]! }) })).status;
  log(`job ${a.jobId}'s held payout lands: ${landed}`);
  // Job B, same list, funded: 3 more reach the provider.
  const b = await s.newJob();
  await s.service.onEntry(b.session, b.req(line));
  const p0 = await s.toProvider();
  await b.fund();
  log(`job ${b.jobId} funding moved ${(await s.toProvider()) - p0} to the provider`);
  b.session.status = "funded";
  const sentBefore = s.relay.sent.length;
  await s.service.onEntry(b.session, b.fundedEntry);
  const jb = s.service.status(chainId, b.jobId)!;
  log(`job ${b.jobId}: state ${jb.state}, payout ${jb.results[0]?.status} tx ${jb.results[0]?.tx}; private sends for it: ${s.relay.sent.length - sentBefore}; submitted ${b.submitted()}`);
  await s.service.resume(a.session);
  const ja = s.service.status(chainId, a.jobId)!;
  log(`job ${a.jobId}: state ${ja.state}, payout ${ja.results[0]?.status} tx ${ja.results[0]?.tx}; submitted ${a.submitted()}`);
  const got = (await s.bob.checkIncoming()).received as { amount: string }[];
  log(`bob received ${got.length} payment(s): ${JSON.stringify(got.map((g) => g.amount))}`);
  assert.equal(jb.state === "submitted" ? got.length : 2, 2, "if job B is submitted as paid, bob received two payments");
});
