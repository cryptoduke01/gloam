/**
 * Reference wrapper — a payments bot that sends a PRIVATE payment on Gloam using
 * only @gloam/sdk. It shields a note to fund itself, rebuilds the pool tree from
 * chain, then spends that note with a private transfer: no public transfer, no
 * visible amount. The recipient gets a payment note they can later open or cash
 * out; the sender keeps a change note.
 *
 *   GLOAM_PAY_KEY=0x<funded RH testnet key> \
 *     npx tsx examples/pay-bot/pay-bot.ts
 *
 * Needs: a funded testnet key, snarkjs installed, and the shield + transfer
 * circuit artifacts (reused here from the app's public dir). The whole private
 * path — shield, sync, send — is @gloam/sdk; viem only signs and reads.
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
  buildPrivateSendIntent,
  artifactProver,
  syncTree,
  assertTreeMatchesChain,
  SEALED_VAULT,
  RH_TESTNET_CHAIN_ID,
} from "@gloam/sdk";

const RPC = "https://rpc.testnet.chain.robinhood.com";
const DEPLOY_BLOCK = 110_840_714n; // pool deploy block — start the log scan here
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

async function main() {
  const pk = process.env.GLOAM_PAY_KEY;
  if (!pk) throw new Error("Set GLOAM_PAY_KEY (a funded RH testnet key).");
  const account = privateKeyToAccount(
    (pk.startsWith("0x") ? pk : `0x${pk}`) as `0x${string}`
  );
  const wallet = createWalletClient({ account, chain: rhTestnet, transport: http(RPC) });
  const pub = createPublicClient({ chain: rhTestnet, transport: http(RPC) });

  const fundWei = parseEther("0.002"); // shield this to fund the bot
  const payWei = parseEther("0.001"); // send half privately; the rest is change

  // ── 1. Shield a note to fund the bot ───────────────────────────────────────
  console.log(`Bot ${account.address} shielding ${formatEther(fundWei)} ETH to fund itself…`);
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
  console.log(`Funded. Source note commitment ${shield.note.commitment}`);

  // ── 2. Rebuild the tree from chain, get this note's membership path ─────────
  console.log("Syncing the pool tree from chain…");
  const synced = await syncTree(pub, { pool: SEALED_VAULT, fromBlock: DEPLOY_BLOCK });
  const matches = await assertTreeMatchesChain(pub, SEALED_VAULT, synced);
  console.log(`  ${synced.leafCount} leaves, root ${matches ? "matches chain ✓" : "MISMATCH ✗"}`);
  const path = await synced.pathForCommitment(shield.note.commitment);
  if (!path) throw new Error("Source note not found in the tree yet — retry in a moment.");

  // ── 3. Build + broadcast the private send ──────────────────────────────────
  console.log(`Sending ${formatEther(payWei)} ETH privately…`);
  const send = await buildPrivateSendIntent({
    secretHex: shield.note.secret,
    amountInWei: fundWei,
    amountPayWei: payWei,
    path,
    prove: artifactProver({ wasm: art("transfer.wasm"), zkey: art("transfer_final.zkey") }),
  });
  const sendHash = await wallet.writeContract({
    address: send.exec.poolAddress,
    abi: transferAbi,
    functionName: "transfer",
    args: send.exec.args as readonly [
      `0x${string}`,
      `0x${string}`,
      `0x${string}`,
      readonly [`0x${string}`, `0x${string}`],
    ],
  });
  const receipt = await pub.waitForTransactionReceipt({ hash: sendHash });
  if (receipt.status !== "success") {
    throw new Error("Transfer reverted — check the pool's verifier is set and the key is funded.");
  }

  // ── 4. Hand the payment note to the recipient; keep the change note ─────────
  console.log("\nPrivate payment settled. Nothing about the amount is on the public feed.");
  console.log("Give this PAYMENT NOTE to the recipient (they open or cash it out):");
  console.log("  secret:    ", send.paymentNote.secret);
  console.log("  commitment:", send.paymentNote.commitment);
  console.log("  amount:    ", formatEther(BigInt(send.paymentNote.amountWei)), "ETH");
  console.log("\nKeep this CHANGE NOTE (stays with you):");
  console.log("  secret:    ", send.changeNote.secret);
  console.log("  amount:    ", formatEther(BigInt(send.changeNote.amountWei)), "ETH");
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
