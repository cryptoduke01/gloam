/**
 * A Gloam provider agent for ACP: one service, "private payout".
 *
 * Lifecycle (acp-node-v2's seller flow, driven by `entry` events):
 *
 *   requirement message  check it, quote, session.setBudget()   (or reject: nothing is committed yet)
 *   job.funded           pay every payout privately, prove each one, session.submit(deliverable)
 *   job.completed        the escrow paid us: add the earnings to the private balance (EarningsSweeper)
 *
 * The provider pays from its own private balance as soon as the job is funded,
 * and is paid by the escrow when the job completes. So it fronts the money for
 * the length of one job. Two rules keep that safe: it takes only jobs with no
 * evaluator (submit then completes the job and releases the escrow) or with an
 * evaluator the owner trusts, and it only quotes when one private note can
 * cover every payout of the job.
 *
 * What is public, precisely:
 *   - The ACP leg: the job (client, provider, evaluator, expiry, the offering
 *     name), its budget, the client's funding of the escrow, the deliverable's
 *     hash, and the escrow paying the provider and Virtuals' fee. ACP's escrow
 *     is a public contract; Gloam does not change that.
 *   - Not public: who the payouts went to and how much each was. Each payout is
 *     a shielded transfer from the provider's private balance. The requirement
 *     (sealedPayouts) and the deliverable (replyTo) can be sealed so Virtuals'
 *     ACP backend, which stores those messages, reads neither.
 *   - The provider's own deposits of its earnings are public (the amount shows),
 *     so they are batched and rounded rather than made per job.
 *
 * Crash safety: a small journal (no secrets) records each payout as it lands,
 * so a restart never pays a job twice.
 */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { formatUnits, parseUnits, type Address } from "viem";
import { sealToReceiveTag } from "@gloamtrade/sdk";
import type { GloamAgent } from "@gloamtrade/game-plugin-gloam";
import { NO_EVALUATOR, type AssetTokenLike, type JobRoomEntry, type JobSessionLike } from "./acp.js";
import type { EarningsSweeper } from "./earnings.js";
import { OFFERING_NAME, RequirementError, parseRequirement, type PayoutLine } from "./offering.js";

export const DELIVERABLE_TYPE = "gloam.private_payout.v1";

export interface PayoutResult {
  to: string;
  amount: string;
  status: "paid" | "failed";
  /** The payment's handle in the provider's store (for a proof later). */
  handle?: string;
  tx?: string;
  /** A proof of this payment (gloampay1:…), made for the client. */
  proof?: string;
  /** For a claim-link payout: the link, sealed to the client's Gloam address. */
  sealedClaimLink?: string;
  error?: string;
}

type JournalJob = {
  chainId: number;
  jobId: string;
  client: string;
  state: "quoted" | "paying" | "submitted" | "completed" | "rejected" | "expired" | "stuck";
  budgetRaw: string;
  payouts: PayoutLine[];
  replyTo: string | null;
  results: PayoutResult[];
  updatedAt: string;
};

class Journal {
  constructor(readonly path: string | null) {}
  private read(): Record<string, JournalJob> {
    if (!this.path || !existsSync(this.path)) return this.mem;
    return JSON.parse(readFileSync(this.path, "utf8")) as Record<string, JournalJob>;
  }
  private mem: Record<string, JournalJob> = {};
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
  /** The provider's Gloam engine (its private float pays the payouts). */
  wallet: GloamAgent;
  /** The ACP budget token for a raw amount: AssetToken.usdcFromRaw(raw, chainId) with acp-node-v2. */
  budgetToken: (rawAmount: bigint, chainId: number) => AssetTokenLike;
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
  /** Least time left before the job expires for the provider to start paying. Default 10 minutes. */
  minSecondsLeft?: number;
  /** Where the journal lives (no secrets). Without it, the journal is in memory only. */
  journalPath?: string;
  /** Adds ACP earnings to the private balance once a job completes. */
  earnings?: EarningsSweeper;
  log?: (msg: string) => void;
}

const short = (s: string) => (s.length > 24 ? `${s.slice(0, 14)}…${s.slice(-6)}` : s);

export class PrivatePayoutProvider {
  private readonly journal: Journal;
  private readonly log: (m: string) => void;
  private readonly busy = new Set<string>();

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

