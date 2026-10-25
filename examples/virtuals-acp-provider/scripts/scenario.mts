/**
 * The private payout job, end to end, on a local fork:
 *
 *   1. A provider agent holds a private float in Gloam.
 *   2. A client agent creates an ACP job on Virtuals' real ACP contract, with
 *      the payout list sealed to the provider and replyTo set to its own
 *      Gloam address.
 *   3. The provider quotes, the client funds the escrow, the provider pays
 *      each recipient privately and submits the deliverable (sealed to the
 *      client), and the escrow pays the provider.
 *   4. The client opens the deliverable and checks every proof; one recipient
 *      picks up its payment by Gloam address, another claims a claim link.
 *   5. The provider adds its ACP earnings to its private balance, where the
 *      chain's ACP token is one the Gloam vault takes.
 *
 * Fresh keys for every run, funded inside the fork; every transaction is
 * self-sent and lands only in the fork.
 */
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { formatUnits, parseEventLogs, parseUnits, type Address, type Hex } from "viem";
import { GloamAgent, shutdownProver, type LimitsConfig } from "@gloamtrade/game-plugin-gloam";
// The plugin's fork harness (anvil, fresh keys, impersonated funding).
import { startFork, type Fork } from "../../../packages/game-plugin-gloam/test/fork/harness.mts";
import { ACP_ABI, ACP_CONTRACTS, assetToken } from "../src/acp.js";
import { EarningsSweeper } from "../src/earnings.js";
import { ForkAcpRoom } from "../src/forkRoom.js";
import { OFFERING_NAME, buildPayoutRequirement } from "../src/offering.js";
import { DELIVERABLE_TYPE, PrivatePayoutProvider, type PayoutResult } from "../src/provider.js";

const here = dirname(fileURLToPath(import.meta.url));
const CIRCUITS = join(here, "..", "..", "..", "app", "public", "circuits");

/** Holders impersonated inside the fork only, to fund the fresh keys. */
const HOLDERS: Record<string, Address> = {
  base: "0xfaec9cdc3ef75713b48f46057b98ba04885e3391", // Circle's test USDC on Base Sepolia
  "robinhood-mainnet": "0xf70da97812cb96acdf810712aa562db8dfa3dbef", // USDG on Robinhood Chain
};

const CHAIN_IDS: Record<string, number> = { base: 84532, "robinhood-mainnet": 4663 };

export interface ScenarioReport {
  network: string;
  jobId: string;
  acpStatus: number;
  quoteBudget: string;
  providerEscrowIncome: string;
  payouts: PayoutResult[];
  proofsOk: boolean[];
  recipientReceived: string | null;
  claimed: string | null;
  earnings: Record<string, unknown> | null;
  deliverableSealed: boolean;
  backendSaw: string;
  transferLogFields: string[][];
  publicTxs: { what: string; hash: string }[];
  /** A second job with an evaluator the provider does not trust: refused before any budget. */
  refusedJob: { jobId: string; reason: string; onChain: boolean; detail: string } | null;
}

