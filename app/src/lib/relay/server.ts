/**
 * Gloam relay, server side.
 *
 * Submits already-proven private sends, cash outs and payment memos from a
 * Gloam relay account, so the user's own wallet never appears next to them on
 * a block explorer. The pool never checks msg.sender on transfer/unshield (the
 * Groth16 proof is the authorization, and unshield binds the recipient inside
 * the proof), so relaying cannot redirect funds: the worst a relay can do is
 * refuse to submit.
 *
 * Guard rails:
 *   - only the active pool's transfer/unshield and the memo board's postMemo
 *   - dry run (gas estimate against the pool) before anything is sent, so a bad
 *     proof, a spent note or a stale root costs the relay nothing
 *   - memos only for commitments the pool has actually inserted
 *   - sanctions screening of every public recipient (a cash out's `to`) before
 *     anything is checked or sent (lib/screeningServer.ts), plus on Tempo the
 *     asset's TIP-403 issuer policy for the vault and `to`; private sends and
 *     memos carry no public address, so there is nothing to screen
 *   - per-IP and per-network rate limits, shared across instances, and at
 *     most a few relayed payment messages per payment
 *
 * Testnet: submission is free. Mainnet needs a relay fee carved out inside the
 * circuit (an extra public output), otherwise the relay pays everyone's gas.
 *
 * Key: GLOAM_RELAYER_PRIVATE_KEY (server env only, never NEXT_PUBLIC_). With no
 * key set the relay reports itself disabled and the app falls back to wallet
 * submission.
 */
import {
  BaseError,
  ContractFunctionRevertedError,
  createPublicClient,
  createWalletClient,
  http,
  type Address,
  type Hex,
  type PublicClient,
} from "viem";
import { privateKeyToAccount, type PrivateKeyAccount } from "viem/accounts";
import {
  NETWORK_KEYS,
  getNetwork,
  isNetworkWritable,
  type GloamNetwork,
} from "@/lib/networks";
import { hitRateLimit } from "@/lib/mcpRemote/rateLimit";
import { SCREEN_BLOCKED_MESSAGE } from "@/lib/screening";
import { screenAddresses } from "@/lib/screeningServer";

const POOL_ERRORS = [
  "ZeroCommitment",
  "AlreadySpent",
  "UnknownRoot",
  "VerifierNotSet",
  "InvalidProof",
  "ZeroAddress",
  "TransferFailed",
  "InvalidAmount",
  "InsufficientPoolBalance",
  "DuplicateCommitment",
  "Reentrancy",
].map((name) => ({ type: "error" as const, name, inputs: [] }));

export const relayPoolAbi = [
  {
    type: "function",
    name: "transfer",
    stateMutability: "nonpayable",
    inputs: [
      { name: "proof", type: "bytes" },
      { name: "root", type: "bytes32" },
      { name: "nullifier", type: "bytes32" },
      { name: "newCommitments", type: "bytes32[2]" },
    ],
    outputs: [],
  },
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
  {
    type: "function",
    name: "spent",
    stateMutability: "view",
    inputs: [{ name: "", type: "bytes32" }],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    type: "function",
    name: "commitmentSeen",
    stateMutability: "view",
    inputs: [{ name: "", type: "bytes32" }],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    type: "function",
    name: "isKnownRoot",
    stateMutability: "view",
    inputs: [{ name: "root", type: "bytes32" }],
    outputs: [{ name: "", type: "bool" }],
  },
  ...POOL_ERRORS,
] as const;

const memoAbi = [
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
  { type: "error", name: "ZeroCommitment", inputs: [] },
  { type: "error", name: "BadMemo", inputs: [] },
] as const;

/** Plain-language reasons for pool reverts (shown to the user). */
const REVERT_MESSAGES: Record<string, string> = {
  AlreadySpent: "This money was already spent. Refresh your balance.",
  UnknownRoot: "Your view of the vault is out of date. Refresh and try again.",
  InvalidProof: "The payment proof did not check out. Refresh and try again.",
  InsufficientPoolBalance: "The vault does not hold enough of this asset to cash out right now.",
  DuplicateCommitment: "This payment was already submitted.",
  VerifierNotSet: "This vault is not fully set up yet.",
  InvalidAmount: "That amount is not valid.",
  ZeroAddress: "Missing a destination address.",
  BadMemo: "The payment message is too large.",
};

export class RelayError extends Error {
  constructor(
    message: string,
    public status = 400,
    public code = "bad_request"
  ) {
    super(message);
  }
}

// ---------------------------------------------------------------- config

let cachedAccount: PrivateKeyAccount | null | undefined;

