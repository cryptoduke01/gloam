/**
 * Fakes for the provider's unit tests: an ACP contract that keeps each job's
 * on-chain fields, a job session that writes to it, and a Gloam engine whose
 * payments and note store the test controls.
 */
import { mkdtempSync } from "node:fs";
import { encodeAbiParameters, pad, toHex, type Hex } from "viem";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { BASE_SEPOLIA_USDC, openSealedTicket, type ReceiveKey } from "@gloamtrade/sdk";
import type { GloamAgent } from "@gloamtrade/game-plugin-gloam";
import { FUND_TRANSFER_HOOKS, NO_EVALUATOR, assetToken, type AssetTokenLike, type DerivedStatus, type JobRoomEntry, type JobSessionLike } from "../src/acp.ts";
import { OFFERING_NAME } from "../src/offering.ts";
import { PrivatePayoutProvider } from "../src/provider.ts";

export const TOKEN = "0xECc22a8F6fD62388498fBa19813E214605a2BDb3" as const;
export const HOOK = FUND_TRANSFER_HOOKS[84532]!;
export const CLIENT = "0x00000000000000000000000000000000000000c1";
export const PROVIDER = "0x00000000000000000000000000000000000000a1";

/** jobs(jobId).status on the ACP contract (as the fork shows: 1 funded, 2 submitted, 3 completed, 4 rejected). */
export const ACP_STATUS = { open: 0, funded: 1, submitted: 2, completed: 3, rejected: 4, expired: 5 } as const;

type ChainJob = { client: string; status: number; provider: string; expiredAt: bigint; evaluator: string; hook: string; budget: bigint; description: string; funded: boolean; request: bigint; fundTx?: Hex };

const JOB_FUNDED_TOPIC = "0xe3fbcc1ea1bdc559ec7f0347efde7655e58b5f45a30b0e4470a583c3ef5496b3";
const HOOK_TOPIC = "0xad40084ca0b19b1b3abbe0e851c5d3e96bb2f9ca1fed724848b955ee83a95b07";
const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const ACP_ADDRESS = "0x0b93793923CD5De81850aF8604a233f3f24d461e";

/**
 * The ACP contract and the chain around it, as the provider reads them: jobs(jobId),
 * JobFunded logs, the funding transaction (the hook's log and the token's Transfer),
 * and the token Transfers of refunds.
 */
export class FakeAcp {
  jobs = new Map<string, ChainJob>();
  receipts = new Map<string, { logs: { address: string; topics: Hex[]; data: Hex }[] }>();
  /** Token transfers on chain (refunds the provider sent). */
  transfers: { from: string; to: string; value: bigint; transactionHash: Hex }[] = [];
  /** When set, every getLogs call throws (an RPC that is down). */
  logsDown = false;
  reads = 0;
  readContract = async ({ functionName, args }: { functionName: string; args?: unknown[] }) => {
    if (functionName !== "jobs") throw new Error(`fake ACP: no ${functionName}`);
    this.reads++;
    const j = this.jobs.get(String(args![0]));
    if (!j) return ["0x0000000000000000000000000000000000000000", 0, "0x0000000000000000000000000000000000000000", 0, NO_EVALUATOR, NO_EVALUATOR, 0n, ""];
    return [j.client, j.status, j.provider, j.expiredAt, j.evaluator, j.hook, j.budget, j.description];
  };
  getLogs = async ({ event, args }: { event?: { name?: string }; args?: { jobId?: bigint; from?: string; to?: string } }) => {
    if (this.logsDown) throw new Error("HTTP request failed. Status: 429");
    if (event?.name === "Transfer") {
      return this.transfers
        .filter((t) => t.from.toLowerCase() === String(args?.from).toLowerCase() && t.to.toLowerCase() === String(args?.to).toLowerCase())
        .map((t) => ({ args: { from: t.from, to: t.to, value: t.value }, transactionHash: t.transactionHash }));
    }
    const j = this.jobs.get(String(args?.jobId));
    return j?.funded ? [{ args, transactionHash: j.fundTx }] : [];
  };
  getTransactionReceipt = async ({ hash }: { hash: Hex }) => {
    const r = this.receipts.get(hash);
    if (!r) throw new Error("receipt not found");
    return { status: "success" as const, blockNumber: 100n, ...r };
  };
  getBlockNumber = async () => 100n;
  /**
   * The client funds: on chain the job is Funded, JobFunded was emitted, and the hook moved `moved`
   * (default: the fund request the provider set) from the client to the provider.
   */
  fund(jobId: string, moved?: bigint) {
    const j = this.jobs.get(jobId)!;
    j.status = ACP_STATUS.funded;
    j.funded = true;
    const amount = moved ?? j.request;
    const tx = `0x${(0xf00000 + Number(jobId)).toString(16).padStart(64, "0")}` as Hex;
    j.fundTx = tx;
    const addr = (a: string) => pad(a as Hex, { size: 32 });
    this.receipts.set(tx, {
      logs: [
        { address: ACP_ADDRESS, topics: [JOB_FUNDED_TOPIC, toHex(BigInt(jobId), { size: 32 }), addr(j.client)], data: toHex(j.budget, { size: 32 }) },
        { address: BASE_SEPOLIA_USDC, topics: [TRANSFER_TOPIC, addr(j.client), addr(j.provider)], data: toHex(amount, { size: 32 }) },
        {
          address: HOOK,
          topics: [HOOK_TOPIC, toHex(BigInt(jobId), { size: 32 }), toHex(0x2en, { size: 32 })],
          data: encodeAbiParameters([{ type: "address" }, { type: "address" }, { type: "address" }, { type: "uint256" }], [j.client as Hex, j.provider as Hex, BASE_SEPOLIA_USDC, amount]),
        },
      ],
    });
  }
  /** A refund that went out on chain: the token's Transfer, in its own transaction. */
  sent(from: string, to: string, value: bigint) {
    const transactionHash = `0x${(0xe00000 + this.transfers.length).toString(16).padStart(64, "0")}` as Hex;
    this.transfers.push({ from, to, value, transactionHash });
    const addr = (a: string) => pad(a as Hex, { size: 32 });
    this.receipts.set(transactionHash, { logs: [{ address: BASE_SEPOLIA_USDC, topics: [TRANSFER_TOPIC, addr(from), addr(to)], data: toHex(value, { size: 32 }) }] });
    return transactionHash;
  }
  /** The ACP proxy's EIP-1967 implementation slot (the audited implementation unless a test upgrades it). */
  implementation: Hex = "0xc4e95dbc7e8c99c114ff9c8299a3e4851e1530ff";
  getStorageAt = async () => pad(this.implementation, { size: 32 });
  set(jobId: string, patch: Partial<ChainJob>) {
    Object.assign(this.jobs.get(jobId)!, patch);
  }
}

