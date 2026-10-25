/**
 * A Gloam provider agent for ACP: one service, "private payout".
 *
 * Lifecycle (acp-node-v2's seller flow, driven by `entry` events):
 *
 *   requirement message  check it, quote, setBudgetWithFundRequest()   (or reject: nothing is committed yet)
 *   job.funded           pay every payout privately, prove each one, submit(deliverable)
 *   job.completed        the escrow paid the fee: add received money to the private balance (EarningsSweeper)
 *
 * Fund-transfer jobs only, by default. The provider pays out before it
 * submits, and an escrow can still go back to the client before then: a
 * client that evaluates its own job (the usual way for fund-transfer jobs) may
 * reject it while funded, as EIP-8183 lets an evaluator. Private payouts
 * cannot be undone, so they must never depend on the escrow. So the provider asks for the payout total
 * through ACP's FundTransferHook: it moves from the client to the provider in
 * the same transaction as fund(), outside the escrow, and only the fee is
 * escrowed. A client that rejects after funding gets the fee back, never the
 * principal. Plain escrow jobs are taken only from clients the owner trusts.
 *
 * The provider pays out from its private float as soon as the job is funded,
 * so the principal that arrived in public is not deposited as one matching
 * amount; the EarningsSweeper adds it later in round batches. It quotes only
 * when one private note covers the whole job. A fund-transfer job is evaluated
 * by the client itself (ACP's FundTransferHook needs an evaluator), which puts
 * no more than the fee at risk; a plain escrow job needs no evaluator or one
 * the owner trusts.
 *
 * What is public, precisely:
 *   - The ACP leg: the job (client, provider, evaluator, expiry, the offering
 *     name), the fee in escrow, the payout total moving from client to
 *     provider at funding, the deliverable's hash, and the escrow paying the
 *     fee and Virtuals' cut. ACP's escrow is a public contract.
 *   - Not public: who the payouts went to and how much each was. Each payout is
 *     a shielded transfer from the provider's private balance. The requirement
 *     (sealedPayouts) and the deliverable (replyTo) can be sealed so Virtuals'
 *     ACP backend, which stores those messages, reads neither.
 *
 * Crash safety: a small journal (no secrets) records each payout as it lands,
 * so a restart never pays a job twice.
 */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { formatUnits, parseUnits, type Address } from "viem";
import { sealToReceiveTag } from "@gloamtrade/sdk";
import type { GloamAgent } from "@gloamtrade/game-plugin-gloam";
import { FUND_TRANSFER_HOOKS, NO_EVALUATOR, assetToken, type AssetTokenLike, type JobRoomEntry, type JobSessionLike } from "./acp.js";
import type { EarningsSweeper } from "./earnings.js";
import { OFFERING_NAME, RequirementError, parseRequirement, type PayoutLine } from "./offering.js";

export const DELIVERABLE_TYPE = "gloam.private_payout.v1";

export interface PayoutResult {
  to: string;
  amount: string;
  status: "paid" | "failed";
  /** The payment's handle in the provider's store (kept out of the deliverable). */
  handle?: string;
  tx?: string;
  /** A proof of this payment (gloampay1:…), made for the client. */
  proof?: string;
  /** For a claim-link payout: the link, sealed to the client's Gloam address. */
  sealedClaimLink?: string;
  error?: string;
}

type JobMode = "fund-transfer" | "escrow";

export type JournalJob = {
  chainId: number;
  jobId: string;
  client: string;
  mode: JobMode;
  state: "quoted" | "paying" | "submitted" | "completed" | "rejected" | "expired" | "stuck";
  /** What sits in escrow (raw units of the ACP token). */
  budgetRaw: string;
  /** What the client sends the provider at funding, outside the escrow (fund-transfer jobs). */
  transferRaw: string;
  /** Set once the job is funded. */
  funded?: boolean;
  payouts: PayoutLine[];
  replyTo: string | null;
  results: PayoutResult[];
  /** Principal the provider holds but did not pay out, owed back to the client. */
  refundOwed?: string;
  refundTx?: string;
  updatedAt: string;
};

class Journal {
  private mem: Record<string, JournalJob> = {};
  constructor(readonly path: string | null) {}
  private read(): Record<string, JournalJob> {
    if (!this.path || !existsSync(this.path)) return this.mem;
    return JSON.parse(readFileSync(this.path, "utf8")) as Record<string, JournalJob>;
  }
  get(key: string): JournalJob | undefined {
    return this.read()[key];
  }
  put(key: string, job: JournalJob) {
    const all = this.read();
    all[key] = { ...job, updatedAt: new Date().toISOString() };
    if (!this.path) {
      this.mem = all;
      return;
    }
    mkdirSync(dirname(this.path), { recursive: true });
    const tmp = `${this.path}.${process.pid}.tmp`;
    writeFileSync(tmp, JSON.stringify(all, null, 2), { mode: 0o600 });
    renameSync(tmp, this.path);
  }
}