  /** The budget that leaves the provider at least the payouts plus its fee after Virtuals' cut. */
  async quote(session: JobSessionLike, payouts: PayoutLine[]): Promise<{ total: bigint; fee: bigint; budget: bigint; acpFeeBps: number }> {
    const a = this.asset();
    const total = payouts.reduce((s, p) => s + parseUnits(p.amount, a.decimals), 0n);
    const bps = BigInt(this.opts.feeBps ?? 50);
    const minFee = parseUnits(this.opts.minFee ?? "0.05", a.decimals);
    const pct = (total * bps + 9_999n) / 10_000n;
    const fee = pct > minFee ? pct : minFee;
    const acpFeeBps = Number(await this.opts.acpFeeBps(session));
    if (!Number.isInteger(acpFeeBps) || acpFeeBps < 0 || acpFeeBps >= 10_000) throw new Error("Bad ACP fee.");
    const net = total + fee;
    const budget = (net * 10_000n + BigInt(10_000 - acpFeeBps) - 1n) / BigInt(10_000 - acpFeeBps);
    return { total, fee, budget, acpFeeBps };
  }

  /** Wire into acp-node-v2: agent.on("entry", (s, e) => provider.onEntry(s, e)). */
  async onEntry(session: JobSessionLike, entry: JobRoomEntry): Promise<void> {
    const job = session.job;
    if (entry.kind === "message" && entry.contentType === "requirement" && session.status === "open") {
      await this.onRequirement(session, entry.content);
      return;
    }
    if (entry.kind !== "system") return;
    const k = this.key(session);
    switch (entry.event.type) {
      case "job.funded":
        await this.onFunded(session, entry.event.amount);
        break;
      case "job.completed": {
        const j = this.journal.get(k);
        if (j) this.journal.put(k, { ...j, state: "completed" });
        this.log(`job ${session.jobId} completed; the escrow paid this provider`);
        if (this.opts.earnings) {
          const res = await this.opts.earnings.sweep().catch((e) => ({ status: "error", message: String(e instanceof Error ? e.message : e) }));
          this.log(`earnings: ${JSON.stringify(res)}`);
        }
        break;
      }
      case "job.rejected":
      case "job.expired": {
        const j = this.journal.get(k);
        if (j) this.journal.put(k, { ...j, state: entry.event.type === "job.rejected" ? "rejected" : "expired" });
        this.log(`job ${session.jobId} ${entry.event.type.slice(4)}${job ? ` (client ${short(job.clientAddress)})` : ""}`);
        break;
      }
      default:
        break;
    }
  }

  private async refuse(session: JobSessionLike, tag: string, detail: string) {
    this.log(`job ${session.jobId}: refusing (${tag}): ${detail}`);
    await session.sendMessage(detail).catch(() => undefined);
    await session.reject(tag);
  }