type Paid = { to: string; amount: string; note?: string; sealTo?: string; label?: string };
type Outcome = Record<string, unknown> & { status: string };
type FakeNote = { handle: string; label: string; origin: "payment" | "claim"; status: "pending" | "spent" | "unspent"; createdTx: string | null; stale?: boolean };

/**
 * A Gloam engine. `pay` and `payByClaimLink` record the payment and, unless the
 * test passes its own, answer "done". `notes` is its store: what findPayment and
 * refresh read.
 */
export function fakeWallet(provider: ReceiveKey, acp: FakeAcp, opts: { float?: bigint; failOn?: number; pay?: (a: Paid, n: number, w: { notes: FakeNote[] }) => Promise<Outcome>; publicBalance?: bigint } = {}) {
  const paid: Paid[] = [];
  const notes: FakeNote[] = [];
  const cancelled: string[] = [];
  const adds: string[] = [];
  let calls = 0;
  const done = (a: Paid, origin: "payment" | "claim"): Outcome => {
    paid.push(a);
    const handle = `${origin === "claim" ? "c" : "n"}-${paid.length}`;
    const hash = `0x${String(paid.length).padStart(64, "0")}`;
    notes.push({ handle, label: a.label ?? "", origin, status: origin === "claim" ? "unspent" : "spent", createdTx: hash });
    return origin === "claim"
      ? { status: "done", claimHandle: handle, hash, sealedLink: `gloam2t.sealed-for-${a.sealTo?.slice(0, 12)}` }
      : { status: "done", payment: handle, hash };
  };
  const state = {
    notes,
    publicBalance: opts.publicBalance ?? 0n,
  };
  const w = {
    network: { key: "base", chainId: 84532, label: "Base", testnet: true, assets: [{ symbol: "USDC", address: BASE_SEPOLIA_USDC, decimals: 6 }] },
    walletAddress: PROVIDER,
    publicClient: {
      readContract: async (q: { functionName: string; args?: unknown[] }) => (q.functionName === "balanceOf" ? state.publicBalance : acp.readContract(q)),
      getLogs: (q: never) => acp.getLogs(q),
      getBlockNumber: () => acp.getBlockNumber(),
      getTransactionReceipt: (q: { hash: Hex }) => acp.getTransactionReceipt(q),
      getStorageAt: () => acp.getStorageAt(),
    },
    openSealed: (s: string) => openSealedTicket(s, provider),
    largestPayment: () => opts.float ?? 40_000_000n,
    pay: async (a: Paid) => {
      calls++;
      if (opts.pay) return opts.pay(a, calls, state);
      if (opts.failOn === paid.length) return { status: "error", message: "rpc down" };
      return done(a, "payment");
    },
    payByClaimLink: async (a: Paid) => {
      calls++;
      return done({ ...a, to: "claim-link" }, "claim");
    },
    provePayment: async ({ handle }: { handle: string }) => ({ status: "done", proof: `gloampay1:proof-of-${handle}` }),
    refresh: async () => ({ updated: 0 }),
    findPayment: (label: string) => {
      const n = [...notes].reverse().find((x) => x.label === label);
      return n ? { handle: n.handle, status: n.status, origin: n.origin, createdTx: n.createdTx, amount: "0", network: "base", asset: "USDC", ...(n.stale && n.status === "pending" ? { stale: true } : {}) } : null;
    },
    /** Cancelling a stale payment spends its note back: here it never landed, so it is dropped. */
    cancelPayment: async (handle: string) => {
      cancelled.push(handle);
      const i = notes.findIndex((x) => x.handle === handle && x.status === "pending" && x.stale);
      if (i >= 0) notes.splice(i, 1);
      return { status: "done", result: "cancelled" };
    },
    notes: () => [] as { origin: string; status: string; handle: string }[],
    claimLink: (handle: string) => ({ handle, link: `https://www.gloam.trade/claim?net=base#claim=gloam1=fake-${handle}` }),
    add: async (a: { amount: string }) => {
      adds.push(a.amount);
      return { status: "done", hash: `0x${"e".repeat(64)}` };
    },
  };
  return { wallet: w as unknown as GloamAgent, paid, notes, adds, state, cancelled, calls: () => calls };
}