export interface PrivatePayoutProviderOptions {
  /** The provider's Gloam engine (its private float pays the payouts; its wallet receives the principal). */
  wallet: GloamAgent;
  /** The ACP budget token for a raw amount: AssetToken.usdcFromRaw(raw, chainId) with acp-node-v2. */
  budgetToken: (rawAmount: bigint, chainId: number) => AssetTokenLike;
  /** The fund-transfer token (the Gloam asset): with acp-node-v2, AssetToken.create(address, symbol, decimals, amount). */
  transferToken?: (address: Address, symbol: string, decimals: number, rawAmount: bigint) => AssetTokenLike;
  /** Virtuals' cut of the budget in basis points (the ACP contract's platformFeeBP, plus evaluatorFeeBP with an evaluator). */
  acpFeeBps: (session: JobSessionLike) => Promise<number> | number;
  /** This provider's own fee, in basis points of the payouts. Default 50 (0.5%). */
  feeBps?: number;
  /** The smallest fee, in the asset's units. Default "0.05". */
  minFee?: string;
  /** The most one job may pay out, in the asset's units. Default "100". */
  maxPerJob?: string;
  /** Evaluators whose jobs are taken. Default none: only jobs with no evaluator. */
  trustedEvaluators?: string[];
  /** Clients whose plain escrow jobs (no fund transfer) are taken. Default none. */
  trustedClients?: string[];
  /** Least time left before the job expires for the provider to start paying. Default 10 minutes. */
  minSecondsLeft?: number;
  /** Where the journal lives (no secrets). Without it, the journal is in memory only. */
  journalPath?: string;
  /** Sends unpaid principal back to a client whose job ended before it was paid out. Without it, the journal records what is owed. */
  refund?: (client: Address, token: Address, rawAmount: bigint) => Promise<string>;
  /** Adds received money to the private balance once a job completes. */
  earnings?: EarningsSweeper;
  log?: (msg: string) => void;
}

const short = (s: string) => (s.length > 24 ? `${s.slice(0, 14)}…${s.slice(-6)}` : s);
const lower = (s: string) => s.toLowerCase();

export class PrivatePayoutProvider {
  private readonly journal: Journal;
  private readonly log: (m: string) => void;
  private readonly busy = new Map<string, Promise<void>>();

  constructor(private readonly opts: PrivatePayoutProviderOptions) {
    this.journal = new Journal(opts.journalPath ?? null);
    this.log = opts.log ?? ((m) => console.log(`[private-payout] ${m}`));
  }

  private key(session: JobSessionLike) {
    return `${session.chainId}:${session.jobId}`;
  }

  private asset() {
    return this.opts.wallet.network.assets[0]!;
  }

  /**
   * The budget and fund transfer for a job. Fund-transfer: the payouts move
   * outside the escrow and the budget is the fee, grossed up for Virtuals' cut.
   * Escrow: the budget is payouts plus fee, grossed up.
   */
  async quote(session: JobSessionLike, payouts: PayoutLine[], mode: JobMode = "fund-transfer"): Promise<{ total: bigint; fee: bigint; budget: bigint; transfer: bigint; acpFeeBps: number }> {
    const a = this.asset();
    const total = payouts.reduce((s, p) => s + parseUnits(p.amount, a.decimals), 0n);
    const bps = BigInt(this.opts.feeBps ?? 50);
    const minFee = parseUnits(this.opts.minFee ?? "0.05", a.decimals);
    const pct = (total * bps + 9_999n) / 10_000n;
    const fee = pct > minFee ? pct : minFee;
    const acpFeeBps = Number(await this.opts.acpFeeBps(session));
    if (!Number.isInteger(acpFeeBps) || acpFeeBps < 0 || acpFeeBps >= 10_000) throw new Error("Bad ACP fee.");
    const net = mode === "fund-transfer" ? fee : total + fee;
    const budget = (net * 10_000n + BigInt(10_000 - acpFeeBps) - 1n) / BigInt(10_000 - acpFeeBps);
    return { total, fee, budget, transfer: mode === "fund-transfer" ? total : 0n, acpFeeBps };
  }