  private async onRequirement(session: JobSessionLike, content: string) {
    const job = session.job;
    if (!job) return;
    if (job.description !== OFFERING_NAME) return this.refuse(session, "unsupported offering", `This provider only offers "${OFFERING_NAME}".`);
    const evaluator = job.evaluatorAddress.toLowerCase();
    const trusted = (this.opts.trustedEvaluators ?? []).map((x) => x.toLowerCase());
    if (evaluator !== NO_EVALUATOR && !trusted.includes(evaluator)) {
      return this.refuse(
        session,
        "untrusted evaluator",
        "This provider pays out before the escrow releases, so it takes jobs with no evaluator, or with an evaluator its owner trusts."
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
    const { total, fee, budget, acpFeeBps } = await this.quote(session, parsed.payouts);
    const max = parseUnits(this.opts.maxPerJob ?? "100", a.decimals);
    if (total > max) return this.refuse(session, "over job limit", `This provider pays out at most ${formatUnits(max, a.decimals)} ${a.symbol} per job.`);
    const float = this.opts.wallet.largestPayment();
    if (float < total) {
      return this.refuse(session, "not enough float", `This provider cannot cover ${formatUnits(total, a.decimals)} ${a.symbol} right now. Try a smaller job or later.`);
    }
    const token = this.opts.budgetToken(budget, session.chainId);
    if (token.decimals !== a.decimals) throw new Error("The ACP token and the Gloam asset have different decimals; this provider prices them 1:1 only when they match.");
    this.journal.put(this.key(session), {
      chainId: session.chainId,
      jobId: session.jobId,
      client: job.clientAddress,
      state: "quoted",
      budgetRaw: budget.toString(),
      payouts: parsed.payouts,
      replyTo: parsed.replyTo,
      results: [],
      updatedAt: "",
    });
    await session.setBudget(token);
    const msg = `Quote: ${formatUnits(total, a.decimals)} ${a.symbol} in ${parsed.payouts.length} private payout(s), ${formatUnits(fee, a.decimals)} fee, ${formatUnits(budget, a.decimals)} ${token.symbol} budget (Virtuals keeps ${acpFeeBps / 100}% of it).`;
    await session.sendMessage(msg).catch(() => undefined);
    this.log(`job ${session.jobId}: ${msg}${parsed.sealed ? " The list arrived sealed." : ""}`);
  }

  private async onFunded(session: JobSessionLike, fundedAmount: number) {
    const k = this.key(session);
    if (this.busy.has(k)) return;
    const j = this.journal.get(k);
    if (!j) {
      this.log(`job ${session.jobId} funded, but this provider has no quote for it; leaving it (it expires and the client can claim a refund)`);
      return;
    }
    if (j.state === "submitted" || j.state === "completed") return;
    const job = session.job;
    const funded = job?.budget?.rawAmount ?? null;
    if (funded !== null && funded < BigInt(j.budgetRaw)) {
      this.log(`job ${session.jobId}: funded with less than the quote (${fundedAmount}); not paying`);
      return;
    }
    const left = job ? Number(job.expiredAt) - Math.floor(Date.now() / 1000) : Infinity;
    if (left < (this.opts.minSecondsLeft ?? 600)) {
      this.log(`job ${session.jobId}: too close to expiry (${left}s left); not paying`);
      return;
    }
    this.busy.add(k);
    try {
      await this.payAll(session, j);
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
    this.journal.put(k, { ...j, state: "paying" });
    for (let i = results.length; i < j.payouts.length; i++) {
      const p = j.payouts[i]!;
      const note = p.note ?? `ACP job ${session.jobId}`;
      let r: PayoutResult = { to: p.to === "claim-link" ? "claim-link" : short(p.to), amount: p.amount, status: "failed" };
      for (let attempt = 0; attempt < 2 && r.status !== "paid"; attempt++) {
        const out =
          p.to === "claim-link"
            ? await wallet.payByClaimLink({ amount: p.amount, note, sealTo: j.replyTo!, label: `job ${session.jobId} payout ${i + 1}` })
            : await wallet.pay({ to: p.to, amount: p.amount, note, label: `job ${session.jobId} payout ${i + 1}` });
        if (out.status === "done") {
          r = {
            ...r,
            status: "paid",
            handle: String(out.payment ?? out.claimHandle),
            tx: String(out.hash),
            ...(out.sealedLink ? { sealedClaimLink: String(out.sealedLink) } : {}),
          };
        } else {
          r = { ...r, error: String(out.message ?? out.code ?? out.status) };
          // A refusal (limits) will not change on a retry.
          if (out.status === "refused") break;
        }
      }
      results.push(r);
      this.journal.put(k, { ...j, state: "paying", results });
      if (r.status !== "paid") {
        // ERC-8183 gives a provider no reject once funded, and with no evaluator a submit releases the
        // whole budget. So a job that cannot be paid in full is not submitted: it expires and the
        // client can claim a refund. The payouts already made stay paid.
        this.journal.put(k, { ...j, state: "stuck", results });
        await session.sendMessage(`Payout ${i + 1} failed (${r.error}). Not submitting: the job will expire and you can claim a refund of the escrow.`).catch(() => undefined);
        this.log(`job ${session.jobId}: payout ${i + 1} failed: ${r.error}`);
        return;
      }
      this.log(`job ${session.jobId}: payout ${i + 1}/${j.payouts.length} paid privately (${p.amount} to ${r.to})`);
    }
    // A proof of each payment, made for this client.
    for (const r of results) {
      if (!r.proof && r.handle) {
        const pr: Record<string, unknown> = await wallet.provePayment({ handle: r.handle, for: label }).catch((e) => ({ status: "error", message: String(e) }));
        if (pr.status === "done") r.proof = String(pr.proof);
      }
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

  /** The journal entry for a job, for the owner (no secrets in it). */
  status(chainId: number, jobId: string) {
    return this.journal.get(`${chainId}:${jobId}`) ?? null;
  }
}

export type { Address };