export class FakeSession implements JobSessionLike {
  status: DerivedStatus = "open";
  budget: AssetTokenLike | null = null;
  transfer: { token: AssetTokenLike; destination: string } | null = null;
  submitted: string | null = null;
  rejected: string | null = null;
  messages: string[] = [];
  job;
  readonly chainId = 84532;
  constructor(
    readonly jobId: string,
    readonly acp: FakeAcp,
    evaluator: string = CLIENT,
    description = OFFERING_NAME,
    hook: string = HOOK
  ) {
    this.job = {
      chainId: 84532,
      clientAddress: CLIENT,
      providerAddress: PROVIDER,
      evaluatorAddress: evaluator,
      description,
      budget: assetToken(TOKEN, "USDC", 6, 0n),
      expiredAt: BigInt(Math.floor(Date.now() / 1000) + 3600),
      hookAddress: hook,
    };
    acp.jobs.set(jobId, { client: CLIENT, status: ACP_STATUS.open, provider: PROVIDER, expiredAt: this.job.expiredAt, evaluator, hook, budget: 0n, description, funded: false, request: 0n });
  }
  async setBudget(a: AssetTokenLike) {
    this.budget = a;
    this.status = "budget_set";
    this.job = { ...this.job, budget: a };
    this.acp.set(this.jobId, { budget: a.rawAmount });
  }
  async setBudgetWithFundRequest(a: AssetTokenLike, t: AssetTokenLike, destination: string) {
    this.transfer = { token: t, destination };
    await this.setBudget(a);
    this.acp.set(this.jobId, { request: t.rawAmount });
  }
  async submit(d: string) {
    this.submitted = d;
    this.status = "submitted";
    this.acp.set(this.jobId, { status: ACP_STATUS.submitted });
  }
  async sendMessage(m: string) {
    this.messages.push(m);
  }
  async reject(r: string) {
    this.rejected = r;
    this.status = "rejected";
    this.acp.set(this.jobId, { status: ACP_STATUS.rejected });
  }
  /** The client funds on chain, then the event arrives. */
  fund() {
    this.acp.fund(this.jobId);
    this.status = "funded";
  }
}

export const requirementEntry = (jobId: string, content: unknown): JobRoomEntry => ({ kind: "message", onChainJobId: jobId, chainId: 84532, from: "0xc1", contentType: "requirement", content: JSON.stringify(content), timestamp: 0 });
export const funded = (jobId: string): JobRoomEntry => ({ kind: "system", onChainJobId: jobId, chainId: 84532, event: { type: "job.funded", jobId, client: "0xc1", amount: 10 }, timestamp: 0 });
export const rejected = (jobId: string): JobRoomEntry => ({ kind: "system", onChainJobId: jobId, chainId: 84532, event: { type: "job.rejected", jobId, rejector: CLIENT, reason: "changed my mind" }, timestamp: 0 });
export const completed = (jobId: string): JobRoomEntry => ({ kind: "system", onChainJobId: jobId, chainId: 84532, event: { type: "job.completed", jobId, evaluator: CLIENT, reason: "ok" }, timestamp: 0 });

export function providerFor(wallet: GloamAgent, extra: Partial<ConstructorParameters<typeof PrivatePayoutProvider>[0]> = {}) {
  return new PrivatePayoutProvider({
    wallet,
    budgetToken: (raw) => assetToken(TOKEN, "USDC", 6, raw),
    acpFeeBps: () => 100,
    journalPath: join(mkdtempSync(join(tmpdir(), "gloam-acp-journal-")), "jobs.json"),
    acpAddress: "0x0b93793923CD5De81850aF8604a233f3f24d461e",
    log: () => undefined,
    ...extra,
  });
}
