/**
 * A Gloam provider agent for ACP: one service, "private payout".
 *
 * Lifecycle (acp-node-v2's seller flow, driven by `entry` events):
 *
 *   requirement message  check it, quote, setBudgetWithFundRequest()   (or reject: nothing is committed yet)
 *   job.funded           read the job on chain, pay every payout privately, prove each one, submit(deliverable)
 *   job.completed        the escrow paid the fee: add received money to the private balance (EarningsSweeper)
 *   job.rejected/expired send back the principal that did not leave the float
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
 * Every job needs an evaluator. With none, ACP lets the client reject a funded
 * job and take the whole escrow back, after the payouts have gone out. A
 * fund-transfer job is evaluated by the client itself (ACP's FundTransferHook
 * needs an evaluator), which puts no more than the fee at risk; a plain escrow
 * job needs an evaluator the owner trusts.
 *
 * The provider pays out from its private float as soon as the job is funded
 * on chain (it reads jobs(jobId) itself; the job.funded event alone is not
 * trusted), so the principal that arrived in public is not deposited as one
 * matching amount; the EarningsSweeper adds it later in round batches, leaving
 * in the wallet whatever may still be owed back to a client. It quotes only
 * when one private note covers the whole job.
 *
 * What is public, precisely:
 *   - The ACP leg: the job (client, provider, evaluator, expiry, the offering
 *     name), the fee in escrow, the payout total moving from client to
 *     provider at funding, the deliverable's hash, and the escrow paying the
 *     fee and Virtuals' cut. ACP's escrow is a public contract.
 *   - Not public: who the payouts went to and how much each was. Each payout is
 *     a shielded transfer from the provider's private balance. The payout list
 *     (sealedPayouts) and the deliverable (sealed to replyTo) can be sealed so
 *     Virtuals' ACP backend, which stores those messages, reads neither.
 *     replyTo itself (the client's Gloam address) is outside the seal.
 *
 * One quote per job, and on a fund-transfer job the payouts are bounded by
 * what the client's fund() actually moved to the provider, read from the
 * funding transaction.
 *
 * Crash safety: a small journal (no secrets) records each payout before it is
 * sent ("sending"), then what came of it. A payout whose answer was lost is
 * never sent again: the provider looks for it in its own note store and on
 * chain (by the payout's label) and carries on only once it is settled; after
 * an hour it is cancelled on chain so it can never land. A refund counts what
 * arrived minus what left the float, is written down before it is sent, and
 * one whose answer was lost is looked for on chain before it is sent again.
 */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { decodeAbiParameters, formatUnits, parseEventLogs, parseUnits, type Address, type Hex, type PublicClient } from "viem";
import { sealToReceiveTag } from "@gloamtrade/sdk";
import { isNotSent, safeErrorMessage, type GloamAgent } from "@gloamtrade/game-plugin-gloam";
import {
  ACP_ABI,
  ACP_CONTRACTS,
  ACP_STATUS,
  ERC20_TRANSFER_EVENT,
  FUND_TRANSFER_EVENT_TOPIC,
  FUND_TRANSFER_HOOKS,
  JOB_FUNDED_TOPIC,
  NO_EVALUATOR,
  assetToken,
  type AssetTokenLike,
  type JobRoomEntry,
  type JobSessionLike,
  type OnChainJob,
} from "./acp.js";
import type { EarningsSweeper } from "./earnings.js";
import { OFFERING_NAME, RequirementError, parseRequirement, type PayoutLine } from "./offering.js";

export const DELIVERABLE_TYPE = "gloam.private_payout.v1";

export interface PayoutResult {
  to: string;
  amount: string;
  /**
   * sending      written before pay() is called: it may be going out
   * paid         it landed
   * unconfirmed  it may have gone out; never sent again, settled from the chain
   * failed       certainly not sent (safe to try again)
   */
  status: "sending" | "paid" | "unconfirmed" | "failed";
  /** The label the payment carries in the provider's note store (how a lost answer is found again). */
  label?: string;
  /** The payment's handle in the provider's store (kept out of the deliverable). */
  handle?: string;
  tx?: string;
  /** A proof of this payment (gloampay1:…), made for the client. */
  proof?: string;
  /** For a claim-link payout: the link, sealed to the client's Gloam address. */
  sealedClaimLink?: string;
  error?: string;
  startedAt?: string;
}

type JobMode = "fund-transfer" | "escrow";

