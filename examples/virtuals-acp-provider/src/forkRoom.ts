/**
 * ACP on a local fork, for the end-to-end demo and test.
 *
 * The on-chain leg is real: jobs are created, budgeted, funded and submitted on
 * Virtuals' deployed ACP contract (ERC-8183) inside an anvil fork, by plain
 * keys made for the run. The off-chain leg, which in production is Virtuals'
 * ACP backend (job room messages, the stored deliverable, the event stream),
 * is played here in process: the room hands the provider the same `entry`
 * events acp-node-v2 does, and plays the client, who funds as soon as the
 * budget is set.
 */
import {
  createWalletClient,
  decodeEventLog,
  encodeFunctionData,
  http,
  keccak256,
  toHex,
  type Account,
  type Address,
  type Chain,
  type Hex,
  type PublicClient,
  type Transport,
  type WalletClient,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  ACP_ABI,
  FUND_TRANSFER_HOOKS,
  NO_EVALUATOR,
  assetToken,
  encodeFundTransfer,
  type AcpAgentLike,
  type AcpJobEvent,
  type AcpJobLike,
  type AssetTokenLike,
  type DerivedStatus,
  type JobRoomEntry,
  type JobSessionLike,
} from "./acp.js";

const ERC20_APPROVE = [
  { type: "function", name: "approve", stateMutability: "nonpayable", inputs: [{ name: "s", type: "address" }, { name: "a", type: "uint256" }], outputs: [{ type: "bool" }] },
] as const;

type Handler = (session: JobSessionLike, entry: JobRoomEntry) => void | Promise<void>;

/** The client's look at a submitted deliverable: true completes the job (releasing the fee), false rejects it. */
export type ClientEvaluation = (jobId: string, deliverable: string) => Promise<boolean>;

export interface ForkRoomOptions {
  client: PublicClient;
  rpc: string;
  chainId: number;
  acp: Address;
  paymentToken: Address;
  tokenSymbol: string;
  tokenDecimals: number;
  providerKey: Hex;
  clientKey: Hex;
  /** How the client evaluates a deliverable when it is the job's evaluator. Default: completes. */
  evaluate?: ClientEvaluation;
  log?: (m: string) => void;
}

class ForkSession implements JobSessionLike {
  readonly entries: JobRoomEntry[] = [];
  job: AcpJobLike | null = null;
  messages: { from: string; content: string; contentType: string }[] = [];

  constructor(
    private readonly room: ForkAcpRoom,
    readonly jobId: string,
    readonly chainId: number
  ) {}

  get status(): DerivedStatus {
    const map: Record<string, DerivedStatus> = {
      "job.created": "open",
      "budget.set": "budget_set",
      "job.funded": "funded",
      "job.submitted": "submitted",
      "job.completed": "completed",
      "job.rejected": "rejected",
      "job.expired": "expired",
    };
    for (let i = this.entries.length - 1; i >= 0; i--) {
      const e = this.entries[i]!;
      if (e.kind === "system" && map[e.event.type]) return map[e.event.type]!;
    }
    return "open";
  }

  /** The provider's fund request on a fund-transfer job, as set on chain. */
  fundRequest: { token: AssetTokenLike; destination: Address } | null = null;
  /** The client misbehaves: rejects the job right after funding it. */
  clientRejectsAfterFunding = false;

  setBudget(amount: AssetTokenLike) {
    return this.room.providerSetBudget(this, amount);
  }
  setBudgetWithFundRequest(amount: AssetTokenLike, transferAmount: AssetTokenLike, destination: string) {
    return this.room.providerSetBudget(this, amount, { token: transferAmount, destination: destination as Address });
  }
  submit(deliverable: string) {
    return this.room.providerSubmit(this, deliverable);
  }
  async sendMessage(content: string, contentType = "text") {
    this.messages.push({ from: "provider", content, contentType });
  }
  reject(reason: string) {
    return this.room.providerReject(this, reason);
  }
}

export class ForkAcpRoom implements AcpAgentLike {
  private handler: Handler | null = null;
  private queue: Promise<void> = Promise.resolve();
  private readonly sessions = new Map<string, ForkSession>();
  /** What Virtuals' ACP backend would store: each job's deliverable text. */
  readonly deliverables = new Map<string, string>();
  /** Each job the provider rejected, and whether the contract took the reject. */
  readonly rejections = new Map<string, { reason: string; onChain: boolean; detail: string }>();
  /** The public ACP transactions of each job, in order. */
  readonly txs = new Map<string, { what: string; hash: Hex }[]>();
  readonly provider: ReturnType<typeof privateKeyToAccount>;
  readonly clientAccount: ReturnType<typeof privateKeyToAccount>;
  private readonly providerWallet: WalletClient<Transport, Chain, Account>;
  private readonly clientWallet: WalletClient<Transport, Chain, Account>;
  private readonly log: (m: string) => void;

