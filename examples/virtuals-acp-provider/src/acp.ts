/**
 * The slice of Virtuals' Agent Commerce Protocol this provider needs, typed to
 * match @virtuals-protocol/acp-node-v2 0.1.15 (commit 392dcc6) structurally, so
 * its real AcpAgent and JobSession plug straight in, and so does the fork room
 * in ./forkRoom.ts. The SDK is not a dependency here: it pulls in Privy and
 * Alchemy wallet clients this example does not need to run.
 *
 * ACP today is the ERC-8183 job escrow ("ACP v2" in the whitepaper changelog):
 *
 *   createJob(provider, evaluator, expiredAt, description, hook)   client
 *   setBudget(jobId, amount, optParams)                            provider
 *   fund(jobId, expectedBudget, optParams)                         client, pulls the budget into escrow
 *   submit(jobId, keccak256(deliverable), optParams)               provider
 *   complete / reject(jobId, reason, optParams)                    evaluator; with no evaluator, submit completes
 *   claimRefund(jobId)                                             anyone, after expiry
 *
 * On completion the escrow pays the provider the budget less Virtuals' fees
 * (platformFeeBP, plus evaluatorFeeBP when there is an evaluator). The budget
 * is in one token per contract. Requirement and deliverable texts are
 * messages on Virtuals' ACP backend; only the deliverable's hash is on chain.
 */
import { encodeAbiParameters, type Address, type Hex } from "viem";

