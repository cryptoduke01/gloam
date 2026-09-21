/**
 * Agent-on-Tempo demo: one command that proves a self-custodial private
 * stablecoin payment end to end.
 *
 *   fund the agent (tempo_fundAddress) -> shield PathUSD -> settle a private
 *   x402 payment -> verify it -> print the change note.
 *
 * Everything is broadcast by the agent's own key. No operator, no sequencer, no
 * facilitator holds funds or can see the amounts. This is the "for agents" half
 * of Gloam on Tempo.
 *
 * Run:
 *   GLOAM_AGENT_PRIVATE_KEY=0x... npx tsx scripts/demo-tempo-agent.mts
 *
 * Optional env: AMOUNT (PathUSD to shield, default 10), PAY (to send, default 1),
 * PAYTO (payee receive tag, default a demo tag), SKIP_FUND=1 to skip the faucet.
 */
import { parseUnits, type Address, type Hex } from "viem";
import {
  buildShieldBoundIntent,
  buildGloamPaymentRequirements,
  buildGloamPayment,
  verifyGloamPayment,
  artifactProver,
  syncTree,
  TEMPO_PATHUSD,
} from "@gloamtrade/sdk";
import { MCP_NETWORKS } from "../src/networks.js";
import { getSigner } from "../src/signer.js";
import { shieldArtifacts, transferArtifacts } from "../src/artifacts.js";

const net = MCP_NETWORKS.tempo;
const DEC = 6; // PathUSD
const SHIELD_AMT = process.env.AMOUNT ?? "10";
const PAY_AMT = process.env.PAY ?? "1";
const PAYTO = process.env.PAYTO ?? "gloam:demo-payee";

const erc20Abi = [
  {
    type: "function",
    name: "approve",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ type: "bool" }],
  },
] as const;

const shieldPoolAbi = [
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

async function fundTempo(addr: string) {
  const res = await fetch(net.rpc, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "tempo_fundAddress",
      params: [addr],
    }),
  });
  const json = (await res.json()) as { result?: string[]; error?: { message?: string } };
  if (json.error) throw new Error(json.error.message ?? "faucet failed");
  return json.result ?? [];
}

async function main() {
  const signer = getSigner(net);
  if (!signer) {
    console.error("Set GLOAM_AGENT_PRIVATE_KEY (a Tempo testnet key) to run this demo.");
    process.exit(1);
  }
  const agent = signer.account.address;
  const asset = TEMPO_PATHUSD as Address;
  console.log(`\nAgent: ${agent}`);
  console.log(`Network: ${net.name} (chain ${net.chainId}), pool ${net.pool}\n`);

  if (!process.env.SKIP_FUND) {
    console.log("1/5  Funding the agent via tempo_fundAddress...");
    const txs = await fundTempo(agent);
    console.log(`     funded (${txs.length} txs)\n`);
    await new Promise((r) => setTimeout(r, 2500));
  }

  console.log(`2/5  Shielding ${SHIELD_AMT} PathUSD (approve -> shieldBound)...`);
  const shieldWei = parseUnits(SHIELD_AMT, DEC);
  const sArt = await shieldArtifacts();
  const shield = await buildShieldBoundIntent({
    amountWei: shieldWei,
    asset,
    poolAddress: net.pool,
    prover: artifactProver(sArt),
  });
  const approveHash = await signer.walletClient.writeContract({
    address: asset,
    abi: erc20Abi,
    functionName: "approve",
    args: [net.pool, shieldWei],
  });
  await signer.publicClient.waitForTransactionReceipt({ hash: approveHash });
  const shieldHash = await signer.walletClient.writeContract({
    address: shield.exec.poolAddress,
    abi: shieldPoolAbi,
    functionName: "shieldBound",
    args: shield.exec.args as readonly [Address, bigint, Hex, Hex],
    value: shield.exec.valueWei,
  });
  await signer.publicClient.waitForTransactionReceipt({ hash: shieldHash });
  console.log(`     shielded. tx ${net.explorer}/tx/${shieldHash}`);
  console.log(`     note commitment ${shield.note.commitment}\n`);

  console.log(`3/5  Building the x402 payment requirement (${PAY_AMT} PathUSD to ${PAYTO})...`);
  const req = buildGloamPaymentRequirements({
    amountWei: parseUnits(PAY_AMT, DEC),
    asset,
    assetSymbol: "PathUSD",
    payTo: PAYTO,
    resource: "demo:agent-tempo",
    network: net.chainId,
    poolAddress: net.pool,
  });
  console.log("     requirement built\n");

  console.log("4/5  Settling privately (sync tree -> prove transfer -> broadcast)...");
  const synced = await syncTree(signer.publicClient, {
    pool: net.pool,
    fromBlock: net.deployBlock,
  });
  const path = await synced.pathForCommitment(shield.note.commitment);
  if (!path) throw new Error("Shield note not found in the tree yet; wait a block and retry.");
  const tArt = await transferArtifacts();
  const payment = await buildGloamPayment({
    requirements: req,
    senderSecretHex: shield.note.secret as `0x${string}`,
    senderNoteAmountWei: shieldWei,
    path,
    prove: artifactProver(tArt),
  });
  const payHash = await signer.walletClient.writeContract({
    address: payment.intent.exec.poolAddress,
    abi: transferAbi,
    functionName: "transfer",
    args: payment.intent.exec.args as readonly [Hex, Hex, Hex, readonly [Hex, Hex]],
  });
  const receipt = await signer.publicClient.waitForTransactionReceipt({ hash: payHash });
  if (receipt.status !== "success") throw new Error(`transfer reverted (${payHash})`);
  payment.payload.payload.txHash = payHash;
  console.log(`     settled. tx ${net.explorer}/tx/${payHash}\n`);

  console.log("5/5  Verifying the payment...");
  const verify = verifyGloamPayment({ requirements: req, payload: payment.payload });
  console.log(`     verified: ${verify.ok}`);
  console.log(`     payee note (opens to ${PAY_AMT} PathUSD): ${payment.paymentNote.commitment}`);
  console.log(`     agent change note (remaining balance): ${payment.changeNote.amountWei} base units`);
  console.log(
    "\nDone. The public feed shows two shielded transactions and nothing else: not the amount, not the parties. Only the payee can open the payment note.\n"
  );
}

main().catch((e) => {
  console.error("\nDemo failed:", e instanceof Error ? e.message : e);
  process.exit(1);
});
