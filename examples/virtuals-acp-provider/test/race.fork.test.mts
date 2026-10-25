/**
 * A client that tries to get a big payout list for a small quote, on a Base
 * Sepolia fork against Virtuals' real ACP contract and FundTransferHook:
 * a second requirement after the first was quoted, and a payout list that does
 * not match what the funding moved. Fresh keys funded inside the fork only.
 *
 *   BASE_SEPOLIA_RPC_URL=https://sepolia.base.org pnpm --filter gloam-virtuals-acp-provider-example test
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createWalletClient, decodeEventLog, encodeFunctionData, http, parseUnits, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { GloamAgent, shutdownProver, type LimitsConfig } from "@gloamtrade/game-plugin-gloam";
import { BASE_SEPOLIA_USDC } from "@gloamtrade/sdk";
import { ERC20, findAnvil, startFork } from "../../../packages/game-plugin-gloam/test/fork/harness.mts";
import { ACP_ABI, ACP_CONTRACTS, FUND_TRANSFER_HOOKS, assetToken, encodeFundTransfer, type AssetTokenLike, type DerivedStatus, type JobRoomEntry, type JobSessionLike } from "../src/acp.ts";
import { OFFERING_NAME } from "../src/offering.ts";
import { PrivatePayoutProvider } from "../src/provider.ts";

const upstream = process.env.BASE_SEPOLIA_RPC_URL?.trim();
const SKIP = !upstream ? "set BASE_SEPOLIA_RPC_URL" : !findAnvil() ? "anvil not found" : false;
const CIRCUITS = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "app", "public", "circuits");
const CACHE = process.env.GLOAM_FORK_CACHE?.trim() || join(tmpdir(), "gloam-fork-vault-cache");
const HOLDER = "0xfaec9cdc3ef75713b48f46057b98ba04885e3391" as Address;

test("a second requirement and a payout list bigger than the funding are not paid out (real ACP and hook)", { skip: SKIP, timeout: 20 * 60_000 }, async () => {
  mkdirSync(CACHE, { recursive: true });
  const chainId = 84532;
  const acp = ACP_CONTRACTS[chainId]!;
  const hook = FUND_TRANSFER_HOOKS[chainId]!;
  const usdc = (v: string) => parseUnits(v, 6);
  const limits: LimitsConfig = { recipients: "any", assets: { USDC: { maxPerPayment: "25", maxPerDay: "100" } } };
  const fork = await startFork({ upstream: upstream!, chainId, log: (m) => console.log(`  ${m}`) });
  const chain = { id: chainId, name: "fork", nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 }, rpcUrls: { default: { http: [fork.url] } } } as const;
  const agent = (name: string, key: Hex) => {
    const dir = mkdtempSync(join(tmpdir(), `gloam-race-${name}-`));
    return new GloamAgent({
      network: "base", rpc: fork.url, submit: "wallet", agentId: name, dataDir: CACHE,
      env: { GLOAM_AGENT_PRIVATE_KEY: key, GLOAM_NOTE_STORE: join(dir, "notes.json"), GLOAM_SPEND_LOG: join(dir, "spend.json") },
      artifacts: { dir: CIRCUITS, url: "http://127.0.0.1:1/never" }, limits,
    });
  };
  try {
    const pk = await fork.newKey();
    const ck = await fork.newKey();
    await fork.sendFromHolder(BASE_SEPOLIA_USDC, HOLDER, pk.address, usdc("40"));
    await fork.sendFromHolder(BASE_SEPOLIA_USDC, HOLDER, ck.address, usdc("1"));
    await fork.setTokenBalance(acp.paymentToken, 0, ck.address, usdc("5"));
    const pw = createWalletClient({ account: privateKeyToAccount(pk.key), chain, transport: http(fork.url) });
    const cw = createWalletClient({ account: privateKeyToAccount(ck.key), chain, transport: http(fork.url) });
    const send = async (w: typeof pw, to: Address, data: Hex) => {
      const h = await w.sendTransaction({ to, data, chain, account: w.account });
      const r = await fork.client.waitForTransactionReceipt({ hash: h });
      if (r.status !== "success") throw new Error(`reverted ${h}`);
      return r;
    };
    const provider = agent("race-provider", pk.key);
    const client = agent("race-client", ck.key); // the client's own Gloam address would receive the payouts
    assert.equal((await provider.add({ amount: "30" })).status, "done");
    const clientTag = await client.address();
    const platform = Number(await fork.client.readContract({ address: acp.acp, abi: ACP_ABI, functionName: "platformFeeBP" }));
    const evalFee = Number(await fork.client.readContract({ address: acp.acp, abi: ACP_ABI, functionName: "evaluatorFeeBP" }));
    const service = new PrivatePayoutProvider({ wallet: provider, budgetToken: (raw) => assetToken(acp.paymentToken, "tUSDC", 6, raw), acpFeeBps: () => platform + evalFee, log: (m) => console.log(`  [provider] ${m}`) });
    const floatOf = () => provider.notes().filter((n) => n.status === "unspent" && n.origin !== "payment").reduce((s, n) => s + usdc(n.amount), 0n);

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
      const fund = async () => {
        const budget = (await readJob())[6] as bigint;
        await send(cw, acp.paymentToken, encodeFunctionData({ abi: ERC20, functionName: "approve", args: [acp.acp, budget] }));
        await send(cw, BASE_SEPOLIA_USDC, encodeFunctionData({ abi: ERC20, functionName: "approve", args: [hook, request] }));
        await send(cw, acp.acp, encodeFunctionData({ abi: ACP_ABI, functionName: "fund", args: [BigInt(jobId), budget, encodeFundTransfer(BASE_SEPOLIA_USDC, request, pk.address)] }));
      };
      let quotes = 0;
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
          quotes++;
          request = t.rawAmount;
          await send(pw, acp.acp, encodeFunctionData({ abi: ACP_ABI, functionName: "setBudget", args: [BigInt(jobId), amount.rawAmount, encodeFundTransfer(t.address, t.rawAmount, dest as Address)] }));
        },
        async submit() {
          await send(pw, acp.acp, encodeFunctionData({ abi: ACP_ABI, functionName: "submit", args: [BigInt(jobId), `0x${"ab".repeat(32)}` as Hex, "0x"] }));
        },
        async sendMessage() {},
        async reject() {},
      };
      const req = (payouts: unknown): JobRoomEntry => ({ kind: "message", onChainJobId: jobId, chainId, from: ck.address, contentType: "requirement", content: JSON.stringify({ payouts }), timestamp: 0 });
      const fundedEntry: JobRoomEntry = { kind: "system", onChainJobId: jobId, chainId, event: { type: "job.funded", jobId, client: ck.address, amount: 0 }, timestamp: 0 };
      return { jobId, session, req, fund, fundedEntry, quotes: () => quotes };
    };

    // 1. A second requirement while the session still reads "open": not quoted.
    const a = await newJob();
    const f0 = floatOf();
    await service.onEntry(a.session, a.req([{ to: clientTag, amount: "0.01" }]));
    await service.onEntry(a.session, a.req([{ to: clientTag, amount: "9.9" }])).catch(() => undefined);
    assert.equal(a.quotes(), 1, "one quote per job");
    await a.fund();
    a.session.status = "funded";
    await service.onEntry(a.session, a.fundedEntry);
    assert.deepEqual(service.status(chainId, a.jobId)?.payouts.map((p) => p.amount), ["0.01"]);
    assert.equal(service.status(chainId, a.jobId)?.receivedRaw, "10000", "what the hook moved, read from the funding transaction");
    assert.equal(f0 - floatOf(), usdc("0.01"), "only the funded 0.01 left the float");

    // 2. The journal says 9.9 while the funding moved 0.01 (as the old race left it): nothing is paid.
    const b = await newJob();
    await service.onEntry(b.session, b.req([{ to: clientTag, amount: "0.01" }]));
    const k = `${chainId}:${b.jobId}`;
    const j = service.status(chainId, b.jobId)!;
    (service as unknown as { journal: { put(k: string, v: unknown): void } }).journal.put(k, { ...j, payouts: [{ to: clientTag, amount: "9.9" }], transferRaw: "9900000" });
    await b.fund();
    b.session.status = "funded";
    const f1 = floatOf();
    await service.onEntry(b.session, b.fundedEntry);
    assert.match(String(service.status(chainId, b.jobId)?.blocked), /less than/);
    assert.equal(floatOf(), f1, "nothing left the float");
    const got = (await client.checkIncoming()).received as { amount: string; status: string }[];
    assert.deepEqual(got.map((g) => g.amount), ["0.01 USDC"], "the client's address received the 0.01 it paid for, once");
  } finally {
    await shutdownProver();
    await fork.stop();
  }
});
