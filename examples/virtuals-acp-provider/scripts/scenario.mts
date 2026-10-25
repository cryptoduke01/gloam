/**
 * The private payout job, end to end, on a local fork:
 *
 *   1. A provider agent holds a private float in Gloam.
 *   2. A client agent creates a fund-transfer job on Virtuals' real ACP
 *      contract, with the payout list sealed to the provider and replyTo set
 *      to its own Gloam address.
 *   3. The provider quotes (payout total by fund transfer, fee in escrow), the
 *      client funds, the provider pays each recipient privately and submits the
 *      deliverable sealed to the client, and the escrow pays the fee.
 *   4. The client opens the deliverable and checks every proof (each shows a
 *      private payment of the right amount was made, not who received it);
 *      one recipient picks up its payment by Gloam address, another claims a
 *      claim link.
 *   5. The provider adds what reached its wallet to its private balance, in a
 *      round amount, where the token is one the Gloam vault takes.
 *   6. A plain escrow job with no evaluator is refused, and a client that
 *      rejects a funded job gets its fee back from the escrow and its principal
 *      back from the provider, with no payout made.
 *
 * Fresh keys for every run, funded inside the fork; every transaction is
 * self-sent and lands only in the fork.
 */
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createWalletClient, encodeFunctionData, formatUnits, http, parseEventLogs, parseUnits, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { GloamAgent, shutdownProver, type LimitsConfig } from "@gloamtrade/game-plugin-gloam";
// The plugin's fork harness (anvil, fresh keys, impersonated funding).
import { ERC20, startFork, type Fork } from "../../../packages/game-plugin-gloam/test/fork/harness.mts";
import { ACP_ABI, ACP_CONTRACTS, assetToken } from "../src/acp.js";
import { EarningsSweeper, type SweepOutcome } from "../src/earnings.js";
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
  feeBudget: string;
  principalToProvider: string;
  escrowPaidProvider: string;
  payouts: PayoutResult[];
  proofsOk: boolean[];
  recipientReceived: string | null;
  claimed: string | null;
  earnings: SweepOutcome | null;
  deliverableSealed: boolean;
  backendSaw: string;
  transferLogFields: string[][];
  publicTxs: { what: string; hash: string }[];
  /** A plain escrow job with no evaluator: refused before any budget. */
  refusedJob: { jobId: string; reason: string; onChain: boolean; detail: string } | null;
  /** A client that rejects a funded job. */
  rejectedAfterFunding: { jobId: string; acpStatus: number; payoutsMade: number; clientNetChange: string; journal: string } | null;
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
    const sameToken = acp.paymentToken.toLowerCase() === asset.address.toLowerCase();
    const bal = (token: Address, who: Address) => fork.client.readContract({ address: token, abi: ERC20, functionName: "balanceOf", args: [who] });

    // Fund: the provider's float, and the client's payouts in the Gloam asset; the client's fees in ACP's token.
    await fork.sendFromHolder(asset.address, HOLDERS[args.network]!, providerKey.address, parseUnits("60", asset.decimals));
    await fork.sendFromHolder(asset.address, HOLDERS[args.network]!, clientKey.address, parseUnits("50", asset.decimals));
    if (!sameToken) {
      // Base Sepolia: Virtuals' test token keeps balances in a plain mapping at slot 0.
      await fork.setTokenBalance(acp.paymentToken, 0, clientKey.address, parseUnits("50", 6));
    }
    log(`provider ${providerKey.address}: 60 ${asset.symbol}; client ${clientKey.address}: 50 ${asset.symbol}${sameToken ? "" : ` and 50 ${acp.tokenName} for ACP fees`}`);

    const float = await provider.add({ amount: "40", asset: asset.symbol, label: "payout float" });
    if (float.status !== "done") throw new Error(`float: ${JSON.stringify(float)}`);
    log(`provider added 40 ${asset.symbol} to its private float (${float.hash})`);

    const platformFee = Number(await fork.client.readContract({ address: acp.acp, abi: ACP_ABI, functionName: "platformFeeBP" }));
    const evaluatorFee = Number(await fork.client.readContract({ address: acp.acp, abi: ACP_ABI, functionName: "evaluatorFeeBP" }));
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
      // The client is its own evaluator: it opens the deliverable and completes only if every proof checks out.
      // A proof shows a private payment of that amount was made; who received it, only the recipient can confirm.
      evaluate: async (_jobId, deliverable) => {
        const outer = JSON.parse(deliverable) as { sealed?: string };
        const inner = JSON.parse(outer.sealed ? await client.openSealed(outer.sealed) : deliverable) as { payouts: PayoutResult[] };
        for (const p of inner.payouts) if (!p.proof || !(await client.verifyProof(p.proof)).ok) return false;
        return inner.payouts.length > 0;
      },
      log,
    });
    // Keep the 20 left over from funding public, so only what ACP brought in is added.
    const earnings = new EarningsSweeper({ wallet: provider, tokens: [acp.paymentToken, asset.address], minBatch: "5", roundTo: "1", keepPublic: "20" });
    let earningsResult: SweepOutcome | null = null;
    const providerWallet = createWalletClient({
      account: privateKeyToAccount(providerKey.key),
      chain: { id: chainId, name: "fork", nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 }, rpcUrls: { default: { http: [fork.url] } } },
      transport: http(fork.url),
    });
    const service = new PrivatePayoutProvider({
      wallet: provider,
      budgetToken: (raw) => assetToken(acp.paymentToken, acp.tokenName, 6, raw),
      // Virtuals' cut, plus the evaluator's when the job has one (here the client evaluates, so that part goes back to it).
      acpFeeBps: (session) => platformFee + (session.job && session.job.evaluatorAddress !== "0x0000000000000000000000000000000000000000" ? evaluatorFee : 0),
      // The hash once broadcast (a refund that threw is tried again, so it throws only when nothing was sent).
      refund: async (to, token, raw) => {
        const hash = await providerWallet.sendTransaction({ to: token, data: encodeFunctionData({ abi: ERC20, functionName: "transfer", args: [to, raw] }) });
        await fork.client.waitForTransactionReceipt({ hash }).catch(() => undefined);
        return hash;
      },
      earnings: {
        sweep: async (run?: Parameters<EarningsSweeper["sweep"]>[0]) => {
          earningsResult = await earnings.sweep(run);
          return earningsResult;
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
    const acpTxs = room.txs.get(jobId) ?? [];
    publicTxs.push(...acpTxs.map((t) => ({ what: `ACP ${t.what}`, hash: t.hash })));
    // The public token movements to the provider, read from the fund and submit transactions.
    const TRANSFER = [
      { type: "event", name: "Transfer", inputs: [{ name: "from", type: "address", indexed: true }, { name: "to", type: "address", indexed: true }, { name: "value", type: "uint256", indexed: false }] },
    ] as const;
    const toProvider = async (hash: Hex | undefined, token: Address) => {
      if (!hash) return 0n;
      const receipt = await fork.client.getTransactionReceipt({ hash });
      return parseEventLogs({ abi: TRANSFER, logs: receipt.logs.filter((l) => l.address.toLowerCase() === token.toLowerCase()) })
        .filter((t) => t.args.to.toLowerCase() === providerKey.address.toLowerCase())
        .reduce((s, t) => s + t.args.value, 0n);
    };
    const principal = await toProvider(acpTxs.find((t) => t.what.startsWith("fund"))?.hash, asset.address);
    const escrowPaid = await toProvider(acpTxs.find((t) => t.what.startsWith("complete"))?.hash, acp.paymentToken);
    log(`ACP job ${jobId}: on-chain status ${job[1]} (3 = completed); ${formatUnits(principal, asset.decimals)} ${asset.symbol} reached the provider at funding; the escrow paid it ${formatUnits(escrowPaid, 6)} ${acp.tokenName}`);

    // The client opens the sealed deliverable and checks each proof.
    const text = room.deliverables.get(jobId) ?? "";
    const outer = JSON.parse(text) as { type: string; sealed?: string };
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
      const c = await r2.claim(await client.openSealed(sealedLink));
      claimed = `${c.amount} (${c.result})`;
      log(`recipient 2 claimed ${claimed} from the claim link the client passed on`);
    }

    // What a watcher sees of a payout: a Transferred event with a nullifier and two commitments.
    const transferLogFields: string[][] = [];
    for (const p of inner.payouts) {
      if (!p.tx) continue;
      const receipt = await fork.client.getTransactionReceipt({ hash: p.tx as Hex });
      const logs = parseEventLogs({
        abi: [{ type: "event", name: "Transferred", inputs: [{ name: "nullifier", type: "bytes32", indexed: true }, { name: "newCommitments", type: "bytes32[2]", indexed: false }] }] as const,
        logs: receipt.logs,
      });
      for (const l of logs) transferLogFields.push(Object.keys(l.args));
      publicTxs.push({ what: `Gloam payout to ${p.to}: a shielded transfer`, hash: p.tx });
    }

    // A plain escrow job (no fund transfer) with no evaluator: refused before any budget, as every job with no evaluator is.
    const refusedId = await room.clientCreateJob({ description: OFFERING_NAME, requirement, fundTransfer: false, expiresInSeconds: 3600 });
    await room.settle();
    const rej = room.rejections.get(refusedId) ?? null;

    // A client that rejects a funded job: the escrow gives the fee back, the provider the principal.
    const before = { fee: await bal(acp.paymentToken, clientKey.address), principal: await bal(asset.address, clientKey.address) };
    const attackId = await room.clientCreateJob({ description: OFFERING_NAME, requirement, rejectAfterFunding: true, expiresInSeconds: 3600 });
    await room.settle();
    const attackJob = (await fork.client.readContract({ address: acp.acp, abi: ACP_ABI, functionName: "jobs", args: [BigInt(attackId)] })) as readonly unknown[];
    const journal = service.status(chainId, attackId);
    const feeDelta = (await bal(acp.paymentToken, clientKey.address)) - before.fee;
    const principalDelta = (await bal(asset.address, clientKey.address)) - before.principal;
    const rejectedAfterFunding = {
      jobId: attackId,
      acpStatus: Number(attackJob[1]),
      payoutsMade: journal?.results.filter((r) => r.status === "paid").length ?? 0,
      clientNetChange: sameToken
        ? `${formatUnits(principalDelta, asset.decimals)} ${asset.symbol}`
        : `${formatUnits(principalDelta, asset.decimals)} ${asset.symbol}, ${formatUnits(feeDelta, 6)} ${acp.tokenName}`,
      journal: `${journal?.state}${journal?.refundTx ? `, principal sent back in ${journal.refundTx}` : journal?.refundOwed ? `, ${journal.refundOwed} owed` : ""}`,
    };
    log(`ACP job ${attackId}: the client rejected it after funding; payouts made ${rejectedAfterFunding.payoutsMade}; client's net change ${rejectedAfterFunding.clientNetChange}; ${rejectedAfterFunding.journal}`);

    return {
      network: args.network,
      jobId,
      acpStatus: Number(job[1]),
      feeBudget: formatUnits(job[6] as bigint, 6),
      principalToProvider: formatUnits(principal, asset.decimals),
      escrowPaidProvider: formatUnits(escrowPaid, 6),
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
      rejectedAfterFunding,
    };
  } finally {
    await shutdownProver();
    await fork.stop();
  }
}