  constructor(private readonly opts: ForkRoomOptions) {
    this.provider = privateKeyToAccount(opts.providerKey);
    this.clientAccount = privateKeyToAccount(opts.clientKey);
    const chain: Chain = { id: opts.chainId, name: `fork ${opts.chainId}`, nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 }, rpcUrls: { default: { http: [opts.rpc] } } };
    this.providerWallet = createWalletClient({ account: this.provider, chain, transport: http(opts.rpc) });
    this.clientWallet = createWalletClient({ account: this.clientAccount, chain, transport: http(opts.rpc) });
    this.log = opts.log ?? (() => undefined);
  }

  on(_event: "entry", handler: Handler) {
    this.handler = handler;
    return this;
  }
  async getAddress() {
    return this.provider.address;
  }
  async start() {}

  /** Run handlers one entry at a time, like the SDK's dispatch, so a handler that acts never re-enters. */
  private emit(session: ForkSession, entry: JobRoomEntry) {
    session.entries.push(entry);
    this.queue = this.queue.then(async () => {
      try {
        await this.handler?.(session, entry);
      } catch (e) {
        this.log(`handler error on job ${session.jobId}: ${e instanceof Error ? e.message : String(e)}`);
      }
    });
  }

  /** Wait until every queued entry has been handled. */
  async settle(): Promise<void> {
    let q: Promise<void>;
    do {
      q = this.queue;
      await q;
    } while (q !== this.queue);
  }

  private async send(wallet: WalletClient<Transport, Chain, Account>, to: Address, data: Hex): Promise<Hex> {
    const hash = await wallet.sendTransaction({ to, data, chain: wallet.chain, account: wallet.account });
    const receipt = await this.opts.client.waitForTransactionReceipt({ hash });
    if (receipt.status !== "success") throw new Error(`ACP call reverted (${hash})`);
    return hash;
  }

  private note(jobId: string, what: string, hash: Hex) {
    const list = this.txs.get(jobId) ?? [];
    list.push({ what, hash });
    this.txs.set(jobId, list);
  }

  private async readJob(jobId: string): Promise<AcpJobLike & { onChainStatus: number }> {
    const r = (await this.opts.client.readContract({ address: this.opts.acp, abi: ACP_ABI, functionName: "jobs", args: [BigInt(jobId)] })) as readonly [Address, number, Address, number, Address, Address, bigint, string];
    return {
      chainId: this.opts.chainId,
      clientAddress: r[0],
      onChainStatus: r[1],
      providerAddress: r[2],
      expiredAt: BigInt(r[3]),
      evaluatorAddress: r[4],
      hookAddress: r[5],
      budget: assetToken(this.opts.paymentToken, this.opts.tokenSymbol, this.opts.tokenDecimals, r[6]),
      description: r[7],
    };
  }

  private system(session: ForkSession, event: AcpJobEvent) {
    this.emit(session, { kind: "system", onChainJobId: session.jobId, chainId: this.opts.chainId, event, timestamp: Date.now() });
  }

  /** Client: create the job on the ACP contract and send the requirement, as createJobFromOffering does. */
  async clientCreateJob(args: {
    description: string;
    requirement: unknown;
    evaluator?: Address;
    expiresInSeconds?: number;
    /** Create it with ACP's FundTransferHook, as createJobFromOffering does for an offering with requiredFunds. Default true. */
    fundTransfer?: boolean;
    /** Reject the job right after funding it (a client taking its money back). */
    rejectAfterFunding?: boolean;
  }): Promise<string> {
    const now = Number((await this.opts.client.getBlock()).timestamp);
    const expiredAt = BigInt(now + (args.expiresInSeconds ?? 3600));
    const hook = args.fundTransfer === false ? NO_EVALUATOR : FUND_TRANSFER_HOOKS[this.opts.chainId]!;
    // A fund-transfer job is self-evaluated, as acp-node-v2's fund-transfer buyer does.
    const evaluator = args.evaluator ?? (hook === NO_EVALUATOR ? NO_EVALUATOR : this.clientAccount.address);
    const hash = await this.send(
      this.clientWallet,
      this.opts.acp,
      encodeFunctionData({ abi: ACP_ABI, functionName: "createJob", args: [this.provider.address, evaluator, expiredAt, args.description, hook] })
    );
    const receipt = await this.opts.client.getTransactionReceipt({ hash });
    let jobId: string | null = null;
    for (const l of receipt.logs) {
      try {
        const d = decodeEventLog({ abi: ACP_ABI, data: l.data, topics: l.topics });
        if (d.eventName === "JobCreated") jobId = (d.args as { jobId: bigint }).jobId.toString();
      } catch {
        /* another event */
      }
    }
    if (!jobId) throw new Error("No JobCreated event.");
    const session = new ForkSession(this, jobId, this.opts.chainId);
    session.clientRejectsAfterFunding = Boolean(args.rejectAfterFunding);
    this.note(jobId, `createJob (client${hook === NO_EVALUATOR ? "" : ", with the FundTransferHook"})`, hash);
    session.job = await this.readJob(jobId);
    this.sessions.set(jobId, session);
    this.log(`ACP job ${jobId} created on chain by the client (${hash})`);
    this.system(session, { type: "job.created", jobId, client: this.clientAccount.address, provider: this.provider.address, evaluator, expiredAt: expiredAt.toString(), hook });
    this.emit(session, {
      kind: "message",
      onChainJobId: jobId,
      chainId: this.opts.chainId,
      from: this.clientAccount.address,
      contentType: "requirement",
      content: JSON.stringify(args.requirement),
      timestamp: Date.now(),
    });
    return jobId;
  }

  async providerSetBudget(session: ForkSession, amount: AssetTokenLike, fundRequest?: { token: AssetTokenLike; destination: Address }) {
    const opt = fundRequest ? encodeFundTransfer(fundRequest.token.address, fundRequest.token.rawAmount, fundRequest.destination) : "0x";
    const hash = await this.send(this.providerWallet, this.opts.acp, encodeFunctionData({ abi: ACP_ABI, functionName: "setBudget", args: [BigInt(session.jobId), amount.rawAmount, opt] }));
    session.fundRequest = fundRequest ?? null;
    this.note(session.jobId, fundRequest ? "setBudget with a fund request (provider)" : "setBudget (provider)", hash);
    session.job = await this.readJob(session.jobId);
    this.log(
      `ACP job ${session.jobId}: provider set the budget to ${amount.amount} ${amount.symbol}${fundRequest ? ` and asked for ${fundRequest.token.amount} ${fundRequest.token.symbol} at funding` : ""} (${hash})`
    );
    this.system(session, {
      type: "budget.set",
      jobId: session.jobId,
      amount: amount.amount,
      ...(fundRequest ? { fundRequest: { amount: fundRequest.token.amount, tokenAddress: fundRequest.token.address, symbol: fundRequest.token.symbol, recipient: fundRequest.destination } } : {}),
    });
    // The client funds the escrow once it sees the budget (after the provider's handler returns).
    this.queue = this.queue.then(() => this.clientFund(session, amount));
  }

  private async clientFund(session: ForkSession, amount: AssetTokenLike) {
    try {
      await this.send(this.clientWallet, this.opts.paymentToken, encodeFunctionData({ abi: ERC20_APPROVE, functionName: "approve", args: [this.opts.acp, amount.rawAmount] }));
      const fr = session.fundRequest;
      let opt: Hex = "0x";
      if (fr) {
        // As acp-node-v2's internalFundWithTransfer: approve the hook for the transfer, and name what is expected.
        await this.send(this.clientWallet, fr.token.address, encodeFunctionData({ abi: ERC20_APPROVE, functionName: "approve", args: [FUND_TRANSFER_HOOKS[this.opts.chainId]!, fr.token.rawAmount] }));
        opt = encodeFundTransfer(fr.token.address, fr.token.rawAmount, fr.destination);
      }
      const fundHash = await this.send(this.clientWallet, this.opts.acp, encodeFunctionData({ abi: ACP_ABI, functionName: "fund", args: [BigInt(session.jobId), amount.rawAmount, opt] }));
      this.note(session.jobId, fr ? `fund: the fee into the escrow, ${fr.token.amount} ${fr.token.symbol} from client to provider` : "fund: client into the escrow", fundHash);
      session.job = await this.readJob(session.jobId);
      this.log(`ACP job ${session.jobId}: client funded ${amount.amount} ${amount.symbol} into the escrow${fr ? ` and ${fr.token.amount} ${fr.token.symbol} to the provider` : ""} (${fundHash})`);
      this.system(session, { type: "job.funded", jobId: session.jobId, client: this.clientAccount.address, amount: amount.amount });
      if (session.clientRejectsAfterFunding) {
        const rejectHash = await this.send(this.clientWallet, this.opts.acp, encodeFunctionData({ abi: ACP_ABI, functionName: "reject", args: [BigInt(session.jobId), keccak256(toHex("changed my mind")), "0x"] }));
        this.note(session.jobId, "reject (client, after funding)", rejectHash);
        session.job = await this.readJob(session.jobId);
        this.log(`ACP job ${session.jobId}: the client rejected the funded job on chain and got the escrow back (${rejectHash})`);
        this.system(session, { type: "job.rejected", jobId: session.jobId, rejector: this.clientAccount.address, reason: "changed my mind" });
      }
    } catch (e) {
      this.log(`ACP job ${session.jobId}: client could not fund: ${e instanceof Error ? e.message.split("\n")[0] : String(e)}`);
    }
  }

  async providerSubmit(session: ForkSession, deliverable: string) {
    const hash = await this.send(this.providerWallet, this.opts.acp, encodeFunctionData({ abi: ACP_ABI, functionName: "submit", args: [BigInt(session.jobId), keccak256(toHex(deliverable)), "0x"] }));
    this.deliverables.set(session.jobId, deliverable);
    const job = await this.readJob(session.jobId);
    this.note(session.jobId, job.onChainStatus === 3 ? "submit (provider): the deliverable hash; with no evaluator the escrow pays out" : "submit (provider): the deliverable hash", hash);
    session.job = job;
    this.log(`ACP job ${session.jobId}: provider submitted the deliverable hash (${hash}); on-chain status ${job.onChainStatus}`);
    this.system(session, { type: "job.submitted", jobId: session.jobId, provider: this.provider.address, deliverableHash: keccak256(toHex(deliverable)), deliverable });
    // With no evaluator, submit completes the job and releases the escrow (status 3).
    if (job.onChainStatus === 3) {
      this.system(session, { type: "job.completed", jobId: session.jobId, evaluator: NO_EVALUATOR, reason: "no evaluator" });
    } else if (job.evaluatorAddress.toLowerCase() === this.clientAccount.address.toLowerCase()) {
      this.queue = this.queue.then(() => this.clientEvaluate(session, deliverable));
    }
  }

  private async clientEvaluate(session: ForkSession, deliverable: string) {
    const ok = await (this.opts.evaluate ?? (async () => true))(session.jobId, deliverable).catch(() => false);
    const reason = keccak256(toHex(ok ? "deliverable checked" : "deliverable did not check out"));
    const fn = ok ? "complete" : "reject";
    const hash = await this.send(this.clientWallet, this.opts.acp, encodeFunctionData({ abi: ACP_ABI, functionName: fn, args: [BigInt(session.jobId), reason, "0x"] }));
    this.note(session.jobId, `${fn} (client, as its own evaluator): the escrow ${ok ? "pays the provider" : "goes back to the client"}`, hash);
    session.job = await this.readJob(session.jobId);
    this.log(`ACP job ${session.jobId}: the client checked the deliverable and called ${fn} (${hash})`);
    if (ok) this.system(session, { type: "job.completed", jobId: session.jobId, evaluator: this.clientAccount.address, reason: "deliverable checked" });
    else this.system(session, { type: "job.rejected", jobId: session.jobId, rejector: this.clientAccount.address, reason: "deliverable did not check out" });
  }

  async providerReject(session: ForkSession, reason: string) {
    let detail = "";
    let onChain = false;
    try {
      const hash = await this.send(this.providerWallet, this.opts.acp, encodeFunctionData({ abi: ACP_ABI, functionName: "reject", args: [BigInt(session.jobId), keccak256(toHex(reason)), "0x"] }));
      this.note(session.jobId, "reject (provider)", hash);
      onChain = true;
      detail = `on chain (${hash})`;
    } catch (e) {
      const why = e instanceof Error ? (e as { shortMessage?: string }).shortMessage ?? e.message.split("\n")[0] : String(e);
      detail = `off chain only (the contract refused the provider's reject: ${why})`;
    }
    this.rejections.set(session.jobId, { reason, onChain, detail });
    this.log(`ACP job ${session.jobId}: provider rejected "${reason}" ${detail}`);
    this.system(session, { type: "job.rejected", jobId: session.jobId, rejector: this.provider.address, reason });
  }

  session(jobId: string) {
    return this.sessions.get(jobId) ?? null;
  }
}