  /** Wire into acp-node-v2: agent.on("entry", (s, e) => provider.onEntry(s, e)). */
  async onEntry(session: JobSessionLike, entry: JobRoomEntry): Promise<void> {
    if (entry.kind === "message" && entry.contentType === "requirement" && session.status === "open") {
      await this.onRequirement(session, entry.content);
      return;
    }
    if (entry.kind !== "system") return;
    const k = this.key(session);
    switch (entry.event.type) {
      case "job.funded":
        await this.onFunded(session);
        break;
      case "job.completed": {
        const j = this.journal.get(k);
        if (j) this.journal.put(k, { ...j, state: "completed" });
        this.log(`job ${session.jobId} completed; the escrow paid this provider`);
        if (this.opts.earnings) {
          const res = await this.opts.earnings.sweep().catch((e) => ({ status: "error", reason: String(e instanceof Error ? e.message : e) }));
          this.log(`earnings: ${JSON.stringify(res)}`);
        }
        break;
      }
      case "job.rejected":
      case "job.expired":
        await this.onEnded(session, entry.event.type === "job.rejected" ? "rejected" : "expired");
        break;
      default:
        break;
    }
  }

  private async refuse(session: JobSessionLike, tag: string, detail: string) {
    this.log(`job ${session.jobId}: refusing (${tag}): ${detail}`);
    await session.sendMessage(detail).catch(() => undefined);
    await session.reject(tag);
  }

  private modeOf(session: JobSessionLike): JobMode | null {
    const hook = lower(session.job?.hookAddress || NO_EVALUATOR);
    const fundHook = FUND_TRANSFER_HOOKS[session.chainId];
    if (fundHook && hook === lower(fundHook)) return "fund-transfer";
    if (hook === NO_EVALUATOR) return "escrow";
    return null;
  }

  private async onRequirement(session: JobSessionLike, content: string) {
    const job = session.job;
    if (!job) return;
    if (job.description !== OFFERING_NAME) return this.refuse(session, "unsupported offering", `This provider only offers "${OFFERING_NAME}".`);
    const mode = this.modeOf(session);
    if (!mode) return this.refuse(session, "unsupported hook", "This provider takes fund-transfer jobs (ACP's FundTransferHook) only.");
    const evaluator = lower(job.evaluatorAddress);
    const trustedEvaluator = (this.opts.trustedEvaluators ?? []).map(lower).includes(evaluator);
    if (mode === "fund-transfer") {
      // ACP's FundTransferHook needs an evaluator (submit reverts with EscrowRequiredWithoutEvaluator otherwise).
      // Only the fee is in escrow, so the client evaluating its own job risks no more than the fee.
      if (evaluator !== lower(job.clientAddress) && !trustedEvaluator) {
        return this.refuse(session, "evaluator", "Name yourself as the evaluator (self-evaluation), or an evaluator this provider trusts. Only the fee is in escrow.");
      }
    } else if (evaluator !== NO_EVALUATOR && !trustedEvaluator) {
      return this.refuse(session, "untrusted evaluator", "This provider pays out before the job completes, so it takes escrow jobs with no evaluator, or an evaluator its owner trusts.");
    }
    if (mode === "escrow" && !(this.opts.trustedClients ?? []).map(lower).includes(lower(job.clientAddress))) {
      return this.refuse(
        session,
        "fund-transfer jobs only",
        "Create this job from the offering (requiredFunds), so the payout total reaches the provider when you fund and only the fee sits in escrow. Private payouts cannot be undone, so this provider never pays them out of an escrow that could still go back."
      );
    }
    let parsed: Awaited<ReturnType<typeof parseRequirement>>;
    try {
      parsed = await parseRequirement(content, (s) => this.opts.wallet.openSealed(s));
    } catch (e) {
      if (e instanceof RequirementError) return this.refuse(session, "bad requirement", e.message);
      throw e;
    }
    const a = this.asset();
    const q = await this.quote(session, parsed.payouts, mode);
    const max = parseUnits(this.opts.maxPerJob ?? "100", a.decimals);
    if (q.total > max) return this.refuse(session, "over job limit", `This provider pays out at most ${formatUnits(max, a.decimals)} ${a.symbol} per job.`);
    if (this.opts.wallet.largestPayment() < q.total) {
      return this.refuse(session, "not enough float", `This provider cannot cover ${formatUnits(q.total, a.decimals)} ${a.symbol} right now. Try a smaller job or later.`);
    }
    const destination = this.opts.wallet.walletAddress;
    if (mode === "fund-transfer" && !destination) throw new Error("A fund-transfer job needs the provider's wallet as the destination.");
    const budget = this.opts.budgetToken(q.budget, session.chainId);
    if (budget.decimals !== a.decimals) throw new Error("The ACP token and the Gloam asset have different decimals; this provider prices them 1:1 only when they match.");
    this.journal.put(this.key(session), {
      chainId: session.chainId,
      jobId: session.jobId,
      client: job.clientAddress,
      mode,
      state: "quoted",
      budgetRaw: q.budget.toString(),
      transferRaw: q.transfer.toString(),
      payouts: parsed.payouts,
      replyTo: parsed.replyTo,
      results: [],
      updatedAt: "",
    });
    if (mode === "fund-transfer") {
      const transfer = (this.opts.transferToken ?? assetToken)(a.address, a.symbol, a.decimals, q.transfer);
      await session.setBudgetWithFundRequest(budget, transfer, destination!);
    } else {
      await session.setBudget(budget);
    }
    const msg =
      mode === "fund-transfer"
        ? `Quote: ${formatUnits(q.total, a.decimals)} ${a.symbol} in ${parsed.payouts.length} private payout(s), sent to this provider when you fund; ${formatUnits(q.budget, a.decimals)} ${budget.symbol} fee in escrow (ACP's fees take ${q.acpFeeBps / 100}% of it).`
        : `Quote: ${formatUnits(q.total, a.decimals)} ${a.symbol} in ${parsed.payouts.length} private payout(s), ${formatUnits(q.fee, a.decimals)} fee, ${formatUnits(q.budget, a.decimals)} ${budget.symbol} budget (ACP's fees take ${q.acpFeeBps / 100}% of it).`;
    await session.sendMessage(msg).catch(() => undefined);
    this.log(`job ${session.jobId}: ${msg}${parsed.sealed ? " The list arrived sealed." : ""}`);
  }