export function relayerAccount(): PrivateKeyAccount | null {
  if (cachedAccount !== undefined) return cachedAccount;
  const raw = process.env.GLOAM_RELAYER_PRIVATE_KEY?.trim();
  if (!raw) return (cachedAccount = null);
  const key = (raw.startsWith("0x") ? raw : `0x${raw}`) as Hex;
  if (!/^0x[0-9a-fA-F]{64}$/.test(key)) return (cachedAccount = null);
  return (cachedAccount = privateKeyToAccount(key));
}

export function relayNetworks(): GloamNetwork[] {
  return NETWORK_KEYS.map(getNetwork).filter(isNetworkWritable);
}

export function networkForChain(chainId: unknown): GloamNetwork {
  const id = typeof chainId === "number" ? chainId : Number(chainId);
  const net = relayNetworks().find((n) => n.chainId === id);
  if (!net || !net.pool) {
    throw new RelayError("This network is not supported by the relay.", 400, "network");
  }
  return net;
}

const publicClients = new Map<number, PublicClient>();

export function relayPublicClient(net: GloamNetwork): PublicClient {
  const hit = publicClients.get(net.chainId);
  if (hit) return hit;
  const c = createPublicClient({
    chain: net.chain,
    transport: http(net.chain.rpcUrls.default.http[0], { timeout: 20_000, retryCount: 1 }),
  });
  publicClients.set(net.chainId, c);
  return c;
}

function walletFor(net: GloamNetwork, account: PrivateKeyAccount) {
  return createWalletClient({
    account,
    chain: net.chain,
    transport: http(net.chain.rpcUrls.default.http[0], { timeout: 30_000, retryCount: 1 }),
  });
}

// ---------------------------------------------------------------- limits

// Shared across server instances (lib/mcpRemote/rateLimit: Upstash Redis, or
// process memory when it is not set or does not answer).
const WINDOW_SEC = 10 * 60;
// A payroll run is up to 200 payments plus 200 notifications.
const PER_IP = 400;
const PER_NETWORK_HOURLY = 5_000;
/** Relayed payment messages per payment per day. A payment needs one; the rest covers retries. */
const MEMOS_PER_PAYMENT = 3;

export async function checkRateLimit(ip: string, chainId: number): Promise<void> {
  const now = Date.now();
  if (!(await hitRateLimit(ip, "relay-ip", PER_IP, now, WINDOW_SEC)).allowed) {
    throw new RelayError("Too many requests from this device. Wait a few minutes.", 429, "rate_limit");
  }
  if (!(await hitRateLimit(`chain:${chainId}`, "relay-net", PER_NETWORK_HOURLY, now, 3600)).allowed) {
    throw new RelayError("The relay is busy. Try again shortly or send from your wallet.", 429, "rate_limit");
  }
}

// ---------------------------------------------------------------- validation

const BYTES32 = /^0x[0-9a-fA-F]{64}$/;
const ADDRESS = /^0x[0-9a-fA-F]{40}$/;

export function asBytes32(v: unknown, field: string): Hex {
  if (typeof v !== "string" || !BYTES32.test(v)) throw new RelayError(`Invalid ${field}.`);
  return v as Hex;
}

export function asAddress(v: unknown, field: string): Address {
  if (typeof v !== "string" || !ADDRESS.test(v)) throw new RelayError(`Invalid ${field}.`);
  return v as Address;
}

export function asProof(v: unknown): Hex {
  // Groth16 proof bytes: a handful of field elements, never more than 2 KB.
  if (typeof v !== "string" || !/^0x([0-9a-fA-F]{2}){64,2048}$/.test(v)) {
    throw new RelayError("Invalid proof.");
  }
  return v as Hex;
}

export function asAmount(v: unknown): bigint {
  if (typeof v !== "string" || !/^\d{1,78}$/.test(v)) throw new RelayError("Invalid amount.");
  const n = BigInt(v);
  if (n <= 0n) throw new RelayError("Invalid amount.");
  return n;
}

export function asMemo(v: unknown): Hex {
  if (typeof v !== "string" || !/^0x([0-9a-fA-F]{2}){1,8192}$/.test(v)) {
    throw new RelayError("Invalid payment message.");
  }
  return v as Hex;
}

// ---------------------------------------------------------------- submit

function revertName(err: unknown): string | null {
  if (err instanceof BaseError) {
    const r = err.walk((e) => e instanceof ContractFunctionRevertedError);
    if (r instanceof ContractFunctionRevertedError) return r.data?.errorName ?? null;
  }
  return null;
}

