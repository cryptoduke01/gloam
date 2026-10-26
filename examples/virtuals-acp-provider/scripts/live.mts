/**
 * Run the private payout provider on ACP itself, with @virtuals-protocol/acp-node-v2.
 * Not run by the tests; it needs a registered ACP agent and its Privy wallet.
 *
 *   pnpm add @virtuals-protocol/acp-node-v2@0.1.15   (in this folder)
 *   cp .env.example .env   and fill it in
 *   pnpm exec tsx scripts/live.mts
 *
 * Defaults to ACP's testnet (Base Sepolia, api-dev.acp.virtuals.io) and Gloam's
 * Base Sepolia vault. Mainnet needs ACP_MAINNET=1 and a mainnet GLOAM_NETWORK
 * on the same chain (robinhood-mainnet with ACP_CHAIN_ID=4663, or base-mainnet
 * with 8453 once Gloam's Base vault is live).
 *
 * The provider's ACP wallet is a Privy-managed smart account, and it is also
 * the Gloam sender here, so earnings go into the private balance without
 * leaving it first. Its wallet policy must allow the Gloam vault and the
 * token's approve; under ACP's default policy those calls are refused. Private
 * payouts go through the Gloam relay, so the smart account only signs deposits.
 */
import { createPublicClient, encodeFunctionData, http, type Address } from "viem";
import { GloamAgent, acpCallSender, resolveNetwork, type AcpEvmProviderLike } from "@gloamtrade/game-plugin-gloam";
import { ACP_ABI, ACP_CONTRACTS, type AcpAgentLike } from "../src/acp.js";
import { EarningsSweeper } from "../src/earnings.js";
import { limitsFileFor } from "../src/limitsFile.js";
import { PrivatePayoutProvider } from "../src/provider.js";

const ERC20_TRANSFER = [
  { type: "function", name: "transfer", stateMutability: "nonpayable", inputs: [{ name: "to", type: "address" }, { name: "amount", type: "uint256" }], outputs: [{ type: "bool" }] },
] as const;

function need(name: string): string {
  const v = process.env[name]?.trim();
  if (!v) throw new Error(`Set ${name} (see .env.example).`);
  return v;
}

const mainnet = process.env.ACP_MAINNET === "1";
// Mainnet stays off until refunds through the ACP smart wallet are settled from the chain end to end
// (a fixed nonce key per refund, read back from the EntryPoint). On testnet a refund whose answer is
// lost is held for the owner, never sent twice.
if (mainnet) {
  throw new Error("This example does not run on ACP mainnet yet: refunds through the ACP smart wallet are not settled from the chain end to end. Run it on testnet.");
}
const chainId = Number(process.env.ACP_CHAIN_ID ?? (mainnet ? 4663 : 84532));
const acp = ACP_CONTRACTS[chainId];
if (!acp) throw new Error(`No ACP contract known for chain ${chainId}.`);
const gloamNetwork = need("GLOAM_NETWORK");
if (mainnet !== !["base", "robinhood", "tempo"].includes(gloamNetwork)) {
  throw new Error("ACP_MAINNET and GLOAM_NETWORK disagree: run testnet with testnet and mainnet with mainnet.");
}

// The SDK is optional for this example, so it is loaded at run time.
let sdk: Record<string, any>;
try {
  sdk = await import("@virtuals-protocol/acp-node-v2" as string);
} catch {
  throw new Error("Install the ACP SDK first: pnpm add @virtuals-protocol/acp-node-v2@0.1.15");
}
const { AcpAgent, AssetToken, PrivyAlchemyEvmProviderAdapter, ACP_TESTNET_SERVER_URL, TESTNET_PRIVY_APP_ID } = sdk;
const chains = await import("viem/chains");
const chain = chainId === 8453 ? chains.base : chainId === 84532 ? chains.baseSepolia : (await import("@gloamtrade/sdk")).RH_MAINNET_CHAIN;

const evmProvider = await PrivyAlchemyEvmProviderAdapter.create({
  walletAddress: need("SELLER_WALLET_ADDRESS") as Address,
  walletId: need("SELLER_WALLET_ID"),
  // A Privy authorization key (starts with MIGH), not an EOA key.
  signerPrivateKey: need("SELLER_SIGNER_PRIVATE_KEY"),
  chains: [chain],
  ...(mainnet ? {} : { serverUrl: ACP_TESTNET_SERVER_URL, privyAppId: TESTNET_PRIVY_APP_ID }),
});
const agent = (await AcpAgent.create({ evmProvider })) as AcpAgentLike;

// Limits from GLOAM_LIMITS_FILE, else the example file for the network (USDC on Base Sepolia, USDG on Robinhood Chain).
resolveNetwork(gloamNetwork);
const limitsFile = limitsFileFor(gloamNetwork);
const wallet = new GloamAgent({
  network: gloamNetwork,
  env: { ...process.env, GLOAM_LIMITS_FILE: limitsFile },
  sender: await acpCallSender(evmProvider as AcpEvmProviderLike, chainId),
});
if (wallet.network.chainId !== chainId && !(chainId === 84532 && wallet.network.key === "base")) {
  throw new Error(`GLOAM_NETWORK=${gloamNetwork} is not on chain ${chainId}.`);
}
const limits = wallet.limitsReport();
if (!limits.enforced) throw new Error(`The limits in ${limitsFile} cannot be used: ${"reason" in limits ? limits.reason : ""}`);
console.log(`limits from ${limitsFile}`);

const reader = createPublicClient({ chain, transport: http() });
const service = new PrivatePayoutProvider({
  wallet,
  budgetToken: (raw, id) => AssetToken.usdcFromRaw(raw, id),
  transferToken: (address, symbol, decimals, raw) => AssetToken.create(address, symbol, decimals, Number(raw) / 10 ** decimals),
  acpFeeBps: async (session) => {
    const platform = Number(await reader.readContract({ address: acp.acp, abi: ACP_ABI, functionName: "platformFeeBP" }));
    const hasEvaluator = session.job && session.job.evaluatorAddress !== "0x0000000000000000000000000000000000000000";
    const evaluator = hasEvaluator ? Number(await reader.readContract({ address: acp.acp, abi: ACP_ABI, functionName: "evaluatorFeeBP" })) : 0;
    return platform + evaluator;
  },
  journalPath: process.env.PAYOUT_JOURNAL ?? "./payout-jobs.json",
  // Unpaid principal of a job that ends early goes back to the client from the ACP wallet. The provider
  // writes each refund down before sending it; one whose answer is lost (this throws) is looked for on chain
  // (the token's Transfer to the client) and sent again only an hour later with nothing found.
  refund: async (to, token, raw) => {
    const out = await evmProvider.sendCalls(chainId, [
      { to: token, data: encodeFunctionData({ abi: ERC20_TRANSFER, functionName: "transfer", args: [to, raw] }), value: 0n },
    ]);
    const hash = Array.isArray(out) ? out[out.length - 1] : out;
    if (!hash) throw new Error("The ACP wallet returned no transaction hash for the refund. It may still land.");
    return String(hash);
  },
  earnings: new EarningsSweeper({ wallet, tokens: [acp.paymentToken, wallet.network.assets[0]!.address], minBatch: "25", roundTo: "5" }),
});

agent.on("entry", (session, entry) => service.onEntry(session, entry));
await agent.start();
console.log(`private payout provider listening on ACP ${mainnet ? "mainnet" : "testnet"} (chain ${chainId}); Gloam address ${await wallet.address()}`);