  private async onFunded(session: JobSessionLike) {
    const k = this.key(session);
    if (this.busy.has(k)) return;
    const j = this.journal.get(k);
    if (!j) {
      this.log(`job ${session.jobId} funded, but this provider has no quote for it; leaving it`);
      return;
    }
    if (j.state !== "quoted" && j.state !== "paying" && j.state !== "stuck") return;
    this.journal.put(k, { ...j, funded: true });
    const job = session.job;
    if (job && job.budget.rawAmount < BigInt(j.budgetRaw)) {
      this.log(`job ${session.jobId}: funded with less than the quote; not paying`);
      return;
    }
    // A fund-transfer job can only be funded if the hook moved the payout total to us in the same transaction.
    if (j.mode === "fund-transfer" && this.modeOf(session) !== "fund-transfer") {
      this.log(`job ${session.jobId}: not a fund-transfer job; not paying`);
      return;
    }
    const left = job ? Number(job.expiredAt) - Math.floor(Date.now() / 1000) : Infinity;
    if (left < (this.opts.minSecondsLeft ?? 600)) {
      this.log(`job ${session.jobId}: too close to expiry (${left}s left); not paying`);
      return;
    }
    const run = this.payAll(session, { ...j, funded: true });
    this.busy.set(k, run);
    try {
      await run;
    } finally {
      this.busy.delete(k);
    }
  }