function explain(err: unknown, fallback: string): RelayError {
  const name = revertName(err);
  if (name && REVERT_MESSAGES[name]) return new RelayError(REVERT_MESSAGES[name], 422, name);
  const msg = err instanceof Error ? err.message : String(err);
  if (/insufficient funds|gas required exceeds/i.test(msg)) {
    return new RelayError("The relay is out of gas. Send from your wallet for now.", 503, "relay_empty");
  }
  return new RelayError(fallback, 502, "rpc");
}

// Tempo caps a tx at 30M gas; keep headroom and pad estimates for Tempo's
// storage-heavy pricing (tree inserts).
const GAS_CAP = 25_000_000n;
function padGas(est: bigint) {
  const padded = (est * 13n) / 10n;
  return padded > GAS_CAP ? GAS_CAP : padded;
}

export type Call =
  | { kind: "transfer"; args: readonly [Hex, Hex, Hex, readonly [Hex, Hex]] }
  | { kind: "unshield"; args: readonly [Hex, Hex, Hex, Address, Address, bigint] }
  | { kind: "memo"; args: readonly [Hex, Hex] };

/** Public addresses a call pays out to. Only a cash out has one. */
function publicRecipients(call: Call): Address[] {
  return call.kind === "unshield" ? [call.args[4]] : [];
}

/**
 * Refuse a call that pays a sanctioned address. Says nothing more than that.
 * With `net` on Tempo, a cash out is also checked against the asset's TIP-403
 * issuer policy: the vault must be allowed to send it and `to` to receive it.
 */
export async function screenCall(call: Call, net?: GloamNetwork): Promise<void> {
  const recipients = publicRecipients(call);
  if (recipients.length === 0) return;
  const context =
    net && call.kind === "unshield"
      ? { chainId: net.chainId, asset: call.args[3], flow: "cashout" as const }
      : undefined;
  const { allowed, message } = await screenAddresses(recipients, context);
  if (!allowed) {
    // A wallet block (sanctions or issuer) is neutral. A vault-level issuer
    // block or pause is not about the wallet, so it is said plainly.
    if (!message || message === SCREEN_BLOCKED_MESSAGE) {
      throw new RelayError(SCREEN_BLOCKED_MESSAGE, 403, "screened");
    }
    throw new RelayError(message, 403, "asset_policy");
  }
}

async function submit(net: GloamNetwork, call: Call): Promise<Hex> {
  // Screen before anything else: a blocked call never reaches the chain.
  await screenCall(call, net);
  const account = relayerAccount();
  if (!account) {
    throw new RelayError("The relay is off. Send from your wallet.", 503, "relay_off");
  }
  const pub = relayPublicClient(net);
  const wallet = walletFor(net, account);
  const pool = net.pool!;

  const estimate = (): Promise<bigint> => {
    switch (call.kind) {
      case "transfer":
        return pub.estimateContractGas({ address: pool, abi: relayPoolAbi, functionName: "transfer", args: call.args, account });
      case "unshield":
        return pub.estimateContractGas({ address: pool, abi: relayPoolAbi, functionName: "unshield", args: call.args, account });
      case "memo":
        return pub.estimateContractGas({ address: net.payMemo!.address, abi: memoAbi, functionName: "postMemo", args: call.args, account });
    }
  };
  const send = (gas: bigint): Promise<Hex> => {
    switch (call.kind) {
      case "transfer":
        return wallet.writeContract({ address: pool, abi: relayPoolAbi, functionName: "transfer", args: call.args, gas, chain: net.chain, account });
      case "unshield":
        return wallet.writeContract({ address: pool, abi: relayPoolAbi, functionName: "unshield", args: call.args, gas, chain: net.chain, account });
      case "memo":
        return wallet.writeContract({ address: net.payMemo!.address, abi: memoAbi, functionName: "postMemo", args: call.args, gas, chain: net.chain, account });
    }
  };

  let gas: bigint;
  try {
    // Dry run: reverts here (bad proof, spent note, stale root) cost nothing.
    gas = await estimate();
  } catch (e) {
    throw explain(e, "Could not check this payment. Try again.");
  }

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      return await send(padGas(gas));
    } catch (e) {
      const msg = e instanceof Error ? e.message : "";
      // Two relays racing the same nonce: refetch and retry once.
      if (attempt === 0 && /nonce|replacement|underpriced|already known/i.test(msg)) continue;
      throw explain(e, "The relay could not submit this payment. Try again or send from your wallet.");
    }
  }
  throw new RelayError("The relay could not submit this payment.", 502, "rpc");
}

