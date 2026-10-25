/**
 * GloamAgent: the private money an agent holds and moves, on one Gloam network.
 *
 * Everything the GAME functions do lives here, so code that is not a GAME
 * agent (an ACP provider, a cron job) can use the same engine. Each method
 * returns plain JSON-safe facts and never a secret: notes are named by handle,
 * claim links go to the owner's own code, and every text that leaves goes
 * through redact().
 *
 * Money moves only after the owner's spending limits pass (./limits.ts), and
 * each spend is reserved in the spending log before anything is signed.
 *
 * What stays public and what does not, per action:
 *   add       a public deposit: the wallet, the asset and the amount show.
 *             The note it makes hides who can spend it later.
 *   pay       a shielded transfer: no amount, no sender, no recipient on chain.
 *             Submitted by the Gloam relay by default, so the agent's wallet
 *             does not appear either.
 *   receive   the payment is moved into a fresh note only this agent knows
 *             (a sweep) before it counts, since the payer knew the old one.
 *   cash out  the public exit: the asset, the amount and the recipient show,
 *             not which private payment funded it. The pool keeps 0.25% on
 *             mainnet and on Base Sepolia.
 */
import { mkdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import {
  createPublicClient,
  createWalletClient,
  encodeFunctionData,
  formatUnits,
  http,
  isAddress,
  parseUnits,
  type Address,
  type Chain,
  type Hex,
  type PublicClient,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  CASH_OUT_FEE_BPS,
  GloamRelayError,
  NATIVE_ASSET,
  POOL_STATE_ABI,
  POOL_TRANSFER_ABI,
  artifactProver,
  assertDepositAllowed,
  buildPaymentRequestLink,
  buildPrivateSendIntent,
  buildShieldBoundIntent,
  buildUnshieldIntent,
  cashOutFee,
  cleanPaymentNote,
  encodeNotePackage,
  generateReceiveKey,
  isPaymentsPoolChainId,
  isReceiveTag,
  networkName,
  normalizeRequestAmount,
  notePackageToExport,
  openSealedTicket,
  parsePaymentRequestLink,
  payMemoBoardFor,
  relayIntent,
  relayMemo,
  scanIncomingPayments,
  sealToReceiveTag,
  sweepReceivedNote,
  type GloamAsset,
  type GloamIntent,
  type NoteExport,
  type Prover,
  type ReceiveKey,
  type SweepChain,
} from "@gloamtrade/sdk";
import { Artifacts, type ArtifactSource } from "./artifacts.js";
import { claimLinkFor, readClaimLink } from "./claimLinks.js";
import {
  CLAIM_LINK_RECIPIENT,
  checkSpend,
  limitsView,
  loadLimits,
  refusalFor,
  type LimitsConfig,
  type LoadedPolicy,
  type Refusal,
  type Spend,
} from "./limits.js";
import { describeNetwork, findAsset, defaultAsset, resolveNetwork, type PluginNetwork } from "./networks.js";
import { agentId as envAgentId, balances, noteStorePath, noteStoreKey, NoteStore, noteView, type NewNote, type NoteOrigin, type StoredNote } from "./noteStore.js";
import { holdsSecret, redact, registerSecret } from "./redact.js";
import { walletCallSender, type Call, type CallSender } from "./sender.js";
import { SpendLog, counted } from "./spendLog.js";
import { decodeProof, encodeProof, proveFunds, provePayment, verifyHolderProof, type ProofReport } from "./proofs.js";
import { TreeSync, type SyncedVault } from "./treeSync.js";

type Env = Record<string, string | undefined>;

/** A claim link this agent made, handed to the owner's own code (never to the planner). */
export interface ClaimLinkOut {
  handle: string;
  link: string;
  network: string;
  asset: string;
  amount: string;
  note: string | null;
  label: string | null;
}

export interface GloamAgentOptions {
  /** Network key. Default GLOAM_NETWORK, else "base" (Base Sepolia, a testnet). */
  network?: string;
  /** RPC to read and send through. Default GLOAM_RPC_URL, GLOAM_RPC_URL_<chainId>, or the SDK's. */
  rpc?: string;
  /** Where configuration is read from. Default process.env. */
  env?: Env;
  /** The wallet that holds public funds and signs deposits. Default: GLOAM_AGENT_PRIVATE_KEY from env. */
  sender?: CallSender;
  /** Who submits private payments and cash outs: the Gloam relay (default) or the agent's own wallet. */
  submit?: "relay" | "wallet";
  /** A self-hosted relay. Default: the Gloam relay. */
  relayUrl?: string;
  /** The owner's spending limits. Default: GLOAM_LIMITS_FILE. None means nothing moves. */
  limits?: LimitsConfig;
  /** Names this agent's store, log and limits. Default GLOAM_AGENT_ID or "default". */
  agentId?: string;
  /** Folder for the spending log and the vault leaf cache. Default GLOAM_DATA_DIR or ~/.gloam. */
  dataDir?: string;
  /** Circuit files. Default: GLOAM_ARTIFACTS_DIR, then download from gloam.trade (hash-checked). */
  artifacts?: ArtifactSource;
  /** Where claim links go when the agent pays by claim link. Without it they stay in the encrypted store. */
  onClaimLink?: (out: ClaimLinkOut) => void | Promise<void>;
  /** A client to read the chain with (tests). Default: one over `rpc`. */
  publicClient?: PublicClient;
  /** First getLogs range to try when reading the vault. */
  logChunk?: bigint;
}

export type Outcome = Record<string, unknown> & { status: string };

const RELAY_MAYBE_SENT = ["maybe_sent", "rpc", "network", "error", "internal", "in_flight"];

const SHIELD_ABI = [
  {
    type: "function",
    name: "shieldBound",
    stateMutability: "payable",
    inputs: [
      { name: "asset", type: "address" },
      { name: "amount", type: "uint256" },
      { name: "commitment", type: "bytes32" },
      { name: "proof", type: "bytes" },
    ],
    outputs: [],
  },
] as const;

const UNSHIELD_ABI = [
  {
    type: "function",
    name: "unshield",
    stateMutability: "nonpayable",
    inputs: [
      { name: "proof", type: "bytes" },
      { name: "root", type: "bytes32" },
      { name: "nullifier", type: "bytes32" },
      { name: "asset", type: "address" },
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [],
  },
] as const;

const MEMO_ABI = [
  {
    type: "function",
    name: "postMemo",
    stateMutability: "nonpayable",
    inputs: [
      { name: "paymentCommitment", type: "bytes32" },
      { name: "memo", type: "bytes" },
    ],
    outputs: [],
  },
] as const;

const ERC20_ABI = [
  { type: "function", name: "approve", stateMutability: "nonpayable", inputs: [{ name: "spender", type: "address" }, { name: "amount", type: "uint256" }], outputs: [{ type: "bool" }] },
  { type: "function", name: "allowance", stateMutability: "view", inputs: [{ name: "owner", type: "address" }, { name: "spender", type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ name: "owner", type: "address" }], outputs: [{ type: "uint256" }] },
] as const;

const errMsg = (e: unknown) => redact(e instanceof Error ? e.message : String(e));
const shortTag = (t: string) => (t.length > 30 ? `${t.slice(0, 18)}…${t.slice(-6)}` : t);

function toHexBytes(text: string): Hex {
  return `0x${Buffer.from(text, "utf8").toString("hex")}`;
}

export class GloamAgent {
  readonly network: PluginNetwork;
  readonly publicClient: PublicClient;
  readonly agentId: string;
  readonly submitMode: "relay" | "wallet";
  readonly store: NoteStore;
  private readonly env: Env;
  private readonly sender: CallSender | null;
  private readonly relayUrl?: string;
  private readonly spendLog: SpendLog;
  private readonly tree: TreeSync;
  private readonly artifacts: Artifacts;
  private readonly limits?: LimitsConfig;
  private readonly onClaimLink?: GloamAgentOptions["onClaimLink"];
  private readonly provers = new Map<string, Promise<Prover>>();

  constructor(opts: GloamAgentOptions = {}) {
    const env = opts.env ?? process.env;
    this.env = env;
    this.network = resolveNetwork(opts.network || env.GLOAM_NETWORK?.trim() || "base", { rpc: opts.rpc || env.GLOAM_RPC_URL, env });
    const chain: Chain = { ...this.network.chain, rpcUrls: { default: { http: [this.network.rpc] } } };
    this.publicClient = opts.publicClient ?? (createPublicClient({ chain, transport: http(this.network.rpc) }) as PublicClient);
    this.agentId = opts.agentId ?? envAgentId(env);

    // The key comes from the agent's own environment and never leaves this process.
    const rawKey = env.GLOAM_AGENT_PRIVATE_KEY?.trim();
    registerSecret(rawKey);
    registerSecret(env.GLOAM_NOTE_KEY);
    if (opts.sender) {
      this.sender = opts.sender;
    } else if (rawKey) {
      const key = (rawKey.startsWith("0x") ? rawKey : `0x${rawKey}`) as Hex;
      if (!/^0x[0-9a-fA-F]{64}$/.test(key)) throw new Error("GLOAM_AGENT_PRIVATE_KEY is not a 32-byte hex private key.");
      const wallet = createWalletClient({ account: privateKeyToAccount(key), chain, transport: http(this.network.rpc) });
      this.sender = walletCallSender(wallet, this.publicClient);
    } else {
      this.sender = null;
    }

    const submit = opts.submit || (env.GLOAM_SUBMIT?.trim() as "relay" | "wallet" | undefined) || "relay";
    if (submit !== "relay" && submit !== "wallet") throw new Error(`GLOAM_SUBMIT must be "relay" or "wallet", got "${submit}".`);
    this.submitMode = submit;
    this.relayUrl = opts.relayUrl || env.GLOAM_RELAY_URL?.trim() || undefined;

    const { key, source } = noteStoreKey(env);
    this.store = new NoteStore(noteStorePath(this.agentId, env), this.agentId, key, source);
    for (const n of this.store.list()) registerSecret(n.secret);
    const rk = this.store.receiveKey();
    if (rk) registerSecret(rk.privateJwk.d);

    const dataDir = opts.dataDir || env.GLOAM_DATA_DIR?.trim() || join(homedir(), ".gloam");
    mkdirSync(dataDir, { recursive: true, mode: 0o700 });
    this.spendLog = new SpendLog(env.GLOAM_SPEND_LOG?.trim() || join(dataDir, `game-spend-log.${this.agentId.replace(/[^\w.-]+/g, "_")}.json`));
    this.tree = new TreeSync(this.publicClient, this.network, { cacheDir: join(dataDir, "vault-cache"), chunk: opts.logChunk });
    this.artifacts = new Artifacts(opts.artifacts ?? { dir: env.GLOAM_ARTIFACTS_DIR?.trim() || undefined, cacheDir: join(dataDir, "circuits") });
    this.limits = opts.limits;
    this.onClaimLink = opts.onClaimLink;
  }

  // ------------------------------------------------------------------ basics

  get walletAddress(): Address | null {
    return this.sender?.address ?? null;
  }

  private requireSender(what: string): CallSender {
    if (!this.sender) {
      throw new Error(`${what} needs a wallet. Set GLOAM_AGENT_PRIVATE_KEY in the agent's environment, or pass a sender (for example an ACP smart wallet).`);
    }
    return this.sender;
  }

  private where(): string {
    return describeNetwork(this.network);
  }

  private asset(raw: string | undefined | null): GloamAsset {
    if (!raw || !raw.trim()) return defaultAsset(this.network);
    const a = findAsset(this.network, raw);
    if (!a) throw new Error(`The ${this.where()} vault does not take "${raw}". It takes: ${this.network.assets.map((x) => x.symbol).join(", ")}.`);
    return a;
  }

  private amount(raw: string | undefined | null, asset: GloamAsset): bigint {
    const norm = normalizeRequestAmount(String(raw ?? ""), asset);
    if (!norm) throw new Error("Say how much, as a number like 25 or 12.5.");
    return parseUnits(norm, asset.decimals);
  }

  private fmt(raw: bigint | string, asset: Pick<GloamAsset, "decimals" | "symbol">): string {
    return `${formatUnits(BigInt(raw), asset.decimals)} ${asset.symbol}`;
  }

  private explorer(hash: Hex): string {
    return `${this.network.explorerUrl.replace(/\/+$/, "")}/tx/${hash}`;
  }

  private loadPolicy(): LoadedPolicy {
    return loadLimits({
      agent: this.agentId,
      network: this.network.key,
      limits: this.limits,
      file: this.limits ? undefined : this.env.GLOAM_LIMITS_FILE?.trim() || undefined,
      readFile: (p) => readFileSync(p, "utf8"),
    });
  }

  /** Check a spend against the owner's limits and reserve it in the log before anything is signed. */
  private gate(spend: Spend): { ok: true; id: string } | { ok: false; refusal: Refusal } {
    const now = Date.now();
    const loaded = this.loadPolicy();
    const symbol = this.network.assets.find((a) => a.address.toLowerCase() === spend.asset.toLowerCase())?.symbol ?? spend.asset;
    const decimals = this.network.assets.find((a) => a.address.toLowerCase() === spend.asset.toLowerCase())?.decimals ?? 18;
    const entry = {
      id: `sp-${now.toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
      agent: this.agentId,
      action: spend.action,
      network: this.network.key,
      chainId: spend.chainId,
      asset: spend.asset,
      symbol,
      amountWei: spend.amountWei.toString(),
      amount: formatUnits(spend.amountWei, decimals),
      recipient: spend.recipient && spend.recipient.length > 40 ? shortTag(spend.recipient) : spend.recipient,
      at: new Date(now).toISOString(),
    };
    try {
      if (loaded.mode !== "enforced") {
        const r = refusalFor(loaded);
        this.spendLog.note({ ...entry, status: "refused", reason: r.message }, now);
        return { ok: false, refusal: r };
      }
      let refusal: Refusal | null = null;
      const res = this.spendLog.reserve(
        entry,
        (c) => {
          refusal = checkSpend(loaded.policy, spend, c, now);
          return refusal?.message ?? null;
        },
        now
      );
      if (!res.ok) return { ok: false, refusal: refusal ?? { code: "refused", message: res.reason } };
      return { ok: true, id: entry.id };
    } catch (e) {
      return { ok: false, refusal: { code: "log_unavailable", message: errMsg(e) } };
    }
  }

  private settle(id: string, status: "sent" | "unconfirmed" | "reverted" | "failed", extra: { hash?: string; reason?: string } = {}) {
    try {
      this.spendLog.settle(id, status, extra.reason ? { ...extra, reason: redact(extra.reason) } : extra);
    } catch {
      /* the money question is settled on chain; a log write failing must not hide that */
    }
  }

  private refused(r: Refusal): Outcome {
    return { status: "refused", code: r.code, message: r.message };
  }

  private prover(circuit: "shield" | "transfer" | "unshield"): Promise<Prover> {
    const key = `${circuit}:${this.network.ceremony}`;
    let p = this.provers.get(key);
    if (!p) {
      p = this.artifacts.paths(circuit, this.network.ceremony).then((a) => artifactProver(a));
      this.provers.set(key, p);
      p.catch(() => this.provers.delete(key));
    }
    return p;
  }

  /** Read the vault tree (cached, checked against the chain's root). */
  syncVault(): Promise<SyncedVault> {
    return this.tree.sync();
  }

  private sweepChain(): SweepChain {
    const pool = this.network.pool;
    const client = this.publicClient;
    return {
      isSpent: (n) => client.readContract({ address: pool, abi: POOL_STATE_ABI, functionName: "isSpent", args: [n] }),
      isCommitmentSeen: (c) => client.readContract({ address: pool, abi: POOL_STATE_ABI, functionName: "commitmentSeen", args: [c] }),
      pathForCommitment: async (c) => (await this.tree.sync()).pathForCommitment(c),
      waitForReceipt: async (hash) => ({ status: (await client.waitForTransactionReceipt({ hash })).status }),
    };
  }

  /** Send a proven private send or cash out: through the relay, or the agent's wallet. */
  private async submitIntent(intent: GloamIntent): Promise<Hex> {
    if (this.submitMode === "relay") return relayIntent(intent, { url: this.relayUrl });
    const exec = intent.exec!;
    let data: Hex;
    if (exec.fn === "transfer") {
      data = encodeFunctionData({ abi: POOL_TRANSFER_ABI, functionName: "transfer", args: exec.args as never });
    } else if (exec.fn === "unshield") {
      data = encodeFunctionData({ abi: UNSHIELD_ABI, functionName: "unshield", args: exec.args as never });
    } else {
      throw new Error(`Cannot submit ${exec.fn}.`);
    }
    return this.requireSender("Sending from the agent's own wallet").sendCalls([{ to: exec.poolAddress, data }]);
  }

  private mayHaveSent(err: unknown): boolean {
    if (this.submitMode !== "relay") return false;
    return !(err instanceof GloamRelayError) || RELAY_MAYBE_SENT.includes(err.code);
  }

  private keep(note: NewNote): StoredNote {
    registerSecret(note.secret);
    return this.store.add(note);
  }

  private newNote(n: NoteExport, asset: GloamAsset, origin: NoteOrigin, extra: Partial<NewNote> = {}): NewNote {
    return {
      network: this.network.key,
      chainId: this.network.chainId,
      pool: this.network.pool,
      asset: n.asset,
      symbol: asset.symbol,
      decimals: asset.decimals,
      amountWei: n.amountWei,
      secret: n.secret,
      commitment: n.commitment,
      nullifier: n.nullifier,
      status: "pending",
      pending: "create",
      origin,
      createdTx: null,
      ...extra,
    };
  }

  private spendable(asset: GloamAsset): StoredNote[] {
    return this.store
      .list()
      .filter(
        (n) =>
          n.status === "unspent" &&
          n.chainId === this.network.chainId &&
          n.pool.toLowerCase() === this.network.pool.toLowerCase() &&
          n.asset.toLowerCase() === asset.address.toLowerCase() &&
          (n.origin === "shield" || n.origin === "change" || n.origin === "received")
      )
      .sort((a, b) => (BigInt(a.amountWei) < BigInt(b.amountWei) ? -1 : BigInt(a.amountWei) > BigInt(b.amountWei) ? 1 : 0));
  }

  /** The smallest note that covers `amount`, reserved for a spend. A payment spends one note; notes are not combined. */
  private reserveNote(asset: GloamAsset, amount: bigint): StoredNote {
    const pick = this.spendable(asset).find((n) => BigInt(n.amountWei) >= amount);
    if (!pick) {
      const all = this.spendable(asset);
      const largest = all.length ? BigInt(all[all.length - 1]!.amountWei) : 0n;
      throw new Error(
        `No single private note holds ${this.fmt(amount, asset)} (the largest holds ${this.fmt(largest, asset)}). A payment spends one note; add more privately first.`
      );
    }
    return this.store.reserveForSpend(pick.handle);
  }

  private release(handle: string) {
    try {
      this.store.update(handle, { status: "unspent" });
    } catch {
      /* keep going: the note is still in the store */
    }
  }

  /**
   * One private send from a reserved note: pay `amountPay` into a new note
   * (the payee's, a claim link's, or the agent's own for a split) and keep the
   * change. Notes are written before anything is sent, so a crash cannot lose them.
   */
  private async privateSend(args: {
    input: StoredNote;
    asset: GloamAsset;
    amountPay: bigint;
    payOrigin: NoteOrigin;
    label?: string;
    memo?: string;
  }): Promise<
    | { ok: true; hash: Hex; payment: StoredNote; change: StoredNote | null; paymentNote: NoteExport }
    | { ok: false; maybeSent: boolean; hash: Hex | null; error: string }
  > {
    const { input, asset } = args;
    let hash: Hex | null = null;
    let payment: StoredNote | undefined;
    let change: StoredNote | undefined;
    let sending = false;
    try {
      const vault = await this.tree.sync();
      const path = await vault.pathForCommitment(input.commitment);
      if (!path) throw new Error("That note is not in the vault yet. Wait for it to confirm.");
      const intent = await buildPrivateSendIntent({
        secretHex: input.secret,
        amountInWei: BigInt(input.amountWei),
        amountPayWei: args.amountPay,
        asset: asset.address,
        path,
        prove: await this.prover("transfer"),
        poolAddress: this.network.pool,
        chainId: this.network.chainId,
      });
      if (BigInt(intent.changeNote.amountWei) > 0n) {
        change = this.keep(this.newNote(intent.changeNote, asset, "change", { label: args.label ? `change from ${args.label}` : undefined }));
      }
      payment = this.keep(this.newNote(intent.paymentNote, asset, args.payOrigin, { label: args.label, memo: args.memo }));
      sending = true;
      hash = await this.submitIntent(intent);
      const sent = hash;
      this.store.update(input.handle, { spentTx: sent });
      if (change) this.store.update(change.handle, { createdTx: sent });
      this.store.update(payment.handle, { createdTx: sent });
      const receipt = await this.publicClient.waitForTransactionReceipt({ hash });
      if (receipt.status !== "success") throw Object.assign(new Error(`The transfer reverted (${hash}).`), { reverted: true });
      this.store.update(input.handle, { status: "spent", spentTx: sent });
      const changeDone = change ? this.store.update(change.handle, { status: "unspent", createdTx: sent }) ?? null : null;
      // A payment note is the payee's money once it lands; a claim note stays open until someone claims it.
      const payStatus = args.payOrigin === "payment" ? "spent" : "unspent";
      const paymentDone = this.store.update(payment.handle, { status: payStatus, createdTx: sent }) ?? payment;
      return { ok: true, hash: sent, payment: paymentDone, change: changeDone, paymentNote: intent.paymentNote };
    } catch (e) {
      const reverted = Boolean((e as { reverted?: boolean }).reverted);
      const maybeSent = !reverted && (Boolean(hash) || (sending && this.mayHaveSent(e)));
      if (reverted) {
        const spentElsewhere = await this.publicClient
          .readContract({ address: this.network.pool, abi: POOL_STATE_ABI, functionName: "isSpent", args: [input.nullifier] })
          .catch(() => false);
        if (spentElsewhere) {
          this.store.update(input.handle, { status: "spent", spentTx: null });
        } else {
          if (change) this.store.remove(change.handle);
          if (payment) this.store.remove(payment.handle);
          this.release(input.handle);
        }
      } else if (!maybeSent) {
        if (change) this.store.remove(change.handle);
        if (payment) this.store.remove(payment.handle);
        this.release(input.handle);
      }
      return { ok: false, maybeSent, hash, error: errMsg(e) };
    }
  }

  /** Post the sealed payment where the payee's scan finds it (relay or wallet). */
  private async postMemo(commitment: Hex, sealed: string): Promise<{ posted: boolean; hash?: Hex; reason?: string }> {
    const board = payMemoBoardFor(this.network.chainId);
    if (!board) return { posted: false, reason: `${this.where()} has no payment-message board yet.` };
    const memo = toHexBytes(sealed);
    try {
      const hash =
        this.submitMode === "relay"
          ? await relayMemo({ chainId: this.network.chainId, paymentCommitment: commitment, memo }, { url: this.relayUrl })
          : await this.requireSender("Posting the payment message").sendCalls([
              { to: board.address, data: encodeFunctionData({ abi: MEMO_ABI, functionName: "postMemo", args: [commitment, memo] }) },
            ]);
      return { posted: true, hash };
    } catch (e) {
      return { posted: false, reason: errMsg(e) };
    }
  }

  // ------------------------------------------------------------------ read

  /** The agent's Gloam address (a receive tag). Made once and kept in the encrypted store. */
  async address(): Promise<string> {
    const have = this.store.receiveKey();
    if (have) return have.tag;
    const key: ReceiveKey = await generateReceiveKey();
    registerSecret(key.privateJwk.d);
    // Nothing sealed to a brand-new address can exist before now: scans start here.
    const head = await this.publicClient.getBlockNumber({ cacheTime: 0 }).catch(() => this.network.deployBlock);
    const from = head > 32n ? head - 32n : 0n;
    return this.store.keepReceiveKey(key, this.network.chainId, from).tag;
  }

  /** Check pending notes against the chain. */
  async refresh(): Promise<{ updated: number }> {
    let updated = 0;
    for (const n of this.store.list()) {
      if (n.chainId !== this.network.chainId || n.status === "spent") continue;
      const [seen, spent] = await Promise.all([
        this.publicClient.readContract({ address: n.pool, abi: POOL_STATE_ABI, functionName: "commitmentSeen", args: [n.commitment] }),
        this.publicClient.readContract({ address: n.pool, abi: POOL_STATE_ABI, functionName: "isSpent", args: [n.nullifier] }),
      ]);
      if (spent) {
        this.store.update(n.handle, { status: "spent" });
        updated++;
      } else if (n.status === "pending" && n.pending === "create" && seen) {
        this.store.update(n.handle, { status: n.origin === "payment" ? "spent" : "unspent" });
        updated++;
      } else if (n.status === "pending" && n.pending === "spend" && Date.now() - Date.parse(n.updatedAt) > 10 * 60_000) {
        // Held over ten minutes for a spend that never went out (or went out and reverted): spendable again.
        const tx = n.spentTx ? await this.publicClient.getTransactionReceipt({ hash: n.spentTx }).catch(() => null) : null;
        if (!n.spentTx || tx?.status === "reverted") {
          this.store.update(n.handle, { status: "unspent", spentTx: null });
          updated++;
        }
      }
    }
    return { updated };
  }

  /** Private balance per asset, what the wallet holds publicly, and the limits left today. */
  async balance(opts: { refresh?: boolean } = {}): Promise<Outcome> {
    if (opts.refresh) await this.refresh();
    const priv = balances(this.store.list(), this.network.chainId);
    const wallet: Record<string, string> = {};
    if (this.sender) {
      for (const a of this.network.assets) {
        try {
          const raw =
            a.address.toLowerCase() === NATIVE_ASSET.toLowerCase()
              ? await this.publicClient.getBalance({ address: this.sender.address })
              : await this.publicClient.readContract({ address: a.address, abi: ERC20_ABI, functionName: "balanceOf", args: [this.sender.address] });
          wallet[a.symbol] = formatUnits(raw, a.decimals);
        } catch {
          wallet[a.symbol] = "unknown";
        }
      }
    }
    return {
      status: "ok",
      network: this.network.key,
      networkName: this.where(),
      gloamAddress: await this.address(),
      privateBalance: priv,
      ...(this.sender ? { wallet: { address: this.sender.address, holds: wallet, note: "Public: anyone can see the wallet's balance." } } : {}),
      limits: this.limitsReport(),
      pendingClaimLinks: this.store
        .list()
        .filter((n) => n.origin === "claim" && n.status === "unspent" && n.chainId === this.network.chainId)
        .map((n) => noteView(n)),
    };
  }

  limitsReport() {
    let entries: ReturnType<SpendLog["read"]> = [];
    try {
      entries = this.spendLog.read();
    } catch {
      entries = [];
    }
    return limitsView(this.loadPolicy(), counted(entries, this.agentId), Date.now());
  }

  /** The agent's notes as handles and public facts. */
  notes() {
    return this.store.list().filter((n) => n.chainId === this.network.chainId).map(noteView);
  }

  /** The most one payment can be right now, in base units: a payment spends one note. */
  largestPayment(asset?: string): bigint {
    const all = this.spendable(this.asset(asset));
    return all.length ? BigInt(all[all.length - 1]!.amountWei) : 0n;
  }

  /** Open a code sealed to this agent's Gloam address (owner code: a sealed request or deliverable). */
  async openSealed(sealed: string): Promise<string> {
    const key = this.store.receiveKey();
    if (!key) throw new Error("This agent has no Gloam address yet, so nothing can be sealed to it.");
    return openSealedTicket(sealed, key);
  }

  // ------------------------------------------------------------------ add privately

  /** Deposit public funds from the wallet into the agent's private balance. */
  async add(args: { amount: string; asset?: string; label?: string }): Promise<Outcome> {
    const asset = this.asset(args.asset);
    const amountWei = this.amount(args.amount, asset);
    const sender = this.requireSender("Adding money privately");
    assertDepositAllowed(this.network.chainId, asset.address, amountWei);
    const isNative = asset.address.toLowerCase() === NATIVE_ASSET.toLowerCase();
    if (isNative && !this.network.nativeShield) throw new Error(`The ${this.where()} vault takes no native deposits.`);
    const have = isNative
      ? await this.publicClient.getBalance({ address: sender.address })
      : await this.publicClient.readContract({ address: asset.address, abi: ERC20_ABI, functionName: "balanceOf", args: [sender.address] });
    if (have < amountWei) {
      return { status: "error", message: `The wallet holds ${this.fmt(have, asset)}, less than the ${this.fmt(amountWei, asset)} asked.` };
    }
    const gate = this.gate({ action: "add", chainId: this.network.chainId, asset: asset.address, amountWei, recipient: null });
    if (!gate.ok) return this.refused(gate.refusal);
    let held: StoredNote | undefined;
    let hash: Hex | undefined;
    try {
      const intent = await buildShieldBoundIntent({
        amountWei,
        asset: asset.address,
        chainId: this.network.chainId,
        poolAddress: this.network.pool,
        prover: await this.prover("shield"),
      });
      held = this.keep(
        this.newNote(
          { secret: intent.note.secret, commitment: intent.note.commitment, nullifier: intent.note.nullifier, amountWei: amountWei.toString(), asset: asset.address },
          asset,
          "shield",
          { label: args.label }
        )
      );
      const calls: Call[] = [];
      if (!isNative) {
        const allowance = await this.publicClient.readContract({ address: asset.address, abi: ERC20_ABI, functionName: "allowance", args: [sender.address, this.network.pool] });
        if (allowance < amountWei) {
          calls.push({ to: asset.address, data: encodeFunctionData({ abi: ERC20_ABI, functionName: "approve", args: [this.network.pool, amountWei] }) });
        }
      }
      calls.push({
        to: this.network.pool,
        data: encodeFunctionData({ abi: SHIELD_ABI, functionName: "shieldBound", args: intent.exec.args as never }),
        value: intent.exec.valueWei,
      });
      hash = await sender.sendCalls(calls);
      const receipt = await this.publicClient.waitForTransactionReceipt({ hash });
      if (receipt.status !== "success") {
        this.settle(gate.id, "reverted", { hash });
        this.store.remove(held.handle);
        return { status: "error", message: `The deposit reverted (${hash}). Nothing moved.` };
      }
      this.settle(gate.id, "sent", { hash });
      const stored = this.store.update(held.handle, { status: "unspent", createdTx: hash }) ?? held;
      return {
        status: "done",
        action: "add",
        network: this.network.key,
        added: this.fmt(amountWei, asset),
        note: noteView(stored),
        hash,
        explorer: this.explorer(hash),
        public: "The deposit shows the wallet, the asset and the amount. Who can spend the note does not.",
      };
    } catch (e) {
      const error = errMsg(e);
      this.settle(gate.id, hash ? "unconfirmed" : "failed", { hash, reason: error });
      if (held && !hash) this.store.remove(held.handle);
      return { status: "error", message: error, ...(hash ? { hash, check: "It may still land. Check the balance with refresh before adding again." } : {}) };
    }
  }

  // ------------------------------------------------------------------ pay privately

  /**
   * Pay privately to a Gloam address (gloamr1.…) or a payment request link.
   * The payment is sealed to the payee's address and, where the network has a
   * payment-message board, posted there so the payee finds it.
   */
  async pay(args: { to: string; amount?: string; asset?: string; note?: string; label?: string }): Promise<Outcome> {
    const target = String(args.to ?? "").trim();
    let payTo: string;
    let asset: GloamAsset;
    let amountWei: bigint;
    let memo = cleanPaymentNote(args.note);
    if (/^https?:\/\//i.test(target)) {
      let req;
      try {
        req = parsePaymentRequestLink(target);
      } catch {
        throw new Error("That is not a payment request link.");
      }
      if (!req.payTo || !isReceiveTag(req.payTo)) throw new Error("That payment request has no Gloam address to pay.");
      if (req.networkKey && req.networkKey !== this.network.key) {
        throw new Error(`That request is for ${req.networkKey}, and this agent pays on ${this.network.key}.`);
      }
      payTo = req.payTo;
      asset = req.asset ? this.asset(req.asset) : this.asset(args.asset);
      if (args.asset && this.asset(args.asset).address.toLowerCase() !== asset.address.toLowerCase()) {
        throw new Error(`The request asks for ${asset.symbol}, not ${args.asset}.`);
      }
      if (req.amount) {
        amountWei = this.amount(req.amount, asset);
        if (args.amount && this.amount(args.amount, asset) !== amountWei) {
          throw new Error(`The request asks for ${this.fmt(amountWei, asset)}. Pay that amount or leave the amount out.`);
        }
      } else {
        amountWei = this.amount(args.amount, asset);
      }
      if (req.note && memo && req.note !== memo) throw new Error("The request already carries a note. Leave the note out.");
      memo = req.note ?? memo;
    } else if (isReceiveTag(target)) {
      payTo = target;
      asset = this.asset(args.asset);
      amountWei = this.amount(args.amount, asset);
    } else {
      throw new Error("Pay to a Gloam address (gloamr1.…) or a payment request link. For someone without one, pay by claim link.");
    }

    const gate = this.gate({ action: "pay", chainId: this.network.chainId, asset: asset.address, amountWei, recipient: payTo });
    if (!gate.ok) return this.refused(gate.refusal);
    let input: StoredNote;
    try {
      input = this.reserveNote(asset, amountWei);
    } catch (e) {
      this.settle(gate.id, "failed", { reason: errMsg(e) });
      return { status: "error", message: errMsg(e), privateBalance: balances(this.store.list(), this.network.chainId) };
    }
    const sent = await this.privateSend({ input, asset, amountPay: amountWei, payOrigin: "payment", label: args.label ?? `payment to ${shortTag(payTo)}`, memo: memo || undefined });
    if (!sent.ok) {
      this.settle(gate.id, sent.maybeSent ? "unconfirmed" : "failed", { hash: sent.hash ?? undefined, reason: sent.error });
      return {
        status: "error",
        message: sent.error,
        ...(sent.maybeSent ? { check: "It may have been sent. Refresh the balance before paying again." } : {}),
      };
    }
    this.settle(gate.id, "sent", { hash: sent.hash });
    const pack = encodeNotePackage({
      pool: this.network.pool,
      asset: sent.paymentNote.asset,
      amountWei: sent.paymentNote.amountWei,
      secret: sent.paymentNote.secret,
      commitment: sent.paymentNote.commitment,
      note: memo || undefined,
    });
    const sealed = await sealToReceiveTag(pack, payTo);
    const memoPost = await this.postMemo(sent.paymentNote.commitment, sealed);
    return {
      status: "done",
      action: "pay",
      network: this.network.key,
      paid: this.fmt(amountWei, asset),
      to: shortTag(payTo),
      payment: sent.payment.handle,
      hash: sent.hash,
      explorer: this.explorer(sent.hash),
      submittedBy: this.submitMode === "relay" ? "the Gloam relay (this agent's wallet does not appear)" : "this agent's wallet",
      delivered: memoPost.posted
        ? "Posted sealed on the network's payment-message board. Only the payee's key opens it."
        : `Not posted (${memoPost.reason}). Give the payee this sealed code; only their key opens it.`,
      ...(memoPost.posted ? {} : { sealedCode: sealed }),
      change: sent.change ? noteView(sent.change) : null,
      public: "The chain shows a shielded transfer. Not the amount, the sender or the payee.",
    };
  }

  /**
   * Pay by claim link: for someone with no Gloam address. The link is a bearer
   * secret, so it goes to onClaimLink, or sealed to `sealTo` (a Gloam address),
   * never back to the planner. Unclaimed links can be taken back.
   */
  async payByClaimLink(args: { amount: string; asset?: string; note?: string; sealTo?: string; label?: string }): Promise<Outcome> {
    const asset = this.asset(args.asset);
    const amountWei = this.amount(args.amount, asset);
    const memo = cleanPaymentNote(args.note);
    if (args.sealTo && !isReceiveTag(args.sealTo)) throw new Error("sealTo must be a Gloam address (gloamr1.…).");
    const gate = this.gate({ action: "pay", chainId: this.network.chainId, asset: asset.address, amountWei, recipient: args.sealTo ?? CLAIM_LINK_RECIPIENT });
    if (!gate.ok) return this.refused(gate.refusal);
    let input: StoredNote;
    try {
      input = this.reserveNote(asset, amountWei);
    } catch (e) {
      this.settle(gate.id, "failed", { reason: errMsg(e) });
      return { status: "error", message: errMsg(e) };
    }
    const sent = await this.privateSend({ input, asset, amountPay: amountWei, payOrigin: "claim", label: args.label ?? "claim link", memo: memo || undefined });
    if (!sent.ok) {
      this.settle(gate.id, sent.maybeSent ? "unconfirmed" : "failed", { hash: sent.hash ?? undefined, reason: sent.error });
      return { status: "error", message: sent.error };
    }
    this.settle(gate.id, "sent", { hash: sent.hash });
    const out = this.claimLinkOf(sent.payment);
    let delivered: string;
    let sealedLink: string | undefined;
    if (args.sealTo) {
      sealedLink = await sealToReceiveTag(out.link, args.sealTo);
      delivered = `Sealed to ${shortTag(args.sealTo)}: only that address opens it.`;
    } else if (this.onClaimLink) {
      try {
        await this.onClaimLink(out);
        delivered = "Handed to the owner's onClaimLink handler.";
      } catch (e) {
        delivered = `The onClaimLink handler failed (${errMsg(e)}). The link is kept in the encrypted note store as ${sent.payment.handle}.`;
      }
    } else {
      delivered = `Kept in the encrypted note store as ${sent.payment.handle}. The owner reads it with agent.claimLink("${sent.payment.handle}").`;
    }
    return {
      status: "done",
      action: "pay_by_claim_link",
      network: this.network.key,
      paid: this.fmt(amountWei, asset),
      claimHandle: sent.payment.handle,
      hash: sent.hash,
      explorer: this.explorer(sent.hash),
      delivered,
      ...(sealedLink ? { sealedLink } : {}),
      change: sent.change ? noteView(sent.change) : null,
      public: "The chain shows a shielded transfer. The link is a bearer secret: whoever holds it can claim.",
    };
  }

  /** The claim link for a claim note this agent made. Owner code only: it is a bearer secret. */
  claimLink(handle: string): ClaimLinkOut {
    const n = this.store.get(handle);
    if (!n || n.origin !== "claim") throw new Error(`There is no claim link "${handle}".`);
    return this.claimLinkOf(n);
  }

  private claimLinkOf(n: StoredNote): ClaimLinkOut {
    const code = encodeNotePackage({ pool: n.pool, asset: n.asset, amountWei: n.amountWei, secret: n.secret, commitment: n.commitment, note: n.memo });
    return {
      handle: n.handle,
      link: claimLinkFor(code, n.network),
      network: n.network,
      asset: n.symbol,
      amount: formatUnits(BigInt(n.amountWei), n.decimals),
      note: n.memo ?? null,
      label: n.label ?? null,
    };
  }

  // ------------------------------------------------------------------ receive

  /** A payment request link for this agent's Gloam address. Not a secret: share it with the payer. */
  async requestPayment(args: { amount?: string; asset?: string; note?: string; name?: string }): Promise<Outcome> {
    const asset = this.asset(args.asset);
    const link = buildPaymentRequestLink({
      payTo: await this.address(),
      network: this.network.key,
      asset: asset.address,
      amount: args.amount?.trim() ? args.amount : undefined,
      note: args.note,
      name: args.name,
    });
    return {
      status: "done",
      action: "request",
      network: this.network.key,
      link,
      gloamAddress: await this.address(),
      asset: asset.symbol,
      amount: args.amount?.trim() || "payer chooses",
      private: "The details ride after the # in the link, which browsers never send to a server.",
    };
  }

  /** Move one received note into a fresh note only this agent knows. Credits only when the sweep confirms. */
  private async secure(note: NoteExport, asset: GloamAsset, label: string): Promise<{ status: string; hash: Hex | null; handle?: string; reason?: string | null }> {
    const sweptFrom = note.nullifier;
    if (this.store.list().some((n) => n.sweptFrom?.toLowerCase() === sweptFrom.toLowerCase() && n.status !== "spent")) {
      return { status: "already_secured", hash: null };
    }
    registerSecret(note.secret);
    let fresh: StoredNote | undefined;
    const res = await sweepReceivedNote({
      note,
      poolAddress: this.network.pool,
      chainId: this.network.chainId,
      prove: await this.prover("transfer"),
      chain: this.sweepChain(),
      submit: (intent) => this.submitIntent(intent),
      beforeSubmit: (freshNote) => {
        fresh = this.keep(this.newNote(freshNote, asset, "received", { sweptFrom, label }));
      },
    });
    if (fresh) {
      if (res.status === "swept") this.store.update(fresh.handle, { status: "unspent", createdTx: res.hash });
      else if (res.status !== "unconfirmed") this.store.remove(fresh.handle);
      else if (res.hash) this.store.update(fresh.handle, { createdTx: res.hash });
    }
    return { status: res.status, hash: res.hash, handle: res.status === "swept" || res.status === "unconfirmed" ? fresh?.handle : undefined, reason: res.reason };
  }

  /** Find payments sent to this agent's Gloam address and secure each one. */
  async checkIncoming(): Promise<Outcome> {
    const key = this.store.receiveKey();
    if (!key) {
      return { status: "done", action: "check", received: [], message: `No Gloam address yet. Share ${await this.address()} to be paid.` };
    }
    const board = payMemoBoardFor(this.network.chainId);
    if (!board) {
      return { status: "done", action: "check", received: [], message: `${this.where()} has no payment-message board yet. Ask the payer for the sealed code and pass it as claim_link.` };
    }
    const from = this.store.scanFrom(this.network.chainId) ?? board.deployBlock;
    // Reading the vault first also learns how wide a log range this RPC takes.
    await this.tree.sync();
    let chunk = this.tree.logChunk;
    let scan: Awaited<ReturnType<typeof scanIncomingPayments>> | null = null;
    for (let attempt = 0; !scan; attempt++) {
      try {
        scan = await scanIncomingPayments({ client: this.publicClient, network: this.network, receiveKey: key, fromBlock: from, chunkSize: chunk });
      } catch (e) {
        if (attempt >= 6 || chunk <= 1n) throw e;
        chunk = chunk / 4n > 0n ? chunk / 4n : 1n;
      }
    }
    const received: Record<string, unknown>[] = [];
    let stopAt: bigint | null = null;
    for (const p of scan.payments) {
      const asset = this.network.assets.find((a) => a.address.toLowerCase() === p.asset.toLowerCase());
      if (!asset) continue;
      const res = await this.secure(await notePackageToExport(p.notePackage), asset, p.note ? `received: ${p.note}` : "received");
      received.push({
        amount: this.fmt(p.amountWei, asset),
        note: p.note,
        status: res.status,
        ...(res.handle ? { handle: res.handle } : {}),
        ...(res.hash ? { hash: res.hash } : {}),
        ...(res.reason ? { reason: res.reason } : {}),
      });
      if (res.status !== "swept" && res.status !== "already_secured" && res.status !== "already_spent" && stopAt === null && p.blockNumber != null) stopAt = p.blockNumber;
    }
    this.store.setScanFrom(this.network.chainId, stopAt ?? scan.scannedTo + 1n);
    return {
      status: "done",
      action: "check",
      network: this.network.key,
      received,
      scannedTo: scan.scannedTo.toString(),
      rule: "A payment counts only once it is moved into a note only this agent knows (swept).",
    };
  }

  /** Claim a claim link (or code) into this agent's private balance. */
  async claim(link: string): Promise<Outcome> {
    const { pack, networkKey } = readClaimLink(link);
    registerSecret(pack.secret);
    if (networkKey && networkKey !== this.network.key) throw new Error(`That claim link is for ${networkKey}, and this agent is on ${this.network.key}.`);
    if (pack.pool.toLowerCase() !== this.network.pool.toLowerCase()) throw new Error("That claim link is for a different vault.");
    const asset = this.network.assets.find((a) => a.address.toLowerCase() === pack.asset.toLowerCase());
    if (!asset) throw new Error("That claim link holds an asset this vault does not list.");
    const res = await this.secure(await notePackageToExport(pack), asset, pack.note ? `claimed: ${pack.note}` : "claimed link");
    return {
      status: res.status === "swept" || res.status === "already_secured" ? "done" : res.status === "unconfirmed" ? "pending" : "error",
      action: "claim",
      network: this.network.key,
      amount: this.fmt(pack.amountWei, asset),
      result: res.status,
      ...(res.handle ? { handle: res.handle } : {}),
      ...(res.hash ? { hash: res.hash, explorer: this.explorer(res.hash) } : {}),
      ...(res.reason ? { message: res.reason } : {}),
    };
  }

  /** Take back a claim link nobody claimed yet (owner code). */
  async takeBack(handle: string): Promise<Outcome> {
    const n = this.store.get(handle);
    if (!n || n.origin !== "claim") throw new Error(`There is no claim link "${handle}".`);
    const asset = this.network.assets.find((a) => a.address.toLowerCase() === n.asset.toLowerCase())!;
    const res = await this.secure({ secret: n.secret, commitment: n.commitment, nullifier: n.nullifier, amountWei: n.amountWei, asset: n.asset }, asset, `took back ${handle}`);
    if (res.status === "swept" || res.status === "already_spent") this.store.update(handle, { status: "spent" });
    return { status: res.status === "swept" ? "done" : "error", action: "take_back", result: res.status, ...(res.reason ? { message: res.reason } : {}) };
  }

  // ------------------------------------------------------------------ cash out

  /**
   * Cash out to a public address. A cash out spends a whole note, so for a
   * smaller amount the note is first split privately (a send to itself).
   */
  async cashOut(args: { amount: string; asset?: string; to: string; label?: string }): Promise<Outcome> {
    const asset = this.asset(args.asset);
    const amountWei = this.amount(args.amount, asset);
    const to = String(args.to ?? "").trim();
    if (!isAddress(to)) throw new Error("Cash out to a 0x address.");
    if (to.toLowerCase() === this.network.pool.toLowerCase()) throw new Error("That address is the vault itself. Cash out to a wallet.");
    const gate = this.gate({ action: "cash_out", chainId: this.network.chainId, asset: asset.address, amountWei, recipient: to });
    if (!gate.ok) return this.refused(gate.refusal);
    let input: StoredNote;
    try {
      input = this.reserveNote(asset, amountWei);
    } catch (e) {
      this.settle(gate.id, "failed", { reason: errMsg(e) });
      return { status: "error", message: errMsg(e) };
    }
    let exact = input;
    let splitHash: Hex | null = null;
    if (BigInt(input.amountWei) > amountWei) {
      const split = await this.privateSend({ input, asset, amountPay: amountWei, payOrigin: "change", label: `split for a cash out to ${to}` });
      if (!split.ok) {
        this.settle(gate.id, split.maybeSent ? "unconfirmed" : "failed", { hash: split.hash ?? undefined, reason: split.error });
        return { status: "error", message: split.error };
      }
      splitHash = split.hash;
      exact = this.store.reserveForSpend(split.payment.handle);
    }
    let hash: Hex | null = null;
    try {
      const vault = await this.tree.sync();
      const path = await vault.pathForCommitment(exact.commitment);
      if (!path) throw new Error("That note is not in the vault yet. Wait for it to confirm.");
      const intent = await buildUnshieldIntent({
        secretHex: exact.secret,
        amountWei,
        asset: asset.address,
        to: to as Address,
        path,
        prove: await this.prover("unshield"),
        poolAddress: this.network.pool,
        chainId: this.network.chainId,
      });
      hash = await this.submitIntent(intent);
      this.store.update(exact.handle, { spentTx: hash });
      const receipt = await this.publicClient.waitForTransactionReceipt({ hash });
      if (receipt.status !== "success") throw Object.assign(new Error(`The cash out reverted (${hash}).`), { reverted: true });
      this.store.update(exact.handle, { status: "spent", spentTx: hash });
      this.settle(gate.id, "sent", { hash });
      const fee = isPaymentsPoolChainId(this.network.chainId) ? cashOutFee(amountWei, CASH_OUT_FEE_BPS) : 0n;
      return {
        status: "done",
        action: "cash_out",
        network: this.network.key,
        cashedOut: this.fmt(amountWei, asset),
        fee: this.fmt(fee, asset),
        received: this.fmt(amountWei - fee, asset),
        to,
        hash,
        explorer: this.explorer(hash),
        ...(splitHash ? { splitHash } : {}),
        public: "A cash out is the public exit: the asset, the amount and the recipient show. Which private payment funded it does not.",
      };
    } catch (e) {
      const reverted = Boolean((e as { reverted?: boolean }).reverted);
      const maybe = !reverted && (Boolean(hash) || this.mayHaveSent(e));
      if (!maybe) this.release(exact.handle);
      this.settle(gate.id, maybe ? "unconfirmed" : reverted ? "reverted" : "failed", { hash: hash ?? undefined, reason: errMsg(e) });
      return { status: "error", message: errMsg(e), ...(maybe ? { check: "It may still land. Refresh the balance before trying again." } : {}) };
    }
  }

  // ------------------------------------------------------------------ proofs

  /** A proof that this agent holds at least `atLeast` of an asset privately, made for one reader. */
  async proveFunds(args: { atLeast: string; asset?: string; for: string; expiresInHours?: number }): Promise<Outcome> {
    const asset = this.asset(args.asset);
    const threshold = this.amount(args.atLeast, asset);
    // Largest notes first, at most four (the circuit's width).
    const notes = this.spendable(asset).reverse().slice(0, 4);
    const total = notes.reduce((s, n) => s + BigInt(n.amountWei), 0n);
    if (total < threshold) {
      return { status: "error", message: `The four largest private notes hold ${this.fmt(total, asset)}, less than ${this.fmt(threshold, asset)}.` };
    }
    // Only as many notes as the threshold needs.
    const use: StoredNote[] = [];
    let sum = 0n;
    for (const n of notes) {
      if (sum >= threshold) break;
      use.push(n);
      sum += BigInt(n.amountWei);
    }
    const vault = await this.tree.sync();
    const withPaths = await Promise.all(
      use.map(async (n) => {
        const path = await vault.pathForCommitment(n.commitment);
        if (!path) throw new Error("A note is not in the vault yet. Wait for it to confirm.");
        return { secret: n.secret, amount: BigInt(n.amountWei), path };
      })
    );
    const hours = Number.isFinite(args.expiresInHours) && args.expiresInHours! > 0 ? Math.min(args.expiresInHours!, 24 * 90) : 7 * 24;
    const proof = await proveFunds({
      artifacts: this.artifacts,
      chainId: this.network.chainId,
      pool: this.network.pool,
      asset: asset.address,
      threshold,
      notes: withPaths,
      verifier: args.for,
      expiresAt: Math.floor(Date.now() / 1000) + Math.floor(hours * 3600),
    });
    const text = encodeProof(proof);
    return {
      status: "done",
      action: "prove_funds",
      network: this.network.key,
      proves: `holds at least ${this.fmt(threshold, asset)} privately`,
      for: proof.verifier,
      expiresAt: new Date(proof.expiresAt * 1000).toISOString(),
      proof: text,
      check: "Anyone can check it at gloam.trade/verify, or with gloam_verify_proof. It hides the balance and which notes back it.",
    };
  }

  /** A proof of a payment this agent sent (by its payment or claim handle), made for one reader. */
  async provePayment(args: { handle: string; for: string; reveal?: boolean; expiresInHours?: number }): Promise<Outcome> {
    const n = this.store.get(args.handle);
    if (!n || (n.origin !== "payment" && n.origin !== "claim")) throw new Error(`There is no payment "${args.handle}".`);
    const asset = this.network.assets.find((a) => a.address.toLowerCase() === n.asset.toLowerCase())!;
    const vault = await this.tree.sync();
    const path = await vault.pathForCommitment(n.commitment);
    if (!path) throw new Error("That payment is not in the vault yet. Wait for it to confirm.");
    const hours = Number.isFinite(args.expiresInHours) && args.expiresInHours! > 0 ? Math.min(args.expiresInHours!, 24 * 90) : 30 * 24;
    const proof = await provePayment({
      artifacts: this.artifacts,
      chainId: this.network.chainId,
      pool: this.network.pool,
      note: { secret: n.secret, amount: BigInt(n.amountWei), asset: n.asset, path },
      txHash: n.createdTx ?? vault.leafInfo(n.commitment)?.tx ?? null,
      reveal: args.reveal ?? true,
      verifier: args.for,
      expiresAt: Math.floor(Date.now() / 1000) + Math.floor(hours * 3600),
    });
    return {
      status: "done",
      action: "prove_payment",
      network: this.network.key,
      proves: `a private payment of ${args.reveal === false ? `at least ${this.fmt(proof.minAmount, asset)}` : this.fmt(n.amountWei, asset)}`,
      for: proof.verifier,
      expiresAt: new Date(proof.expiresAt * 1000).toISOString(),
      proof: encodeProof(proof),
    };
  }

  /** Check a gloamfunds1 or gloampay1 proof against the chain it names (this agent's network). */
  async verifyProof(text: string): Promise<Outcome & { report?: ProofReport }> {
    const p = decodeProof(text);
    if (Number(p.chainId) !== this.network.chainId) {
      return {
        status: "error",
        message: `That proof is for ${networkName(Number(p.chainId))}, and this agent reads ${this.where()}. Check it at gloam.trade/verify.`,
      };
    }
    const report = await verifyHolderProof(p, this.publicClient);
    return {
      status: "done",
      action: "verify",
      ok: report.ok,
      kind: report.kind,
      network: report.network,
      testnet: report.testnet,
      claims: report.claims,
      checks: report.checks,
      expired: report.expired,
    };
  }
}

/** True when an outcome would leak a secret (used by the tests and the GAME wrapper). */
export function outcomeHoldsSecret(o: unknown): boolean {
  return holdsSecret(JSON.stringify(o, (_k, v) => (typeof v === "bigint" ? v.toString() : v)));
}