  private async payAll(session: JobSessionLike, j: JournalJob) {
    const k = this.key(session);
    const wallet = this.opts.wallet;
    const label = `ACP job ${session.jobId} client ${j.client}`.slice(0, 80);
    // Payouts run in order and stop at the first failure, so a resume keeps the paid ones and retries the rest.
    const results = j.results.filter((r) => r.status === "paid");
    this.journal.put(k, { ...j, state: "paying", results });
    for (let i = results.length; i < j.payouts.length; i++) {
      if (session.status === "rejected" || session.status === "expired") {
        this.log(`job ${session.jobId}: ${session.status} before payout ${i + 1}; stopping`);
        return;
      }
      const p = j.payouts[i]!;
      const note = p.note ?? `ACP job ${session.jobId}`;
      let r: PayoutResult = { to: p.to === "claim-link" ? "claim-link" : short(p.to), amount: p.amount, status: "failed" };
      for (let attempt = 0; attempt < 2 && r.status !== "paid"; attempt++) {
        const out =
          p.to === "claim-link"
            ? await wallet.payByClaimLink({ amount: p.amount, note, sealTo: j.replyTo!, label: `job ${session.jobId} payout ${i + 1}` })
            : await wallet.pay({ to: p.to, amount: p.amount, note, label: `job ${session.jobId} payout ${i + 1}` });
        if (out.status === "done") {
          r = { ...r, status: "paid", handle: String(out.payment ?? out.claimHandle), tx: String(out.hash), ...(out.sealedLink ? { sealedClaimLink: String(out.sealedLink) } : {}) };
        } else {
          r = { ...r, error: String(out.message ?? out.code ?? out.status) };
          if (out.status === "refused") break; // a limit will not change on a retry
        }
      }
      results.push(r);
      this.journal.put(k, { ...j, state: "paying", results });
      if (r.status !== "paid") {
        // With no evaluator a submit releases the escrow, so a job not paid in full is not submitted.
        this.journal.put(k, { ...j, state: "stuck", results });
        const after =
          j.mode === "fund-transfer"
            ? "when the job expires the escrow returns your fee, and this provider sends back the part of your payout total it did not pay out"
            : "when the job expires you can claim a refund of the escrow";
        await session.sendMessage(`Payout ${i + 1} failed (${r.error}). Not submitting: ${after}.`).catch(() => undefined);
        this.log(`job ${session.jobId}: payout ${i + 1} failed: ${r.error}`);
        return;
      }
      this.log(`job ${session.jobId}: payout ${i + 1}/${j.payouts.length} paid privately (${p.amount} to ${r.to})`);
    }
    for (const r of results) {
      if (!r.proof && r.handle) {
        const pr: Record<string, unknown> = await wallet.provePayment({ handle: r.handle, for: label }).catch((e) => ({ status: "error", message: String(e) }));
        if (pr.status === "done") r.proof = String(pr.proof);
      }
    }
    if (session.status === "rejected" || session.status === "expired") {
      this.journal.put(k, { ...j, state: "paying", results });
      this.log(`job ${session.jobId}: ${session.status} while paying; every payout went out, nothing to submit`);
      return;
    }
    const a = this.asset();
    const full = {
      type: DELIVERABLE_TYPE,
      jobId: session.jobId,
      network: wallet.network.key,
      asset: a.symbol,
      payouts: results.map(({ handle: _h, ...rest }) => rest),
      verify: `Each proof checks out at gloam.trade/verify and was made for "${label}".`,
    };
    const deliverable = j.replyTo
      ? { type: DELIVERABLE_TYPE, jobId: session.jobId, sealed: await sealToReceiveTag(JSON.stringify(full), j.replyTo), summary: { payouts: results.length, paid: results.filter((r) => r.status === "paid").length } }
      : full;
    await session.submit(JSON.stringify(deliverable));
    this.journal.put(k, { ...j, state: "submitted", results });
    this.log(`job ${session.jobId}: submitted the deliverable (${j.replyTo ? "sealed to the client" : "plain"})`);
  }

  /** A job rejected or expired before it was paid out in full: send back the principal that was not paid out. */
  private async onEnded(session: JobSessionLike, how: "rejected" | "expired") {
    const k = this.key(session);
    await this.busy.get(k)?.catch(() => undefined);
    const j = this.journal.get(k);
    this.log(`job ${session.jobId} ${how}${session.job ? ` (client ${short(session.job.clientAddress)})` : ""}`);
    if (!j || j.state === "submitted" || j.state === "completed" || j.state === "rejected" || j.state === "expired") return;
    const a = this.asset();
    const paid = j.results.filter((r) => r.status === "paid").reduce((s, r) => s + parseUnits(r.amount, a.decimals), 0n);
    const owed = j.mode === "fund-transfer" && j.funded ? BigInt(j.transferRaw) - paid : 0n;
    let refundTx: string | undefined;
    if (owed > 0n && this.opts.refund) {
      refundTx = await this.opts.refund(j.client as Address, a.address, owed).catch((e) => {
        this.log(`job ${session.jobId}: refund failed: ${e instanceof Error ? e.message : String(e)}`);
        return undefined;
      });
    }
    this.journal.put(k, { ...j, state: how, ...(owed > 0n ? { refundOwed: refundTx ? "0" : formatUnits(owed, a.decimals), ...(refundTx ? { refundTx } : {}) } : {}) });
    if (owed > 0n) {
      this.log(`job ${session.jobId}: ${formatUnits(owed, a.decimals)} ${a.symbol} of the client's principal was not paid out; ${refundTx ? `sent back (${refundTx})` : "owed back to the client"}`);
    }
  }

  /** The journal entry for a job, for the owner (no secrets in it). */
  status(chainId: number, jobId: string) {
    return this.journal.get(`${chainId}:${jobId}`) ?? null;
  }
}