export type JournalJob = {
  chainId: number;
  jobId: string;
  client: string;
  /** The evaluator the quote was made for. */
  evaluator?: string;
  mode: JobMode;
  state: "quoted" | "paying" | "unconfirmed" | "submitted" | "completed" | "rejected" | "expired" | "stuck";
  /** What sits in escrow (raw units of the ACP token). */
  budgetRaw: string;
  /** What the client sends the provider at funding, outside the escrow (fund-transfer jobs). */
  transferRaw: string;
  /** Set once the job is funded on chain (also when it was then blocked, rejected or expired). */
  funded?: boolean;
  /** The chain could not say yet whether the job was funded: asked again, and its principal held meanwhile. */
  fundingUnknown?: boolean;
  /** What the client's fund() actually moved to this provider (raw), read from the funding transaction. */
  receivedRaw?: string;
  /** The block the quote was made at (where a search for the funding starts). */
  quotedAtBlock?: string;
  /** The job's expiry (unix seconds). */
  expiredAt?: string;
  /** Why a funded job was not paid out (the on-chain job did not match the quote). */
  blocked?: string;
  payouts: PayoutLine[];
  replyTo: string | null;
  results: PayoutResult[];
  /** Principal certainly not paid out, owed back to the client (raw), what was sent back, and what is held until a payout settles. */
  refundDueRaw?: string;
  refundedRaw?: string;
  refundHeldRaw?: string;
  refundTxs?: string[];
  refundError?: string;
  /**
   * A refund written down before it was sent: when its answer is lost it is
   * looked for on chain (the token's Transfer to the client) before anything
   * is sent again, and only an hour on with nothing found is it sent again.
   */
  refundPending?: { raw: string; at: string; fromBlock?: string };
  /** Principal still owed back to the client, in the asset's units. */
  refundOwed?: string;
  /** The last refund transaction. */
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
  all(): [string, JournalJob][] {
    return Object.entries(this.read());
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

/** The chain reads the provider makes: jobs(jobId), the JobFunded log and its transaction, the block number. */
export type AcpChainReader = Pick<PublicClient, "readContract" | "getLogs" | "getBlockNumber" | "getTransactionReceipt">;

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
  /** Third-party evaluators whose jobs are taken. Default none: fund-transfer jobs the client evaluates itself. */
  trustedEvaluators?: string[];
  /** Clients whose plain escrow jobs (no fund transfer) are taken, with an evaluator from trustedEvaluators. Default none. */
  trustedClients?: string[];
  /** Least time left before the job expires for the provider to start paying. Default 10 minutes. */
  minSecondsLeft?: number;
  /** Where the journal lives (no secrets). Without it, the journal is in memory only. */
  journalPath?: string;
  /**
   * Sends unpaid principal back to a client whose job ended before it was paid
   * out. Resolve with the transaction hash once it is broadcast. Each refund is
   * written down before it is sent: one that throws is looked for on chain (the
   * token's Transfer to the client) and sent again only an hour later with
   * nothing found, or at once when the error says nothing was sent (NotSentError,
   * or `notSent: true`). Without it, the journal records what is owed.
   */
  refund?: (client: Address, token: Address, rawAmount: bigint) => Promise<string>;
  /** Adds received money to the private balance once a job completes (never principal still owed to a client). */
  earnings?: EarningsSweeper;
  /** The provider's address on ACP (the job's provider). Default: the Gloam engine's wallet. */
  providerAddress?: Address;
  /** The ACP contract. Default: ACP_CONTRACTS for the job's chain. */
  acpAddress?: Address;
  /** Reads the ACP contract. Default: the Gloam engine's public client (the same chain). */
  chain?: AcpChainReader;
  log?: (msg: string) => void;
}

const short = (s: string) => (s.length > 24 ? `${s.slice(0, 14)}…${s.slice(-6)}` : s);
const lower = (s: string) => s.toLowerCase();
const ACTIVE = new Set<JournalJob["state"]>(["quoted", "paying", "unconfirmed", "stuck"]);
const HOUR_MS = 60 * 60_000;
const FUNDED_ON_CHAIN = new Set<number>([ACP_STATUS.funded, ACP_STATUS.submitted, ACP_STATUS.completed]);

export class PrivatePayoutProvider {
  private readonly journal: Journal;
  private readonly log: (m: string) => void;
  private readonly busy = new Map<string, Promise<void>>();
  /** Jobs whose requirement is being quoted right now (one quote per job). */
  private readonly quoting = new Set<string>();
  /** Refund rounds run one at a time, so two can never both send the same refund. */
  private refunds: Promise<void> = Promise.resolve();

  constructor(private readonly opts: PrivatePayoutProviderOptions) {
    this.journal = new Journal(opts.journalPath ?? null);
    this.log = opts.log ?? ((m) => console.log(`[private-payout] ${m}`));
  }

  private key(session: { chainId: number; jobId: string }) {
    return `${session.chainId}:${session.jobId}`;
  }

  private asset() {
    return this.opts.wallet.network.assets[0]!;
  }

  private reader(): AcpChainReader {
    return this.opts.chain ?? this.opts.wallet.publicClient;
  }

  /** The label a payout carries in the provider's note store: unique per chain, job and payout. */
  payoutLabel(chainId: number, jobId: string, index: number) {
    return `acp ${chainId}:${jobId} payout ${index + 1}`;
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
        await this.retryRefunds();
        if (this.opts.earnings) {
          const res = await this.opts.earnings
            .sweep({ reserve: (token) => this.publicReserve(token) })
            .catch((e) => ({ status: "error", reason: safeErrorMessage(e) }));
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

  private modeOf(hookAddress: string | undefined, chainId: number): JobMode | null {
    const hook = lower(hookAddress || NO_EVALUATOR);
    const fundHook = FUND_TRANSFER_HOOKS[chainId];
    if (fundHook && hook === lower(fundHook)) return "fund-transfer";
    if (hook === NO_EVALUATOR) return "escrow";
    return null;
  }

  private async onRequirement(session: JobSessionLike, content: string) {
    const k = this.key(session);
    if (session.chainId !== this.opts.wallet.network.chainId) {
      return this.refuse(session, "wrong chain", `This provider pays on chain ${this.opts.wallet.network.chainId}; this job is on chain ${session.chainId}.`);
    }
    // One quote per job. A second list could otherwise replace the first after the client funded the
    // first price (the session can still read "open" before budget.set arrives).
    if (this.quoting.has(k) || this.journal.get(k)) {
      this.log(`job ${session.jobId}: a second requirement for a job already quoted; ignored`);
      await session.sendMessage("This job already has a quote. A different payout list needs a new job.").catch(() => undefined);
      return;
    }
    this.quoting.add(k);
    try {
      await this.quoteRequirement(session, content);
    } finally {
      this.quoting.delete(k);
    }
  }

  private async quoteRequirement(session: JobSessionLike, content: string) {
    const job = session.job;
    if (!job) return;
    const evaluator = lower(job.evaluatorAddress || NO_EVALUATOR);
    // Before anything else: with no evaluator ACP lets the client reject a funded job and take the
    // escrow back, after the payouts have gone out. No mode is safe without one.
    if (evaluator === NO_EVALUATOR) {
      return this.refuse(
        session,
        "no evaluator",
        "Name an evaluator: yourself on a fund-transfer job, or one this provider trusts. With no evaluator a client can reject a funded job and take the escrow back after the payouts have gone out."
      );
    }
    if (job.description !== OFFERING_NAME) return this.refuse(session, "unsupported offering", `This provider only offers "${OFFERING_NAME}".`);
    const mode = this.modeOf(job.hookAddress, session.chainId);
    if (!mode) return this.refuse(session, "unsupported hook", "This provider takes fund-transfer jobs (ACP's FundTransferHook) only.");
    const trustedEvaluator = (this.opts.trustedEvaluators ?? []).map(lower).includes(evaluator);
    if (mode === "fund-transfer") {
      // ACP's FundTransferHook needs an evaluator (submit reverts with EscrowRequiredWithoutEvaluator otherwise).
      // Only the fee is in escrow, so the client evaluating its own job risks no more than the fee.
      if (evaluator !== lower(job.clientAddress) && !trustedEvaluator) {
        return this.refuse(session, "evaluator", "Name yourself as the evaluator (self-evaluation), or an evaluator this provider trusts. Only the fee is in escrow.");
      }
    } else if (!trustedEvaluator) {
      // The whole payout total sits in escrow and the payouts go out first: only an evaluator the owner trusts may decide it.
      return this.refuse(session, "untrusted evaluator", "This provider pays out before the job completes, so on an escrow job the evaluator must be one its owner trusts.");
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
    const destination = this.opts.providerAddress ?? this.opts.wallet.walletAddress;
    if (mode === "fund-transfer" && !destination) throw new Error("A fund-transfer job needs the provider's wallet as the destination.");
    const budget = this.opts.budgetToken(q.budget, session.chainId);
    if (budget.decimals !== a.decimals) throw new Error("The ACP token and the Gloam asset have different decimals; this provider prices them 1:1 only when they match.");
    const quotedAtBlock = await this.reader().getBlockNumber().catch(() => null);
    this.journal.put(this.key(session), {
      chainId: session.chainId,
      jobId: session.jobId,
      client: job.clientAddress,
      evaluator: job.evaluatorAddress,
      mode,
      state: "quoted",
      budgetRaw: q.budget.toString(),
      transferRaw: q.transfer.toString(),
      ...(quotedAtBlock !== null ? { quotedAtBlock: quotedAtBlock.toString() } : {}),
      expiredAt: job.expiredAt.toString(),
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

  // ------------------------------------------------------------------ the chain

  /** The job as the ACP contract holds it, or null when no ACP contract is known for its chain. */
  async readJob(chainId: number, jobId: string): Promise<OnChainJob | null> {
    const acp = this.opts.acpAddress ?? ACP_CONTRACTS[chainId]?.acp;
    if (!acp) return null;
    const r = (await this.reader().readContract({ address: acp, abi: ACP_ABI, functionName: "jobs", args: [BigInt(jobId)] })) as readonly [Address, number, Address, number | bigint, Address, Address, bigint, string];
    return { client: r[0], status: Number(r[1]), provider: r[2], expiredAt: BigInt(r[3]), evaluator: r[4], hook: r[5], budget: BigInt(r[6]), description: r[7] };
  }

  /** Logs of `event` from `address`, from `fromBlock` to the head, in ranges the RPC accepts. */
  private async logsSince(address: Address, event: unknown, args: Record<string, unknown>, fromBlock?: string) {
    const reader = this.reader();
    const head = await reader.getBlockNumber();
    const from = fromBlock ? BigInt(fromBlock) : head > 100_000n ? head - 100_000n : 0n;
    const look = async (a: bigint, b: bigint, depth = 0): Promise<{ transactionHash: Hex | null; args?: Record<string, unknown> }[]> => {
      try {
        return (await reader.getLogs({ address, event: event as never, args: args as never, fromBlock: a, toBlock: b })) as never;
      } catch (e) {
        if (b <= a || depth >= 14) throw e;
        const mid = a + (b - a) / 2n;
        return [...(await look(a, mid, depth + 1)), ...(await look(mid + 1n, b, depth + 1))];
      }
    };
    return look(from, head);
  }

  /**
   * Whether fund() ran for this job (its JobFunded log, searched from the
   * quote's block), and on a fund-transfer job what it moved to this provider:
   * the hook's own log for this job, matched by the token's Transfer from the
   * client in the same transaction. Null where the chain could not say.
   */
  async funding(chainId: number, j: Pick<JournalJob, "jobId" | "client" | "mode" | "quotedAtBlock">): Promise<{ funded: boolean | null; received: bigint | null; tx?: Hex }> {
    const acp = this.opts.acpAddress ?? ACP_CONTRACTS[chainId]?.acp;
    if (!acp) return { funded: null, received: null };
    const event = ACP_ABI.find((x) => x.type === "event" && x.name === "JobFunded")!;
    let tx: Hex | null | undefined;
    try {
      const logs = await this.logsSince(acp, event, { jobId: BigInt(j.jobId) }, j.quotedAtBlock);
      if (!logs.length) return { funded: false, received: 0n };
      tx = logs[logs.length - 1]!.transactionHash;
    } catch {
      return { funded: null, received: null };
    }
    if (j.mode !== "fund-transfer") return { funded: true, received: 0n, ...(tx ? { tx } : {}) };
    if (!tx) return { funded: true, received: null };
    const us = lower(this.opts.providerAddress ?? this.opts.wallet.walletAddress ?? "");
    const token = lower(this.asset().address);
    const client = lower(j.client);
    try {
      const receipt = await this.reader().getTransactionReceipt({ hash: tx });
      const transfers = parseEventLogs({ abi: [ERC20_TRANSFER_EVENT], logs: receipt.logs as never }).filter(
        (l) => lower(l.address) === token && lower(l.args.from) === client && lower(l.args.to) === us
      );
      const hook = lower(FUND_TRANSFER_HOOKS[chainId] ?? "");
      const hookLog = receipt.logs.find(
        (l) => lower(l.address) === hook && l.topics[0] === FUND_TRANSFER_EVENT_TOPIC && l.topics[1] !== undefined && BigInt(l.topics[1]) === BigInt(j.jobId)
      );
      if (hookLog) {
        const [from, to, tok, amount] = decodeAbiParameters([{ type: "address" }, { type: "address" }, { type: "address" }, { type: "uint256" }], hookLog.data);
        const moved = lower(from) === client && lower(to) === us && lower(tok) === token && transfers.some((t) => t.args.value === amount);
        return { funded: true, received: moved ? amount : 0n, tx };
      }
      // A hook that logs differently: the token's own transfers, when this transaction funds this job alone.
      const funds = receipt.logs.filter((l) => lower(l.address) === lower(acp) && l.topics[0] === JOB_FUNDED_TOPIC);
      if (funds.length !== 1) return { funded: true, received: null, tx };
      return { funded: true, received: transfers.reduce((sum, t) => sum + t.args.value, 0n), tx };
    } catch {
      return { funded: true, received: null, tx };
    }
  }

  /** Whether fund() ran for this job. Null when the chain could not say. */
  async fundedOnChain(chainId: number, jobId: string, fromBlock?: string): Promise<boolean | null> {
    return (await this.funding(chainId, { jobId, client: "", mode: "escrow", quotedAtBlock: fromBlock })).funded;
  }

  /** Why an on-chain job may not be paid out against this quote, or null when it may. */
  private notPayable(chainId: number, j: JournalJob, c: OnChainJob): string | null {
    if (c.status !== ACP_STATUS.funded) return `the job is not funded on chain (status ${c.status})`;
    const us = this.opts.providerAddress ?? this.opts.wallet.walletAddress;
    if (!us || lower(c.provider) !== lower(us)) return "the job's provider on chain is not this provider";
    if (lower(c.client) !== lower(j.client)) return "the job's client on chain is not the one quoted";
    if (c.description !== OFFERING_NAME) return "the job on chain is not for this offering";
    const hook = j.mode === "fund-transfer" ? FUND_TRANSFER_HOOKS[chainId] : NO_EVALUATOR;
    if (!hook || lower(c.hook) !== lower(hook)) return "the job's hook on chain is not the one quoted";
    if (lower(c.evaluator) === NO_EVALUATOR) return "the job has no evaluator on chain";
    if (j.evaluator && lower(c.evaluator) !== lower(j.evaluator)) return "the job's evaluator on chain is not the one quoted";
    if (c.budget < BigInt(j.budgetRaw)) return "the job's budget on chain is less than the quote";
    const left = Number(c.expiredAt) - Math.floor(Date.now() / 1000);
    if (left < (this.opts.minSecondsLeft ?? 600)) return `the job is too close to expiry (${left}s left)`;
    return null;
  }

  // ------------------------------------------------------------------ paying

  private async onFunded(session: JobSessionLike) {
    const k = this.key(session);
    if (this.busy.has(k)) return;
    const j = this.journal.get(k);
    if (!j) {
      this.log(`job ${session.jobId} funded, but this provider has no quote for it; leaving it`);
      return;
    }
    if (!ACTIVE.has(j.state)) return;
    const run = this.fundedRun(session, j);
    this.busy.set(k, run);
    try {
      await run;
    } finally {
      this.busy.delete(k);
    }
  }

  private async fundedRun(session: JobSessionLike, j: JournalJob) {
    const k = this.key(session);
    // The job.funded event is off chain: read what the contract says before any money moves.
    let onChain: OnChainJob | null;
    try {
      onChain = await this.readJob(session.chainId, session.jobId);
    } catch (e) {
      this.log(`job ${session.jobId}: could not read the job on chain (${safeErrorMessage(e)}); not paying`);
      return;
    }
    if (!onChain) {
      this.log(`job ${session.jobId}: no ACP contract known for chain ${session.chainId}; not paying`);
      return;
    }
    if (session.chainId !== this.opts.wallet.network.chainId) {
      this.log(`job ${session.jobId}: on chain ${session.chainId}, and this provider pays on chain ${this.opts.wallet.network.chainId}; not paying`);
      return;
    }
    const why = this.notPayable(session.chainId, j, onChain);
    if (why) {
      // Funded on chain but not payable (blocked), or funded then rejected or expired before this ran:
      // the principal arrived, stays reserved, and onEnded sends back what did not leave the float.
      let next: JournalJob = { ...j, blocked: why };
      if (FUNDED_ON_CHAIN.has(onChain.status)) next = { ...next, funded: true, fundingUnknown: undefined };
      else if (!j.funded && j.mode === "fund-transfer" && (onChain.status === ACP_STATUS.rejected || onChain.status === ACP_STATUS.expired)) {
        const f = await this.funding(session.chainId, j);
        next = { ...next, funded: f.funded === true, fundingUnknown: f.funded === null ? true : undefined, ...(f.funded && f.received !== null ? { receivedRaw: f.received.toString() } : {}) };
      }
      this.journal.put(k, next);
      this.log(`job ${session.jobId}: not paying: ${why}`);
      return;
    }
    // On a fund-transfer job, what the client's fund() moved to this provider bounds the payouts.
    let received = j.receivedRaw !== undefined ? BigInt(j.receivedRaw) : null;
    if (j.mode === "fund-transfer" && received === null) received = (await this.funding(session.chainId, j)).received;
    if (j.mode === "fund-transfer" && received === null) {
      this.journal.put(k, { ...j, funded: true, blocked: "could not read what the funding moved yet" });
      this.log(`job ${session.jobId}: funded, but what the funding moved could not be read yet; not paying (tried again on the next event or resume)`);
      return;
    }
    const a = this.asset();
    const total = j.payouts.reduce((sum, p) => sum + parseUnits(p.amount, a.decimals), 0n);
    if (j.mode === "fund-transfer" && received! < total) {
      const why2 = `the client's funding moved ${formatUnits(received!, a.decimals)} ${a.symbol}, less than the ${formatUnits(total, a.decimals)} ${a.symbol} of payouts`;
      this.journal.put(k, { ...j, funded: true, receivedRaw: received!.toString(), blocked: why2 });
      await session.sendMessage(`Not paying: ${why2}. What arrived goes back when the job ends.`).catch(() => undefined);
      this.log(`job ${session.jobId}: not paying: ${why2}`);
      return;
    }
    const jf: JournalJob = { ...j, funded: true, ...(received !== null ? { receivedRaw: received.toString() } : {}), blocked: undefined };
    this.journal.put(k, jf);
    await this.payAll(session, jf);
  }

  /** Settle a payout whose answer was lost: find it by its label in the note store, after reading the chain. */
  private async reconcile(j: JournalJob, r: PayoutResult): Promise<PayoutResult> {
    if (r.status !== "sending" && r.status !== "unconfirmed") return r;
    // A result written before labels: nothing to look it up by, so it is never sent again.
    if (!r.label) return { ...r, status: "unconfirmed" };
    const w = this.opts.wallet;
    await w.refresh().catch(() => undefined);
    const n = w.findPayment(r.label);
    // The engine keeps a payment's note from before it is sent and drops it only when nothing went out.
    if (!n) return { ...r, status: "failed", error: r.error ?? "It was not sent." };
    if (n.status === "pending") {
      if (!("stale" in n && n.stale)) return { ...r, status: "unconfirmed", handle: n.handle };
      // An hour with nothing on chain: make sure it never lands by spending the note it spends back to
      // this provider. If it lands first, that send reverts and the payout counts as paid.
      await w.cancelPayment(n.handle).catch(() => undefined);
      const after = w.findPayment(r.label);
      if (!after) return { ...r, status: "failed", error: "It never landed and can no longer land (cancelled)." };
      if (after.status === "pending") return { ...r, status: "unconfirmed", handle: after.handle };
      return this.reconcile(j, { ...r, status: "unconfirmed" });
    }
    const out: PayoutResult = { ...r, status: "paid", handle: n.handle, ...(n.createdTx ? { tx: n.createdTx } : {}), error: undefined };
    if (n.origin === "claim" && j.replyTo && !r.sealedClaimLink) {
      out.sealedClaimLink = await sealToReceiveTag(w.claimLink(n.handle).link, j.replyTo);
    }
    return out;
  }

  private async reconcileAll(j: JournalJob): Promise<PayoutResult[]> {
    const out: PayoutResult[] = [];
    for (const r of j.results) out.push(await this.reconcile(j, r));
    return out;
  }

  private async payAll(session: JobSessionLike, j: JournalJob) {
    const k = this.key(session);
    const wallet = this.opts.wallet;
    const label = `ACP job ${session.jobId} client ${j.client}`.slice(0, 80);
    // A payout left unsure by an earlier run is settled first, and never sent again.
    const results = await this.reconcileAll(j);
    if (results.some((r) => r.status === "sending" || r.status === "unconfirmed")) {
      this.journal.put(k, { ...j, state: "unconfirmed", results });
      this.log(`job ${session.jobId}: a payout is still unconfirmed; waiting for it to settle before anything else`);
      return;
    }
    this.journal.put(k, { ...j, state: "paying", results });
    // Payouts run in order and stop at the first that is not paid, so a resume keeps the paid ones.
    for (let i = 0; i < j.payouts.length; i++) {
      if (results[i]?.status === "paid") continue;
      if (session.status === "rejected" || session.status === "expired") {
        this.log(`job ${session.jobId}: ${session.status} before payout ${i + 1}; stopping`);
        return;
      }
      const p = j.payouts[i]!;
      const note = p.note ?? `ACP job ${session.jobId}`;
      const payLabel = this.payoutLabel(session.chainId, session.jobId, i);
      const base = { to: p.to === "claim-link" ? "claim-link" : short(p.to), amount: p.amount, label: payLabel };
      // The intent is written before pay() is called, so a crash in between is never read as "not sent".
      results[i] = { ...base, status: "sending", startedAt: new Date().toISOString() };
      this.journal.put(k, { ...j, state: "paying", results });
      let r: PayoutResult;
      try {
        const out =
          p.to === "claim-link"
            ? await wallet.payByClaimLink({ amount: p.amount, note, sealTo: j.replyTo!, label: payLabel })
            : await wallet.pay({ to: p.to, amount: p.amount, note, label: payLabel });
        const msg = String(out.message ?? out.code ?? out.status);
        if (out.status === "done") {
          r = { ...base, status: "paid", handle: String(out.payment ?? out.claimHandle), ...(out.hash ? { tx: String(out.hash) } : {}), ...(out.sealedLink ? { sealedClaimLink: String(out.sealedLink) } : {}) };
        } else if (out.status === "unconfirmed" || out.check || out.code === "unconfirmed_payment") {
          r = { ...base, status: "unconfirmed", error: msg };
        } else {
          // Refused or failed before anything went out (the engine drops a payment's notes only then).
          r = { ...base, status: "failed", error: msg };
        }
      } catch (e) {
        r = { ...base, status: "unconfirmed", error: safeErrorMessage(e) };
      }
      // An answer that was lost or never came: look before deciding anything.
      if (r.status === "unconfirmed") r = await this.reconcile(j, r);
      results[i] = r;
      if (r.status === "unconfirmed") {
        this.journal.put(k, { ...j, state: "unconfirmed", results });
        await session
          .sendMessage(`Payout ${i + 1} may have gone out (${r.error}). This provider never sends it twice: it reads the chain and carries on once that payout settles.`)
          .catch(() => undefined);
        this.log(`job ${session.jobId}: payout ${i + 1} unconfirmed: ${r.error}`);
        return;
      }
      if (r.status !== "paid") {
        // Not paid in full: not submitted. The job expires and what did not leave the float goes back.
        this.journal.put(k, { ...j, state: "stuck", results });
        const after =
          j.mode === "fund-transfer"
            ? "when the job expires the escrow returns your fee, and this provider sends back the part of your payout total it did not pay out"
            : "when the job expires you can claim a refund of the escrow";
        await session.sendMessage(`Payout ${i + 1} failed (${r.error}). Not submitting: ${after}.`).catch(() => undefined);
        this.log(`job ${session.jobId}: payout ${i + 1} failed: ${r.error}`);
        return;
      }
      this.journal.put(k, { ...j, state: "paying", results });
      this.log(`job ${session.jobId}: payout ${i + 1}/${j.payouts.length} paid privately (${p.amount} to ${r.to})`);
    }
    for (const r of results) {
      if (!r.proof && r.handle) {
        const pr: Record<string, unknown> = await wallet.provePayment({ handle: r.handle, for: label }).catch((e) => ({ status: "error", message: safeErrorMessage(e) }));
        if (pr.status === "done") r.proof = String(pr.proof);
      }
    }
    this.journal.put(k, { ...j, state: "paying", results });
    const still = await this.readJob(session.chainId, session.jobId).catch(() => null);
    if (session.status === "rejected" || session.status === "expired" || (still && still.status !== ACP_STATUS.funded)) {
      this.log(`job ${session.jobId}: no longer funded on chain; every payout went out, nothing to submit`);
      return;
    }
    const a = this.asset();
    const full = {
      type: DELIVERABLE_TYPE,
      jobId: session.jobId,
      network: wallet.network.key,
      asset: a.symbol,
      payouts: results.map(({ handle: _h, label: _l, startedAt: _s, ...rest }) => rest),
      verify: `Each proof checks out at gloam.trade/verify and was made for "${label}". A proof shows that a private payment of that amount was made from this provider's notes. It does not show who received it: each recipient confirms receipt.`,
    };
    const deliverable = j.replyTo
      ? { type: DELIVERABLE_TYPE, jobId: session.jobId, sealed: await sealToReceiveTag(JSON.stringify(full), j.replyTo), summary: { payouts: results.length, paid: results.filter((r) => r.status === "paid").length } }
      : full;
    await session.submit(JSON.stringify(deliverable));
    this.journal.put(k, { ...j, state: "submitted", results });
    this.log(`job ${session.jobId}: submitted the deliverable (${j.replyTo ? "sealed to the client" : "plain"})`);
  }

  // ------------------------------------------------------------------ refunds

  private paidRaw(results: PayoutResult[], status: PayoutResult["status"][]) {
    const a = this.asset();
    return results.filter((r) => status.includes(r.status)).reduce((s, r) => s + parseUnits(r.amount, a.decimals), 0n);
  }

  /** A job rejected or expired before it was paid out in full: send back the principal that did not leave the float. */
  private async onEnded(session: JobSessionLike, how: "rejected" | "expired") {
    const k = this.key(session);
    await this.busy.get(k)?.catch(() => undefined);
    const j = this.journal.get(k);
    this.log(`job ${session.jobId} ${how}${session.job ? ` (client ${short(session.job.clientAddress)})` : ""}`);
    if (!j || j.state === "submitted" || j.state === "completed") return;
    if (j.state !== "rejected" && j.state !== "expired") {
      let next: JournalJob = { ...j, state: how, refundedRaw: j.refundedRaw ?? "0", refundTxs: j.refundTxs ?? [] };
      if (!j.funded && j.mode === "fund-transfer") {
        // An RPC that cannot answer now is asked again later: never read as "not funded".
        const f = await this.funding(session.chainId, j);
        next = { ...next, funded: f.funded === true, fundingUnknown: f.funded === null ? true : undefined, ...(f.funded && f.received !== null ? { receivedRaw: f.received.toString() } : {}) };
      }
      this.journal.put(k, next);
    }
    await this.retryRefunds([k]);
  }

  /**
   * For every job that ended early: settle payouts that were unsure, work out
   * what arrived and certainly did not leave the float, and send back what is
   * still owed. Runs on each job end and before each earnings sweep; owner code
   * can call it too. Rounds run one at a time.
   */
  retryRefunds(keys?: string[]): Promise<void> {
    const run = this.refunds.then(() => this.refundRound(keys));
    this.refunds = run.catch(() => undefined);
    return run;
  }

  /** A refund to this client of exactly `raw`, sent since `fromBlock` and not counted yet: its hash, null for none, undefined when the chain could not say. */
  private async findRefund(j: JournalJob, raw: bigint, fromBlock: string | undefined, counted: string[]): Promise<string | null | undefined> {
    const us = this.opts.providerAddress ?? this.opts.wallet.walletAddress;
    if (!us) return undefined;
    try {
      const logs = await this.logsSince(this.asset().address, ERC20_TRANSFER_EVENT, { from: us, to: j.client }, fromBlock ?? j.quotedAtBlock);
      const hit = logs.find((l) => BigInt((l.args as { value?: bigint } | undefined)?.value ?? -1n) === raw && l.transactionHash && !counted.includes(l.transactionHash));
      return hit?.transactionHash ?? null;
    } catch {
      return undefined;
    }
  }

  private async refundRound(keys?: string[]): Promise<void> {
    const a = this.asset();
    for (const [k, j0] of this.journal.all()) {
      if (keys && !keys.includes(k)) continue;
      if ((j0.state !== "rejected" && j0.state !== "expired") || j0.mode !== "fund-transfer") continue;
      if (!j0.funded && !j0.fundingUnknown) continue;
      let j = j0;
      // Whether it was funded, and what arrived: asked again until the chain answers.
      if (!j.funded || j.receivedRaw === undefined) {
        const f = await this.funding(j.chainId, j);
        if (f.funded === null || (f.funded && f.received === null)) {
          this.journal.put(k, { ...j, fundingUnknown: !j.funded ? true : undefined });
          this.log(`job ${j.jobId}: the chain could not say what its funding moved; asked again on the next round`);
          continue;
        }
        j = { ...j, funded: f.funded, fundingUnknown: undefined, ...(f.funded ? { receivedRaw: f.received!.toString() } : {}) };
        this.journal.put(k, j);
        if (!j.funded) continue;
      }
      const results = await this.reconcileAll(j);
      const received = BigInt(j.receivedRaw!);
      const paid = this.paidRaw(results, ["paid"]);
      const held = this.paidRaw(results, ["sending", "unconfirmed"]);
      const due = received > paid + held ? received - paid - held : 0n;
      let refunded = BigInt(j.refundedRaw ?? "0");
      const txs = [...(j.refundTxs ?? [])];
      let refundError: string | undefined;
      let pending = j.refundPending;
      // A refund sent before whose answer was lost: found on chain before anything is sent again.
      if (pending) {
        const found = await this.findRefund(j, BigInt(pending.raw), pending.fromBlock, txs);
        if (found) {
          refunded += BigInt(pending.raw);
          txs.push(found);
          pending = undefined;
          this.log(`job ${j.jobId}: the refund whose answer was lost landed (${found})`);
        } else if (found === null && Date.now() - Date.parse(pending.at) > HOUR_MS) {
          pending = undefined; // an hour and nothing on chain: it never went out
        }
      }
      const owed = due > refunded ? due - refunded : 0n;
      if (owed > 0n && !pending && this.opts.refund) {
        const head = await this.reader().getBlockNumber().catch(() => null);
        pending = { raw: owed.toString(), at: new Date().toISOString(), ...(head !== null ? { fromBlock: (head > 2n ? head - 2n : 0n).toString() } : {}) };
        // Written down before it is sent, so a lost answer is looked for, never sent twice.
        this.journal.put(k, { ...j, results, refundPending: pending });
        try {
          const tx = await this.opts.refund(j.client as Address, a.address, owed);
          refunded += owed;
          txs.push(tx);
          pending = undefined;
          this.log(`job ${j.jobId}: ${formatUnits(owed, a.decimals)} ${a.symbol} of the client's principal was not paid out; sent back (${tx})`);
        } catch (e) {
          refundError = safeErrorMessage(e);
          if (isNotSent(e)) {
            pending = undefined; // certainly not sent: tried again on the next round
            this.log(`job ${j.jobId}: the refund was not sent (${refundError}); it is tried again on the next round`);
          } else {
            this.log(`job ${j.jobId}: the refund's answer was lost (${refundError}); it is looked for on chain before it is sent again`);
          }
        }
      } else if (owed > 0n && !this.opts.refund) {
        this.log(`job ${j.jobId}: ${formatUnits(owed, a.decimals)} ${a.symbol} of the client's principal was not paid out; owed back to the client`);
      }
      if (held > 0n) this.log(`job ${j.jobId}: ${formatUnits(held, a.decimals)} ${a.symbol} held until an unconfirmed payout settles`);
      const left = due > refunded ? due - refunded : 0n;
      this.journal.put(k, {
        ...j,
        results,
        refundDueRaw: due.toString(),
        refundedRaw: refunded.toString(),
        refundHeldRaw: held.toString(),
        refundTxs: txs,
        refundOwed: formatUnits(left, a.decimals),
        ...(txs.length ? { refundTx: txs[txs.length - 1] } : {}),
        refundPending: pending,
        refundError,
      });
    }
  }

  /**
   * What of `token` in the provider's public wallet may still belong to
   * clients: principal of funded jobs not yet paid out (blocked ones too), of
   * quoted jobs that may be funded any moment or whose funding the chain could
   * not confirm, and refunds owed, held or not yet confirmed. The earnings sweep
   * leaves this much in the wallet.
   */
  publicReserve(token: Address): bigint {
    const a = this.asset();
    if (lower(token) !== lower(a.address)) return 0n;
    const chainId = this.opts.wallet.network.chainId;
    let sum = 0n;
    for (const [, j] of this.journal.all()) {
      if (j.mode !== "fund-transfer" || j.chainId !== chainId) continue;
      const transfer = BigInt(j.transferRaw);
      const arrived = j.receivedRaw !== undefined ? BigInt(j.receivedRaw) : transfer;
      const paid = this.paidRaw(j.results, ["paid"]);
      if (j.state === "submitted" || j.state === "completed") continue;
      if (j.fundingUnknown) {
        sum += transfer;
        continue;
      }
      if (j.state === "rejected" || j.state === "expired") {
        if (!j.funded) continue;
        const refunded = BigInt(j.refundedRaw ?? "0");
        sum += arrived > paid + refunded ? arrived - paid - refunded : 0n;
        continue;
      }
      if (!j.funded) {
        // Quoted: the transfer can arrive until the job expires.
        if (j.expiredAt && Number(j.expiredAt) * 1000 < Date.now()) continue;
        sum += transfer;
        continue;
      }
      sum += arrived > paid ? arrived - paid : 0n;
    }
    return sum;
  }

  /**
   * Carry on with a funded job: settle a payout left unconfirmed, then pay the
   * rest and submit. The next job.funded event does the same; owner code can
   * call this on a timer for jobs whose state is "unconfirmed".
   */
  resume(session: JobSessionLike): Promise<void> {
    return this.onFunded(session);
  }

  /** The journal entry for a job, for the owner (no secrets in it). */
  status(chainId: number, jobId: string) {
    return this.journal.get(`${chainId}:${jobId}`) ?? null;
  }
}