/** acp-node-v2 core/constants.ts and the contracts themselves, read 25 Oct 2026. */
export const ACP_CONTRACTS: Record<number, { acp: Address; paymentToken: Address; tokenName: string }> = {
  // Base mainnet: Circle USDC, the same token Gloam's Base vault takes.
  8453: { acp: "0x238E541BfefD82238730D00a2208E5497F1832E0", paymentToken: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", tokenName: "USDC" },
  // Robinhood Chain mainnet: Paxos USDG (the SDK calls it USDC), the same token Gloam's Robinhood Chain vault takes.
  4663: { acp: "0x238E541BfefD82238730D00a2208E5497F1832E0", paymentToken: "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168", tokenName: "USDG" },
  // Base Sepolia: Virtuals' own test "USD Coin", not Circle's test USDC that Gloam's Base Sepolia vault takes.
  84532: { acp: "0x0b93793923CD5De81850aF8604a233f3f24d461e", paymentToken: "0xECc22a8F6fD62388498fBa19813E214605a2BDb3", tokenName: "test USD Coin" },
};

export const ACP_ABI = [
  { type: "function", name: "createJob", stateMutability: "nonpayable", inputs: [{ name: "provider", type: "address" }, { name: "evaluator", type: "address" }, { name: "expiredAt", type: "uint256" }, { name: "description", type: "string" }, { name: "hook", type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "setBudget", stateMutability: "nonpayable", inputs: [{ name: "jobId", type: "uint256" }, { name: "amount", type: "uint256" }, { name: "optParams", type: "bytes" }], outputs: [] },
  { type: "function", name: "fund", stateMutability: "nonpayable", inputs: [{ name: "jobId", type: "uint256" }, { name: "expectedBudget", type: "uint256" }, { name: "optParams", type: "bytes" }], outputs: [] },
  { type: "function", name: "submit", stateMutability: "nonpayable", inputs: [{ name: "jobId", type: "uint256" }, { name: "deliverable", type: "bytes32" }, { name: "optParams", type: "bytes" }], outputs: [] },
  { type: "function", name: "complete", stateMutability: "nonpayable", inputs: [{ name: "jobId", type: "uint256" }, { name: "reason", type: "bytes32" }, { name: "optParams", type: "bytes" }], outputs: [] },
  { type: "function", name: "reject", stateMutability: "nonpayable", inputs: [{ name: "jobId", type: "uint256" }, { name: "reason", type: "bytes32" }, { name: "optParams", type: "bytes" }], outputs: [] },
  { type: "function", name: "jobCounter", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "platformFeeBP", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "evaluatorFeeBP", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "paymentToken", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  {
    type: "function",
    name: "jobs",
    stateMutability: "view",
    inputs: [{ name: "", type: "uint256" }],
    outputs: [
      { name: "client", type: "address" },
      { name: "status", type: "uint8" },
      { name: "provider", type: "address" },
      { name: "expiredAt", type: "uint48" },
      { name: "evaluator", type: "address" },
      { name: "hook", type: "address" },
      { name: "budget", type: "uint256" },
      { name: "description", type: "string" },
    ],
  },
  { type: "event", name: "JobCreated", inputs: [{ name: "jobId", type: "uint256", indexed: true }, { name: "client", type: "address", indexed: true }, { name: "provider", type: "address", indexed: true }, { name: "evaluator", type: "address", indexed: false }, { name: "expiredAt", type: "uint256", indexed: false }, { name: "hook", type: "address", indexed: false }] },
  // Emitted by fund() (topic 0xe3fbcc1e…, read off the Base Sepolia contract on a fork).
  { type: "event", name: "JobFunded", inputs: [{ name: "jobId", type: "uint256", indexed: true }, { name: "client", type: "address", indexed: true }, { name: "amount", type: "uint256", indexed: false }] },
] as const;

/** jobs(jobId).status on the ACP contract. */
export const ACP_STATUS = { open: 0, funded: 1, submitted: 2, completed: 3, rejected: 4, expired: 5 } as const;

/** A job as the ACP contract holds it (jobs(jobId)). */
export interface OnChainJob {
  client: Address;
  status: number;
  provider: Address;
  expiredAt: bigint;
  evaluator: Address;
  hook: Address;
  budget: bigint;
  description: string;
}

export const NO_EVALUATOR: Address = "0x0000000000000000000000000000000000000000";

/**
 * The ACP contracts are upgradeable proxies. The implementation each one ran
 * when this provider was written and checked (EIP-1967 slot, read 26 Oct 2026):
 * the provider quotes and pays only while the proxy still points there.
 */
export const ACP_IMPLEMENTATIONS: Record<number, Address> = {
  8453: "0x8e86fbef4a4c927561cb6447ced77fffbf3b77bc",
  4663: "0x8e86fbef4a4c927561cb6447ced77fffbf3b77bc",
  84532: "0xc4e95dbc7e8c99c114ff9c8299a3e4851e1530ff",
};

/** keccak256("eip1967.proxy.implementation") - 1 */
export const EIP1967_IMPLEMENTATION_SLOT = "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc" as const;

/**
 * Virtuals' FundTransferHook (whitelisted on these contracts): with it as the
 * job's hook, the provider's setBudget names a token, an amount and a
 * destination, and the client's fund() moves that amount from the client to
 * the destination in the same transaction, outside the escrow. Only the budget
 * is escrowed. acp-node-v2 uses it for offerings with requiredFunds.
 */
export const FUND_TRANSFER_HOOKS: Record<number, Address> = {
  8453: "0x0EaD25150985Bce0B4925c54E4ee1D856381A86B",
  4663: "0x0EaD25150985Bce0B4925c54E4ee1D856381A86B",
  84532: "0xbbeC2c985F9483473B9e0Da0704395943034266B",
};

/**
 * What FundTransferHook logs when fund() moves the transfer: topics (this, jobId,
 * an id), data (from, to, token, amount). Read off the Base Sepolia hook on a fork
 * (25 Oct 2026); the provider also checks the token's own Transfer in the same
 * transaction, and falls back to that alone where the hook logs differently.
 */
export const FUND_TRANSFER_EVENT_TOPIC = "0xad40084ca0b19b1b3abbe0e851c5d3e96bb2f9ca1fed724848b955ee83a95b07" as const;

/** JobFunded(uint256 indexed jobId, address indexed client, uint256 amount). */
export const JOB_FUNDED_TOPIC = "0xe3fbcc1ea1bdc559ec7f0347efde7655e58b5f45a30b0e4470a583c3ef5496b3" as const;

/** ERC-20 Transfer(from, to, value). */
export const ERC20_TRANSFER_EVENT = { type: "event", name: "Transfer", inputs: [{ name: "from", type: "address", indexed: true }, { name: "to", type: "address", indexed: true }, { name: "value", type: "uint256", indexed: false }] } as const;

/** The optParams of setBudget and fund on a fund-transfer job: (token, amount, destination). Same as acp-node-v2's hookEncoding.ts. */
export function encodeFundTransfer(token: Address, amount: bigint, destination: Address): Hex {
  return encodeAbiParameters([{ type: "address" }, { type: "uint256" }, { type: "address" }], [token, amount, destination]);
}

// ------------------------------------------------------------------ acp-node-v2 shapes (events/types.ts)

export type JobCreatedEvent = { type: "job.created"; jobId: string; client: string; provider: string; evaluator: string; expiredAt: string; hook: string };
export type FundIntent = { amount: number; tokenAddress: string; symbol: string; recipient: string };
export type BudgetSetEvent = { type: "budget.set"; jobId: string; amount: number; fundRequest?: FundIntent };
export type JobFundedEvent = { type: "job.funded"; jobId: string; client: string; amount: number };
export type JobSubmittedEvent = { type: "job.submitted"; jobId: string; provider: string; deliverableHash: string; deliverable: string };
export type JobCompletedEvent = { type: "job.completed"; jobId: string; evaluator: string; reason: string };
export type JobRejectedEvent = { type: "job.rejected"; jobId: string; rejector: string; reason: string };
export type JobExpiredEvent = { type: "job.expired"; jobId: string };
export type AcpJobEvent = JobCreatedEvent | BudgetSetEvent | JobFundedEvent | JobSubmittedEvent | JobCompletedEvent | JobRejectedEvent | JobExpiredEvent;

export type SystemEntry = { kind: "system"; onChainJobId: string; chainId: number; event: AcpJobEvent; timestamp: number };
export type AgentMessage = {
  kind: "message";
  onChainJobId: string;
  chainId: number;
  from: string;
  contentType: "text" | "proposal" | "deliverable" | "structured" | "requirement";
  content: string;
  timestamp: number;
};
export type JobRoomEntry = SystemEntry | AgentMessage;

/** core/assetToken.ts: what setBudget takes. AssetToken.usdc(amount, chainId) builds one in the real SDK. */
export interface AssetTokenLike {
  readonly address: Address;
  readonly symbol: string;
  readonly decimals: number;
  readonly amount: number;
  readonly rawAmount: bigint;
}

/** acpJob.ts AcpJob, the fields this provider reads. */
export interface AcpJobLike {
  readonly chainId: number;
  readonly clientAddress: string;
  readonly providerAddress: string;
  readonly evaluatorAddress: string;
  readonly description: string;
  readonly budget: AssetTokenLike;
  readonly expiredAt: bigint;
  readonly hookAddress: string;
}

export type DerivedStatus = "open" | "budget_set" | "funded" | "submitted" | "completed" | "rejected" | "expired";

/** jobSession.ts JobSession, the methods this provider calls. */
export interface JobSessionLike {
  readonly jobId: string;
  readonly chainId: number;
  readonly job: AcpJobLike | null;
  readonly status: DerivedStatus;
  setBudget(amount: AssetTokenLike): Promise<void>;
  /** A fund-transfer job: `transferAmount` goes from the client to `destination` when the client funds. */
  setBudgetWithFundRequest(amount: AssetTokenLike, transferAmount: AssetTokenLike, destination: string): Promise<void>;
  submit(deliverable: string): Promise<void>;
  sendMessage(content: string, contentType?: string): Promise<void>;
  reject(reason: string): Promise<void>;
}

/** acpAgent.ts AcpAgent: agent.on("entry", handler), then agent.start(). */
export interface AcpAgentLike {
  on(event: "entry", handler: (session: JobSessionLike, entry: JobRoomEntry) => void | Promise<void>): unknown;
  getAddress(): Promise<string>;
  start(): Promise<void>;
}

export function assetToken(address: Address, symbol: string, decimals: number, rawAmount: bigint): AssetTokenLike {
  const s = rawAmount.toString().padStart(decimals + 1, "0");
  const amount = Number(`${s.slice(0, -decimals) || "0"}.${s.slice(-decimals)}`);
  return { address, symbol, decimals, amount, rawAmount };
}

export type { Hex };
export type { Address };