export async function runScenario(args: { network: "base" | "robinhood-mainnet"; upstream: string; log?: (m: string) => void }): Promise<ScenarioReport> {
  const log = args.log ?? ((m: string) => console.log(m));
  const chainId = CHAIN_IDS[args.network]!;
  const acp = ACP_CONTRACTS[chainId]!;
  const fork: Fork = await startFork({ upstream: args.upstream, chainId, log });
  const publicTxs: { what: string; hash: string }[] = [];
  try {
    const providerKey = await fork.newKey();
    const clientKey = await fork.newKey();
    const r1Key = await fork.newKey();
    const r2Key = await fork.newKey();

    const make = (name: string, key: Hex, limits?: LimitsConfig) => {
      const dir = mkdtempSync(join(tmpdir(), `gloam-acp-${name}-`));
      return new GloamAgent({
        network: args.network,
        rpc: fork.url,
        submit: "wallet",
        agentId: name,
        dataDir: dir,
        env: { GLOAM_AGENT_PRIVATE_KEY: key, GLOAM_NOTE_STORE: join(dir, "notes.json") },
        artifacts: { dir: CIRCUITS, url: "http://127.0.0.1:1/never" },
        limits: limits ?? { recipients: "any", assets: { [args.network === "base" ? "USDC" : "USDG"]: { maxPerPayment: "25", maxPerDay: "100" } } },
      });
    };
    const provider = make("provider", providerKey.key);
    const client = make("client", clientKey.key);
    const r1 = make("recipient-1", r1Key.key);
    const r2 = make("recipient-2", r2Key.key);
    const asset = provider.network.assets[0]!;

    // Fund: the provider's float in the Gloam asset; the client's ACP budget in ACP's token.
    await fork.sendFromHolder(asset.address, HOLDERS[args.network]!, providerKey.address, parseUnits("60", asset.decimals));
    if (args.network === "base") {
      // Virtuals' test token keeps balances in a plain mapping at slot 0.
      await fork.setTokenBalance(acp.paymentToken, 0, clientKey.address, parseUnits("50", 6));
    } else {
      await fork.sendFromHolder(acp.paymentToken, HOLDERS[args.network]!, clientKey.address, parseUnits("50", 6));
    }
    log(`provider ${providerKey.address}: 60 ${asset.symbol}; client ${clientKey.address}: 50 ${acp.tokenName} for ACP`);

    const float = await provider.add({ amount: "40", asset: asset.symbol, label: "payout float" });
    if (float.status !== "done") throw new Error(`float: ${JSON.stringify(float)}`);
    log(`provider added 40 ${asset.symbol} to its private float (${float.hash})`);

    const platformFee = Number(await fork.client.readContract({ address: acp.acp, abi: ACP_ABI, functionName: "platformFeeBP" }));
    const room = new ForkAcpRoom({
      client: fork.client,
      rpc: fork.url,
      chainId,
      acp: acp.acp,
      paymentToken: acp.paymentToken,
      tokenSymbol: acp.tokenName,
      tokenDecimals: 6,
      providerKey: providerKey.key,
      clientKey: clientKey.key,
      log,
    });
    // Keep the 20 left over from funding public, so only the escrow's payment is added.
    const earnings = new EarningsSweeper({ wallet: provider, acpPaymentToken: acp.paymentToken, minBatch: "5", roundTo: "1", keepPublic: "20" });
    let earningsResult: Record<string, unknown> | null = null;
    const service = new PrivatePayoutProvider({
      wallet: provider,
      budgetToken: (raw) => assetToken(acp.paymentToken, acp.tokenName, 6, raw),
      acpFeeBps: () => platformFee,
      earnings: {
        sweep: async () => {
          const r = await earnings.sweep();
          earningsResult = r;
          return r;
        },
      } as unknown as EarningsSweeper,
      log: (m) => log(`[provider] ${m}`),
    });
    room.on("entry", (s, e) => service.onEntry(s, e));

    // The client: payouts sealed to the provider, the deliverable to be sealed to the client.
    const providerTag = await provider.address();
    const clientTag = await client.address();
    const r1Tag = await r1.address();
    const requirement = await buildPayoutRequirement({
      payouts: [
        { to: r1Tag, amount: "7", note: "march retainer" },
        { to: "claim-link", amount: "3", note: "bounty" },
      ],
      providerAddress: providerTag,
      replyTo: clientTag,
    });
    const jobId = await room.clientCreateJob({ description: OFFERING_NAME, requirement, expiresInSeconds: 3600 });
    await room.settle();

    const job = (await fork.client.readContract({ address: acp.acp, abi: ACP_ABI, functionName: "jobs", args: [BigInt(jobId)] })) as readonly unknown[];
    // What the escrow paid the provider: the token transfer to it in the submit transaction.
    const acpTxs = room.txs.get(jobId) ?? [];
    publicTxs.push(...acpTxs.map((t) => ({ what: `ACP ${t.what}`, hash: t.hash })));
    let income = 0n;
    const submit = acpTxs.find((t) => t.what.startsWith("submit"));
    if (submit) {
      const receipt = await fork.client.getTransactionReceipt({ hash: submit.hash });
      const transfers = parseEventLogs({
        abi: [{ type: "event", name: "Transfer", inputs: [{ name: "from", type: "address", indexed: true }, { name: "to", type: "address", indexed: true }, { name: "value", type: "uint256", indexed: false }] }] as const,
        logs: receipt.logs.filter((l) => l.address.toLowerCase() === acp.paymentToken.toLowerCase()),
      });
      for (const t of transfers) if (t.args.to.toLowerCase() === providerKey.address.toLowerCase()) income += t.args.value;
    }
    log(`ACP job ${jobId}: on-chain status ${job[1]} (3 = completed); budget ${formatUnits(job[6] as bigint, 6)}; the escrow paid the provider ${formatUnits(income, 6)} ${acp.tokenName}`);

    // The client opens the sealed deliverable and checks each proof.
    const text = room.deliverables.get(jobId) ?? "";
    const outer = JSON.parse(text) as { type: string; sealed?: string; summary?: unknown };
    if (outer.type !== DELIVERABLE_TYPE) throw new Error("unexpected deliverable");
    const inner = JSON.parse(outer.sealed ? await client.openSealed(outer.sealed) : text) as { payouts: PayoutResult[] };
    const proofsOk: boolean[] = [];
    for (const p of inner.payouts) {
      const v = p.proof ? await client.verifyProof(p.proof) : null;
      proofsOk.push(Boolean(v?.ok));
      log(`client checks payout to ${p.to} (${p.amount}): ${p.status}, proof ${v?.ok ? "checks out" : "missing or failing"}`);
    }

    // Recipient 1 picks up its payment by Gloam address; recipient 2 gets the claim link from the client.
    const got = (await r1.checkIncoming()).received as { amount: string; status: string; note: string }[];
    const recipientReceived = got[0] ? `${got[0].amount} (${got[0].status}, note "${got[0].note}")` : null;
    log(`recipient 1 picked up ${recipientReceived}`);
    let claimed: string | null = null;
    const sealedLink = inner.payouts.find((p) => p.sealedClaimLink)?.sealedClaimLink;
    if (sealedLink) {
      const link = await client.openSealed(sealedLink);
      const c = await r2.claim(link);
      claimed = `${c.amount} (${c.result})`;
      log(`recipient 2 claimed ${claimed} from the claim link the client passed on`);
    }

    // What a watcher sees of a payout: the Transferred event, a nullifier and two commitments.
    const transferLogFields: string[][] = [];
    for (const p of inner.payouts) {
      if (!p.tx) continue;
      const receipt = await fork.client.getTransactionReceipt({ hash: p.tx as Hex });
      const logs = parseEventLogs({
        abi: [{ type: "event", name: "Transferred", inputs: [{ name: "nullifier", type: "bytes32", indexed: true }, { name: "newCommitments", type: "bytes32[2]", indexed: false }] }] as const,
        logs: receipt.logs,
      });
      for (const l of logs) transferLogFields.push(Object.keys(l.args));
      publicTxs.push({ what: `payout to ${p.to}: a shielded transfer`, hash: p.tx });
    }

    // A job the provider refuses before anything is committed: an evaluator it does not trust.
    const refusedId = await room.clientCreateJob({ description: OFFERING_NAME, requirement, evaluator: "0x000000000000000000000000000000000000dEaD", expiresInSeconds: 3600 });
    await room.settle();
    const rej = room.rejections.get(refusedId) ?? null;

    await shutdownProver();
    return {
      network: args.network,
      jobId,
      acpStatus: Number(job[1]),
      quoteBudget: formatUnits(job[6] as bigint, 6),
      providerEscrowIncome: formatUnits(income, 6),
      payouts: inner.payouts,
      proofsOk,
      recipientReceived,
      claimed,
      earnings: earningsResult,
      deliverableSealed: Boolean(outer.sealed),
      backendSaw: text.length > 160 ? `${text.slice(0, 160)}…` : text,
      transferLogFields,
      publicTxs,
      refusedJob: rej ? { jobId: refusedId, ...rej } : null,
    };
  } finally {
    await shutdownProver();
    await fork.stop();
  }
}
