/**
 * Fakes for the provider's unit tests: an ACP contract that keeps each job's
 * on-chain fields, a job session that writes to it, and a Gloam engine whose
 * payments and note store the test controls.
 */
import { mkdtempSync } from "node:fs";
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

type ChainJob = { client: string; status: number; provider: string; expiredAt: bigint; evaluator: string; hook: string; budget: bigint; description: string; funded: boolean };

/** The ACP contract's jobs(jobId) and JobFunded logs, as the provider reads them. */
export class FakeAcp {
  jobs = new Map<string, ChainJob>();
  reads = 0;
  readContract = async ({ functionName, args }: { functionName: string; args?: unknown[] }) => {
    if (functionName !== "jobs") throw new Error(`fake ACP: no ${functionName}`);
    this.reads++;
    const j = this.jobs.get(String(args![0]));
    if (!j) return ["0x0000000000000000000000000000000000000000", 0, "0x0000000000000000000000000000000000000000", 0, NO_EVALUATOR, NO_EVALUATOR, 0n, ""];
    return [j.client, j.status, j.provider, j.expiredAt, j.evaluator, j.hook, j.budget, j.description];
  };
  getLogs = async ({ args }: { args?: { jobId?: bigint } }) => (this.jobs.get(String(args?.jobId))?.funded ? [{ args }] : []);
  getBlockNumber = async () => 100n;
  /** The client funds: on chain the job is Funded and JobFunded was emitted. */
  fund(jobId: string) {
    const j = this.jobs.get(jobId)!;
    j.status = ACP_STATUS.funded;
    j.funded = true;
  }
  set(jobId: string, patch: Partial<ChainJob>) {
    Object.assign(this.jobs.get(jobId)!, patch);
  }
}

type Paid = { to: string; amount: string; note?: string; sealTo?: string; label?: string };
type Outcome = Record<string, unknown> & { status: string };
type FakeNote = { handle: string; label: string; origin: "payment" | "claim"; status: "pending" | "spent" | "unspent"; createdTx: string | null };

/**
 * A Gloam engine. `pay` and `payByClaimLink` record the payment and, unless the
 * test passes its own, answer "done". `notes` is its store: what findPayment and
 * refresh read.
 */
export function fakeWallet(provider: ReceiveKey, acp: FakeAcp, opts: { float?: bigint; failOn?: number; pay?: (a: Paid, n: number, w: { notes: FakeNote[] }) => Promise<Outcome>; publicBalance?: bigint } = {}) {
  const paid: Paid[] = [];
  const notes: FakeNote[] = [];
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
      getLogs: acp.getLogs,
      getBlockNumber: acp.getBlockNumber,
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
      return n ? { handle: n.handle, status: n.status, origin: n.origin, createdTx: n.createdTx, amount: "0", network: "base", asset: "USDC" } : null;
    },
    notes: () => [] as { origin: string; status: string; handle: string }[],
    claimLink: (handle: string) => ({ handle, link: `https://www.gloam.trade/claim?net=base#claim=gloam1=fake-${handle}` }),
    add: async (a: { amount: string }) => {
      adds.push(a.amount);
      return { status: "done", hash: `0x${"e".repeat(64)}` };
    },
  };
  return { wallet: w as unknown as GloamAgent, paid, notes, adds, state, calls: () => calls };
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
    acp.jobs.set(jobId, { client: CLIENT, status: ACP_STATUS.open, provider: PROVIDER, expiredAt: this.job.expiredAt, evaluator, hook, budget: 0n, description, funded: false });
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
