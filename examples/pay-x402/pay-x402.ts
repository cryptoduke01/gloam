/**
 * Reference agent payment over x402, private end to end, using only
 * @gloamtrade/sdk. A seller prices a resource (the 402 challenge); a buyer agent
 * shields a note to fund itself, builds a PRIVATE payment of the required amount
 * to the payee, broadcasts it itself (self-custodial, no operator holds its
 * key), presents the X-PAYMENT header, and the seller verifies it.
 *
 * This is the pattern that won Colosseum (x402 + stablecoins) with the
 * settlement made private: the amount and the parties never go on the public
 * feed. This is NOT a Tempo Zone: no operator sees the payment; only the payer
 * and the payee learn the amount.
 *
 *   GLOAM_PAY_KEY=0x<funded RH testnet key> \
 *     npx tsx examples/pay-x402/pay-x402.ts
 *
 * The demo settles on Robinhood testnet (asset: native ETH), because that pool
 * is live. On Tempo the identical flow settles a stablecoin; only the asset and
 * the chain config differ.
 */
import {
  createWalletClient,
  createPublicClient,
  defineChain,
  http,
  parseEther,
  formatEther,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import {
  buildShieldBoundIntent,
  buildGloamPaymentRequirements,
  buildGloamPayment,
  verifyGloamPayment,
  decodePaymentHeader,
  artifactProver,
  syncTree,
  SEALED_VAULT,
  RH_TESTNET_CHAIN_ID,
} from "@gloamtrade/sdk";

const RPC = "https://rpc.testnet.chain.robinhood.com";
const DEPLOY_BLOCK = 110_840_714n;
const here = dirname(fileURLToPath(import.meta.url));
const art = (name: string) => resolve(here, "../../app/public/circuits/", name);

const rhTestnet = defineChain({
  id: RH_TESTNET_CHAIN_ID,
  name: "Robinhood Chain Testnet",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: [RPC] } },
});

const shieldBoundAbi = [
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

const transferAbi = [
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
] as const;

const commitmentSeenAbi = [
  {
    type: "function",
    name: "commitmentSeen",
    stateMutability: "view",
    inputs: [{ name: "commitment", type: "bytes32" }],
    outputs: [{ name: "", type: "bool" }],
  },
] as const;

async function main() {
  const pk = process.env.GLOAM_PAY_KEY;
  if (!pk) throw new Error("Set GLOAM_PAY_KEY (a funded RH testnet key).");
  const account = privateKeyToAccount(
    (pk.startsWith("0x") ? pk : `0x${pk}`) as `0x${string}`
  );
  const wallet = createWalletClient({ account, chain: rhTestnet, transport: http(RPC) });
  const pub = createPublicClient({ chain: rhTestnet, transport: http(RPC) });

  // ── Seller: price the resource (the 402 challenge) ─────────────────────────
  const price = parseEther("0.001");
  const requirements = buildGloamPaymentRequirements({
    amountWei: price,
    assetSymbol: "ETH", // native on RH testnet; a stablecoin on Tempo
    payTo: "gloam:rcpt:demo-seller",
    resource: "mcp://gloam/tool/summarize",
    description: "One private summarize call",
  });
  console.log("402 Payment Required:");
  console.log(`  price ${formatEther(price)} ${requirements.assetSymbol} to ${requirements.payTo}`);
  console.log(`  ${requirements.privacy.oneLine}\n`);

  // ── Buyer: shield a note to fund itself ────────────────────────────────────
  const fundWei = parseEther("0.002");
  console.log(`Buyer ${account.address} shielding ${formatEther(fundWei)} ETH to fund the payment…`);
  const shield = await buildShieldBoundIntent({
    amountWei: fundWei,
    prover: artifactProver({ wasm: art("shield.wasm"), zkey: art("shield_final.zkey") }),
  });
  const shieldHash = await wallet.writeContract({
    address: shield.exec.poolAddress,
    abi: shieldBoundAbi,
    functionName: "shieldBound",
    args: shield.exec.args as readonly [`0x${string}`, bigint, `0x${string}`, `0x${string}`],
    value: shield.exec.valueWei,
  });
  await pub.waitForTransactionReceipt({ hash: shieldHash });

  // ── Buyer: sync the tree and build the private x402 payment ────────────────
  const synced = await syncTree(pub, { pool: SEALED_VAULT, fromBlock: DEPLOY_BLOCK });
  const path = await synced.pathForCommitment(shield.note.commitment);
  if (!path) throw new Error("Source note not in the tree yet — retry in a moment.");

  const payment = await buildGloamPayment({
    requirements,
    senderSecretHex: shield.note.secret,
    senderNoteAmountWei: fundWei,
    path,
    prove: artifactProver({ wasm: art("transfer.wasm"), zkey: art("transfer_final.zkey") }),
    issuerTag: "issuer:demo", // optional issuer-scoped compliance disclosure
  });

  // ── Buyer: settle the payment itself, then attach the tx hash ──────────────
  console.log("Settling the private payment (self-custodial)…");
  const sendHash = await wallet.writeContract({
    address: payment.intent.exec.poolAddress,
    abi: transferAbi,
    functionName: "transfer",
    args: payment.intent.exec.args as readonly [
      `0x${string}`,
      `0x${string}`,
      `0x${string}`,
      readonly [`0x${string}`, `0x${string}`],
    ],
  });
  const receipt = await pub.waitForTransactionReceipt({ hash: sendHash });
  if (receipt.status !== "success") throw new Error("Transfer reverted.");
  payment.payload.payload.txHash = sendHash;

  // ── Seller: verify the presented X-PAYMENT before granting access ──────────
  const presented = decodePaymentHeader(payment.header); // what the buyer sends back
  const v = verifyGloamPayment({ requirements, payload: presented });
  console.log(`\nSeller verify: ${v.ok ? "OK" : "REJECTED: " + v.reason}`);
  if (!v.ok || !v.commitment) throw new Error("Payment did not verify.");

  // One of the on-chain checks the seller runs: the payment note is a real leaf.
  const seen = await pub.readContract({
    address: SEALED_VAULT,
    abi: commitmentSeenAbi,
    functionName: "commitmentSeen",
    args: [v.commitment],
  });
  console.log(`  payment note on-chain (commitmentSeen): ${seen ? "yes ✓" : "not yet"}`);
  console.log("  remaining on-chain checks:");
  for (const c of v.onchainChecksRequired) console.log(`   - ${c}`);
  console.log("\nAccess granted. The public feed shows a shielded transfer, never the amount or the parties.");
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
