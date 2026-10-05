/**
 * Agent-on-Tempo demo: one command that proves a self-custodial private
 * stablecoin payment end to end.
 *
 *   fund the agent (tempo_fundAddress) -> shield PathUSD -> settle a private
 *   x402 payment, sealed to the payee's receive tag -> the payee opens it and
 *   sweeps it into a fresh note -> print the result.
 *
 * Everything is broadcast by the agent's own key. No operator, no sequencer, no
 * facilitator holds funds or can see the amounts. This is the "for agents" half
 * of Gloam on Tempo.
 *
 * Run:
 *   GLOAM_AGENT_PRIVATE_KEY=0x... npx tsx scripts/demo-tempo-agent.mts
 *   (add GLOAM_RELAY_URL=http://localhost:3000/api/relay to settle through the relay)
 *
 * Optional env: AMOUNT (PathUSD to shield, default 10), PAY (to send, default 1),
 * SKIP_FUND=1 to skip the faucet. The payee is a fresh receive key made in this
 * process, so the demo can play both sides; the payee's sweep is signed by the
 * same key (or the relay).
 */
import { parseUnits, type Address, type Hex } from "viem";
import {
  buildShieldBoundIntent,
  buildGloamPaymentRequirements,
  buildGloamPayment,
  generateReceiveKey,
  settleGloamPayment,
  sweepChainFromClient,
  transferCallArgs,
  POOL_TRANSFER_ABI,
  artifactProver,
  syncTree,
  TEMPO_PATHUSD,
  GLOAM_RELAY_URL,
  relayIntent,
  type PrivateSendIntent,
} from "@gloamtrade/sdk";
import { MCP_NETWORKS } from "../src/networks.js";
import { getSigner } from "../src/signer.js";
import { shieldArtifacts, transferArtifacts } from "../src/artifacts.js";

const net = MCP_NETWORKS.tempo;
const DEC = 6; // PathUSD
const SHIELD_AMT = process.env.AMOUNT ?? "10";
const PAY_AMT = process.env.PAY ?? "1";

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
    console.log("1/6  Funding the agent via tempo_fundAddress...");
    const txs = await fundTempo(agent);
    console.log(`     funded (${txs.length} txs)\n`);
    await new Promise((r) => setTimeout(r, 2500));
  }

  console.log(`2/6  Shielding ${SHIELD_AMT} PathUSD (approve -> shieldBound)...`);
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

  const payee = await generateReceiveKey();
  console.log(`3/6  Building the x402 payment requirement (${PAY_AMT} PathUSD to the payee's receive tag)...`);
  const req = buildGloamPaymentRequirements({
    amountWei: parseUnits(PAY_AMT, DEC),
    asset,
    assetSymbol: "PathUSD",
    payTo: payee.tag,
    resource: "demo:agent-tempo",
    network: net.chainId,
    poolAddress: net.pool,
  });
  console.log("     requirement built\n");

  console.log("4/6  Paying privately (sync tree -> prove transfer -> broadcast)...");
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
  // GLOAM_RELAY_URL (or GLOAM_USE_RELAY=1 for the hosted relay): the Gloam relay
  // submits the payment, so the agent's wallet never appears next to it.
  const relayUrl =
    process.env.GLOAM_RELAY_URL?.trim() || (process.env.GLOAM_USE_RELAY === "1" ? GLOAM_RELAY_URL : "");
  const submit = (intent: PrivateSendIntent): Promise<Hex> =>
    relayUrl
      ? relayIntent(intent, { url: relayUrl })
      : signer.walletClient.writeContract({
          address: intent.exec.poolAddress,
          abi: POOL_TRANSFER_ABI,
          functionName: "transfer",
          args: transferCallArgs(intent),
        });
  const payHash = await submit(payment.intent);
  const receipt = await signer.publicClient.waitForTransactionReceipt({ hash: payHash });
  if (receipt.status !== "success") throw new Error(`transfer reverted (${payHash})`);
  if (relayUrl) {
    const hidden = receipt.from.toLowerCase() !== signer.account.address.toLowerCase();
    console.log(`     submitted by the Gloam relay ${receipt.from} (agent wallet hidden: ${hidden})`);
  }
  payment.payload.payload.txHash = payHash;
  console.log(`     paid. tx ${net.explorer}/tx/${payHash}`);
  console.log(`     payment note sealed to the payee: ${payment.sealed}\n`);

  console.log("5/6  Payee: open the payment, verify it, sweep it into a fresh note...");
  const settled = await settleGloamPayment({
    requirements: req,
    payload: payment.payload,
    receiveKey: payee,
    prove: artifactProver(tArt),
    chain: sweepChainFromClient(signer.publicClient, { pool: net.pool, fromBlock: net.deployBlock }),
    submit,
  });
  if (!settled.grantAccess) throw new Error(`payee did not settle: ${settled.status} (${settled.reason})`);
  console.log(`     swept. tx ${net.explorer}/tx/${settled.sweep?.hash}`);
  console.log(`     final: ${settled.final}. The payer can no longer spend this payment back.\n`);

  console.log("6/6  Result");
  console.log(`     payee holds ${PAY_AMT} PathUSD in a note only it knows (${settled.freshNote?.commitment})`);
  console.log(`     agent change note (remaining balance): ${payment.changeNote.amountWei} base units`);
  console.log(
    "\nDone. The public feed shows three shielded transactions and nothing else: not the amount, not the parties. Only the payee could open the payment note, and it moved the money before serving.\n"
  );
}

main().catch((e) => {
  console.error("\nDemo failed:", e instanceof Error ? e.message : e);
  process.exit(1);
});