export async function relayTransfer(net: GloamNetwork, body: Record<string, unknown>) {
  const proof = asProof(body.proof);
  const root = asBytes32(body.root, "root");
  const nullifier = asBytes32(body.nullifier, "nullifier");
  const commitments = body.commitments;
  if (!Array.isArray(commitments) || commitments.length !== 2) throw new RelayError("Invalid commitments.");
  const c0 = asBytes32(commitments[0], "commitment");
  const c1 = asBytes32(commitments[1], "commitment");
  await precheckSpend(net, root, nullifier);
  return submit(net, { kind: "transfer", args: [proof, root, nullifier, [c0, c1]] });
}

export async function relayUnshield(net: GloamNetwork, body: Record<string, unknown>) {
  const proof = asProof(body.proof);
  const root = asBytes32(body.root, "root");
  const nullifier = asBytes32(body.nullifier, "nullifier");
  const asset = asAddress(body.asset, "asset");
  const to = asAddress(body.to, "recipient");
  const amount = asAmount(body.amount);
  // The recipient and amount are public inputs of the unshield proof, so the
  // relay cannot change where the money goes.
  const call: Call = { kind: "unshield", args: [proof, root, nullifier, asset, to, amount] };
  await screenCall(call, net);
  await precheckSpend(net, root, nullifier);
  return submit(net, call);
}

export async function relayMemo(net: GloamNetwork, body: Record<string, unknown>) {
  if (!net.payMemo) throw new RelayError("Payment messages are not live on this network yet.", 400, "no_memo");
  const commitment = asBytes32(body.paymentCommitment, "payment");
  const memo = asMemo(body.memo);
  // Only relay memos for payments that really landed in the pool.
  const seen = (await relayPublicClient(net).readContract({
    address: net.pool!,
    abi: relayPoolAbi,
    functionName: "commitmentSeen",
    args: [commitment],
  })) as boolean;
  if (!seen) throw new RelayError("That payment is not in the vault yet. Wait for it to confirm.", 409, "not_seen");
  // The memo board takes any number of messages per payment, and each relayed
  // one is gas the relay pays: one message per payment, plus a few retries.
  const perPayment = await hitRateLimit(`memo:${net.chainId}:${commitment.toLowerCase()}`, "relay-memo", MEMOS_PER_PAYMENT, Date.now(), 86_400);
  if (!perPayment.allowed) {
    throw new RelayError("A message for this payment was already sent.", 409, "memo_sent");
  }
  return submit(net, { kind: "memo", args: [commitment, memo] });
}

async function precheckSpend(net: GloamNetwork, root: Hex, nullifier: Hex) {
  const pub = relayPublicClient(net);
  const [spent, known] = await Promise.all([
    pub.readContract({ address: net.pool!, abi: relayPoolAbi, functionName: "spent", args: [nullifier] }),
    pub.readContract({ address: net.pool!, abi: relayPoolAbi, functionName: "isKnownRoot", args: [root] }),
  ]);
  if (spent) throw new RelayError(REVERT_MESSAGES.AlreadySpent, 409, "AlreadySpent");
  if (!known) throw new RelayError(REVERT_MESSAGES.UnknownRoot, 409, "UnknownRoot");
}

// ---------------------------------------------------------------- status

export type RelayNetworkStatus = {
  chainId: number;
  key: string;
  enabled: boolean;
  relayer: Address | null;
  memo: boolean;
  lowBalance: boolean;
};

/** Relay balance reads kept briefly, so a public status poll is not an RPC call each time. */
const BALANCE_TTL_MS = 30_000;
const balances = new Map<number, { at: number; empty: boolean }>();

async function relayEmpty(net: GloamNetwork, account: PrivateKeyAccount): Promise<boolean> {
  const hit = balances.get(net.chainId);
  if (hit && Date.now() - hit.at < BALANCE_TTL_MS) return hit.empty;
  try {
    const empty = (await relayPublicClient(net).getBalance({ address: account.address })) === 0n;
    balances.set(net.chainId, { at: Date.now(), empty });
    return empty;
  } catch {
    /* status is best effort */
    return false;
  }
}

export async function relayStatus(): Promise<RelayNetworkStatus[]> {
  const account = relayerAccount();
  return Promise.all(
    relayNetworks().map(async (net) => {
      const lowBalance = account ? await relayEmpty(net, account) : false;
      return {
        chainId: net.chainId,
        key: net.key,
        enabled: Boolean(account) && !lowBalance,
        relayer: account?.address ?? null,
        memo: Boolean(net.payMemo),
        lowBalance,
      };
    })
  );
}
