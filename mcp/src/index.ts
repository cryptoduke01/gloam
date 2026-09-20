#!/usr/bin/env node
/**
 * Gloam MCP server.
 *
 * Gives an AI agent private execution tools across Gloam's networks: private
 * stablecoin payments on Tempo and private trading on Robinhood Chain. The x402
 * payment tools target either network (pass `network`), so an agent can settle a
 * 402 challenge privately in PathUSD on Tempo or in the RH asset on Robinhood.
 *
 * This exposes read + planning tools that work today, and returns honest
 * "intent" objects for write actions (shield / pay / send) that need a connected
 * agent wallet with signing. It never fakes a private fill or settlement.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { isAddress, parseEther, parseUnits, type Address, type Hex } from "viem";
import {
  buildShieldBoundIntent,
  artifactProver,
  SEALED_VAULT,
  NATIVE_ASSET,
  buildGloamPaymentRequirements,
  buildGloamPayment,
  verifyGloamPayment,
  verifyPaymentNoteBinding,
  encodeRequirements,
  decodeRequirements,
  decodePaymentHeader,
  decodePaymentNote,
  syncTree,
  noteCommitmentPoseidon,
  fieldToHex,
  GLOAM_VS_ZONE,
  GLOAM_NETWORKS,
} from "@gloamtrade/sdk";
import { CHAIN, MARKETS, PRIVACY_STATUS, findMarket } from "./data.js";
import { getSigner } from "./signer.js";
import { shieldArtifacts, transferArtifacts } from "./artifacts.js";
import { networkByKey, networkByChainId, MCP_NETWORKS } from "./networks.js";

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
  {
    type: "function",
    name: "allowance",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
    ],
    outputs: [{ type: "uint256" }],
  },
] as const;

const server = new McpServer({ name: "gloam", version: "0.1.0" });

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

function text(value: unknown) {
  return {
    content: [
      {
        type: "text" as const,
        text:
          typeof value === "string" ? value : JSON.stringify(value, null, 2),
      },
    ],
  };
}

server.registerTool(
  "gloam_info",
  {
    title: "About Gloam",
    description:
      "What Gloam is and what an agent can do with it. Call this first to understand the private-trading tools available.",
  },
  async () =>
    text({
      what: "Gloam is private trading on Robinhood Chain. Hold, send, and trade stocks and crypto without broadcasting size or strategy to the public chain.",
      whyAgentsCareMost:
        "Agents run predictable, high-frequency strategies. On a public chain every move is copyable and front-runnable. Gloam keeps an agent's positions and size private.",
      chain: CHAIN,
      tools: [
        "gloam_privacy_status: honest privacy posture, what is public vs private (read)",
        "gloam_list_markets: tradable markets and marks (read)",
        "gloam_quote: indicative quote and what stays private (read)",
        "gloam_plan_private_trade: build a private-trade intent, no execution (planning)",
        "gloam_plan_shield: describe a shield before executing (planning)",
        "gloam_execute_shield: REAL private deposit — mints a note, proves, and broadcasts shieldBound (execution; needs a signer)",
        "gloam_execute_transfer: sign and broadcast a public testnet transfer (execution; needs a signer)",
        "gloam_payment_requirements: price an agent resource in a private x402 payment (server side)",
        "gloam_pay_x402: plan the self-custodial private payment for a 402 challenge (agent side)",
        "gloam_execute_private_pay: REAL private x402 settlement from a held note — sync, prove, broadcast transfer (execution; needs a signer)",
        "gloam_verify_payment: verify a presented x402 private payment, list the on-chain settlement checks (server side)",
      ],
      privatePayments:
        "x402 agent payments settle privately through the Gloam pool. Unlike a Tempo Zone, there is no operator that sees the transaction: it is private from the public and self-custodial, with optional per-payment compliance disclosure.",
    })
);

server.registerTool(
  "gloam_privacy_status",
  {
    title: "Privacy status",
    description:
      "Honest, current privacy posture: what is live, what is not, and how strong the anonymity set is. Agents should check this before assuming a trade is fully private.",
  },
  async () => text(PRIVACY_STATUS)
);

server.registerTool(
  "gloam_list_markets",
  {
    title: "List markets",
    description:
      "List the markets an agent can trade privately on Gloam, with indicative testnet marks.",
    inputSchema: {
      kind: z
        .enum(["stock", "crypto", "all"])
        .default("all")
        .describe("Filter by asset kind."),
    },
  },
  async ({ kind }) => {
    const list = kind === "all" ? MARKETS : MARKETS.filter((m) => m.kind === kind);
    return text({
      count: list.length,
      note: "Marks are indicative testnet values.",
      markets: list,
    });
  }
);

server.registerTool(
  "gloam_quote",
  {
    title: "Quote a private trade",
    description:
      "Indicative quote for buying or selling a market, plus exactly what stays private and what becomes public.",
    inputSchema: {
      market: z.string().describe("Symbol or id, e.g. TSLA or eth."),
      side: z.enum(["buy", "sell"]),
      usd: z.number().positive().describe("Trade size in USD."),
    },
  },
  async ({ market, side, usd }) => {
    const m = findMarket(market);
    if (!m) {
      return text({
        error: `Unknown market "${market}". Call gloam_list_markets.`,
      });
    }
    const units = usd / m.mark;
    return text({
      market: m.symbol,
      side,
      usd,
      estimatedUnits: Number(units.toFixed(6)),
      markUsd: m.mark,
      staysPrivate: ["your size", "your position", "who you are"],
      becomesPublic: ["only that a private trade occurred, not the amount"],
      note: "Indicative only. Size privacy depends on the current anonymity set (see gloam_privacy_status).",
    });
  }
);

const AGENT_WALLET_NOTE =
  "This build does not sign or broadcast. Connect an agent wallet with signing (e.g. Turnkey embedded wallet + policy) to execute this intent. Returned as a plan an agent or human can approve.";

server.registerTool(
  "gloam_plan_private_trade",
  {
    title: "Plan a private trade",
    description:
      "Build a private-trade intent (does not execute). Returns the exact action a connected agent wallet would sign.",
    inputSchema: {
      market: z.string().describe("Symbol or id, e.g. TSLA."),
      side: z.enum(["buy", "sell"]),
      usd: z.number().positive(),
      agentAddress: z
        .string()
        .optional()
        .describe("The agent wallet address that would own the private position."),
    },
  },
  async ({ market, side, usd, agentAddress }) => {
    const m = findMarket(market);
    if (!m) {
      return text({ error: `Unknown market "${market}". Call gloam_list_markets.` });
    }
    return text({
      intent: "private_trade",
      chainId: CHAIN.chainId,
      market: m.symbol,
      side,
      usd,
      estimatedUnits: Number((usd / m.mark).toFixed(6)),
      agentAddress: agentAddress ?? null,
      privacy: "Size and position stay off the public chain.",
      execution: AGENT_WALLET_NOTE,
    });
  }
);

server.registerTool(
  "gloam_plan_shield",
  {
    title: "Plan a shield (deposit to private)",
    description:
      "Build an intent to move funds into a private balance (shield), the first step before private trading or sending.",
    inputSchema: {
      asset: z.string().default("ETH").describe("Asset to shield, e.g. ETH or TSLA."),
      usd: z.number().positive().describe("Amount to shield, in USD."),
      agentAddress: z.string().optional(),
    },
  },
  async ({ asset, usd, agentAddress }) =>
    text({
      intent: "shield",
      chainId: CHAIN.chainId,
      asset: asset.toUpperCase(),
      usd,
      agentAddress: agentAddress ?? null,
      result: "Funds enter a private balance. The public chain loses the trail.",
      execution: AGENT_WALLET_NOTE,
    })
);

server.registerTool(
  "gloam_execute_shield",
  {
    title: "Execute a private shield",
    description:
      "Deposit into a PRIVATE balance on the chosen Gloam network. Mints a note, generates the Groth16 shield proof server-side, and broadcasts shieldBound() (approving the ERC-20 first when the asset is a token, e.g. PathUSD on Tempo). The agent ends up holding a shielded balance only it can spend. Requires GLOAM_AGENT_PRIVATE_KEY; without it, returns a plan. The returned note secret is the ONLY authority to spend the balance later, so the agent must persist it.",
    inputSchema: {
      amount: z
        .number()
        .positive()
        .describe("Amount to shield into a private balance, in the asset's units (e.g. PathUSD on Tempo, ETH on Robinhood)."),
      network: z
        .enum(["robinhood", "tempo"])
        .default("robinhood")
        .describe("Which network to shield on. Tempo shields the PathUSD stablecoin; Robinhood shields native ETH by default."),
      asset: z
        .string()
        .optional()
        .describe("ERC-20 token address to shield; omit to use the network default (PathUSD on Tempo, native ETH on Robinhood)."),
      decimals: z
        .number()
        .int()
        .optional()
        .describe("Decimals of the asset; omit to use the network default (6 for PathUSD, 18 for ETH)."),
    },
  },
  async ({ amount, network, asset, decimals }) => {
    if (asset !== undefined && !isAddress(asset)) {
      return text({ status: "error", error: `"${asset}" is not a valid token address.` });
    }
    const net = networkByKey(network);
    const assetAddr = (asset as Address | undefined) ?? net.defaultAsset;
    const dec = decimals ?? (asset ? 18 : net.defaultAssetDecimals);
    const amountWei = parseUnits(String(amount), dec);
    const isNative = assetAddr.toLowerCase() === NATIVE_ASSET.toLowerCase();
    const signer = getSigner(net);
    if (!signer) {
      return text({
        status: "no_signer",
        plan: { action: "shield", amount, asset: assetAddr, network: net.key, chainId: net.chainId, pool: net.pool },
        message:
          "No signer configured. Set GLOAM_AGENT_PRIVATE_KEY (testnet) to execute, or wire a Turnkey server wallet with policy for production.",
      });
    }
    try {
      const { wasm, zkey } = await shieldArtifacts();
      const intent = await buildShieldBoundIntent({
        amountWei,
        asset: assetAddr,
        poolAddress: net.pool,
        prover: artifactProver({ wasm, zkey }),
      });
      // ERC-20 shields (e.g. PathUSD on Tempo) approve the pool to pull the
      // tokens before shieldBound; native shields carry value instead.
      let approveHash: `0x${string}` | undefined;
      if (!isNative) {
        approveHash = await signer.walletClient.writeContract({
          address: assetAddr,
          abi: erc20Abi,
          functionName: "approve",
          args: [net.pool, amountWei],
        });
        await signer.publicClient.waitForTransactionReceipt({ hash: approveHash });
      }
      const hash = await signer.walletClient.writeContract({
        address: intent.exec.poolAddress,
        abi: shieldPoolAbi,
        functionName: "shieldBound",
        args: intent.exec.args as readonly [Address, bigint, Hex, Hex],
        value: intent.exec.valueWei,
      });
      return text({
        status: "submitted",
        network: net.key,
        approveHash,
        hash,
        from: signer.account.address,
        explorer: `${net.explorer}/tx/${hash}`,
        note: {
          commitment: intent.note.commitment,
          secret: intent.note.secret,
          amountWei: amountWei.toString(),
          asset: assetAddr,
          decimals: dec,
        },
        persist:
          "Store note.secret and note.amountWei. They are the only authority to spend this private balance; losing them loses the funds.",
        privacy:
          "The deposit amount is public. The note hides who can spend it, so future private sends are unlinkable to this deposit.",
      });
    } catch (err) {
      return text({
        status: "error",
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
);

server.registerTool(
  "gloam_execute_transfer",
  {
    title: "Execute a transfer (public)",
    description:
      "Send testnet ETH publicly on Robinhood Chain from the agent wallet. This is the PUBLIC rail (amount and recipient are visible), useful for funding. For private movement, use gloam_execute_shield. Requires GLOAM_AGENT_PRIVATE_KEY; without it, returns a plan only.",
    inputSchema: {
      to: z.string().describe("Recipient 0x address."),
      eth: z.number().positive().describe("Amount of testnet ETH to send."),
    },
  },
  async ({ to, eth }) => {
    if (!isAddress(to)) {
      return text({ status: "error", error: `"${to}" is not a valid address.` });
    }
    const signer = getSigner();
    if (!signer) {
      return text({
        status: "no_signer",
        plan: { action: "transfer", to, eth, chainId: CHAIN.chainId },
        message:
          "No signer configured. Set GLOAM_AGENT_PRIVATE_KEY (testnet) to let the agent execute, or wire a Turnkey server wallet with policy for production.",
      });
    }
    try {
      const hash = await signer.walletClient.sendTransaction({
        to: to as Address,
        value: parseEther(String(eth)),
      });
      return text({
        status: "submitted",
        hash,
        from: signer.account.address,
        explorer: `${CHAIN.explorer}/tx/${hash}`,
      });
    } catch (err) {
      return text({
        status: "error",
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
);

// ── x402 private agent payments ───────────────────────────────────────────────

server.registerTool(
  "gloam_payment_requirements",
  {
    title: "Price a resource in private payments (x402)",
    description:
      "SERVER side. Build the HTTP 402 payment requirements an agent-paid resource returns, priced in a private Gloam settlement. This is the MCPay pattern (x402 + stablecoins) but the settlement is private: the amount and parties never go public. Returns the requirements object and its encoded form to put in a 402 response.",
    inputSchema: {
      amount: z.number().positive().describe("Price in the asset's display units, e.g. 0.25."),
      decimals: z.number().int().min(0).max(36).default(18).describe("Decimals of the settlement asset."),
      assetSymbol: z.string().default("ETH").describe("Asset label, e.g. USD on Tempo or ETH on Robinhood testnet."),
      asset: z.string().optional().describe("Settlement token address; omit for the chain's native unit."),
      payTo: z.string().describe("Payee identity the payment note is directed to (a Gloam receive tag)."),
      resource: z.string().describe("What is being paid for: a URL or an MCP tool id."),
      network: z
        .enum(["robinhood", "tempo"])
        .default("robinhood")
        .describe("Which Gloam network to settle on. Tempo is the stablecoin-payments chain (pay in PathUSD); Robinhood is the equities chain."),
    },
  },
  async ({ amount, decimals, assetSymbol, asset, payTo, resource, network }) => {
    if (asset !== undefined && !isAddress(asset)) {
      return text({ status: "error", error: `"${asset}" is not a valid token address.` });
    }
    const net = GLOAM_NETWORKS[network];
    const req = buildGloamPaymentRequirements({
      amountWei: parseUnits(String(amount), decimals),
      asset: (asset as Address | undefined) ?? NATIVE_ASSET,
      assetSymbol,
      payTo,
      resource,
      network: net.chainId,
      poolAddress: net.pool,
    });
    return text({
      requirements: req,
      encoded: encodeRequirements(req),
      httpHint: "Return HTTP 402 with this requirements object; the agent retries with an X-PAYMENT header.",
      notVsZone: GLOAM_VS_ZONE.oneLine,
    });
  }
);

server.registerTool(
  "gloam_pay_x402",
  {
    title: "Plan a private payment for a 402 challenge",
    description:
      "AGENT side. Given a Gloam 402 challenge, describe the private payment the agent would make: a self-custodial private send of the required amount to the payee, which the agent broadcasts ITSELF (no operator or facilitator holds its key). Returns the plan and the exact SDK call. It does not fake a proof or a settlement: live payment needs a deployed pool on the target network and a shielded note the agent already holds (see remainingPrereqs).",
    inputSchema: {
      requirements: z
        .string()
        .describe("Encoded requirements from gloam_payment_requirements (or the raw JSON)."),
      noteCommitment: z
        .string()
        .optional()
        .describe("Commitment of a shielded note the agent already holds, if known."),
    },
  },
  async ({ requirements, noteCommitment }) => {
    let req;
    try {
      req = decodeRequirements(requirements);
    } catch {
      try {
        req = JSON.parse(requirements);
      } catch {
        return text({ status: "error", error: "Could not parse requirements." });
      }
    }
    const netForReq = Object.values(GLOAM_NETWORKS).find(
      (n) => n.chainId === Number(req.network)
    );
    return text({
      status: "plan",
      intent: "private_pay_x402",
      network: req.network,
      pay: {
        amountWei: req.maxAmountRequired,
        asset: req.asset,
        assetSymbol: req.assetSymbol,
        payTo: req.payTo,
        pool: req.poolAddress,
      },
      poolStatus: netForReq
        ? `Live: pool ${netForReq.pool} on ${netForReq.label} (chain ${netForReq.chainId}).`
        : `Unknown network ${req.network}.`,
      sdkCall:
        "buildGloamPayment({ requirements, senderSecretHex, senderNoteAmountWei, path, prove }) then sign + broadcast the returned exec (transfer), then set payload.txHash.",
      settlement:
        "Self-custodial: the agent signs and broadcasts the shielded transfer itself. The payee opens the payment note to see the amount; the public sees only that a shielded transfer occurred.",
      notVsZone: GLOAM_VS_ZONE,
      sourceNote: noteCommitment ?? null,
      remainingPrereqs: [
        "A shielded note the agent holds in that pool, plus its Merkle path (via syncTree.pathForCommitment).",
        "Transfer circuit artifacts wired into this server's prover (only shield artifacts are wired today).",
      ],
    });
  }
);

server.registerTool(
  "gloam_verify_payment",
  {
    title: "Verify a private payment (x402)",
    description:
      "SERVER side. Structurally verify an X-PAYMENT payload against its requirements: the payment note binds the required amount and asset, and the transfer settles through the right pool and network. Returns the on-chain checks the server must still run (note membership, that the transfer landed, and single-use of its nullifier). Does not assume settlement.",
    inputSchema: {
      requirements: z.string().describe("Encoded requirements (or raw JSON)."),
      payment: z.string().describe("Encoded X-PAYMENT header value (or raw JSON payload)."),
    },
  },
  async ({ requirements, payment }) => {
    let req;
    let pay;
    try {
      req = decodeRequirements(requirements);
    } catch {
      try { req = JSON.parse(requirements); } catch { return text({ status: "error", error: "Could not parse requirements." }); }
    }
    try {
      pay = decodePaymentHeader(payment);
    } catch {
      try { pay = JSON.parse(payment); } catch { return text({ status: "error", error: "Could not parse payment." }); }
    }
    const result = verifyGloamPayment({ requirements: req, payload: pay });
    // Also run the crypto binding check: does the note's claimed amount bind to
    // its commitment? A structural pass alone would trust a lying payer.
    let noteBinds: boolean | null = null;
    if (result.ok) {
      try {
        noteBinds = await verifyPaymentNoteBinding(decodePaymentNote(pay.payload.paymentNote));
      } catch {
        noteBinds = false;
      }
    }
    const ok = result.ok && noteBinds !== false;
    return text({ status: ok ? "verified" : "rejected", noteBinds, ...result });
  }
);

server.registerTool(
  "gloam_execute_private_pay",
  {
    title: "Execute a private payment (x402)",
    description:
      "AGENT side, REAL execution. Settle an x402 payment privately from a note the agent already holds: syncs the pool tree, builds the private send to the payee, generates the Groth16 transfer proof, and broadcasts transfer() server-side. Self-custodial (the agent's own key signs; no operator holds funds). Returns the X-PAYMENT payload plus the payee's payment note. Requires GLOAM_AGENT_PRIVATE_KEY; without it, returns a plan. The change note secret is the agent's remaining balance, so it must persist it.",
    inputSchema: {
      requirements: z.string().describe("Encoded requirements from gloam_payment_requirements (or raw JSON)."),
      noteSecret: z.string().describe("The 0x secret of a note the agent already holds in the pool."),
      noteAmount: z.number().positive().describe("The full amount of that note in the asset's units (its value, not the payment amount)."),
      decimals: z.number().int().optional().describe("Decimals of the note's asset; omit to use the network default (6 for PathUSD, 18 for ETH)."),
      issuerTag: z.string().optional().describe("Optional issuer tag to attach a compliance disclosure."),
    },
  },
  async ({ requirements, noteSecret, noteAmount, decimals, issuerTag }) => {
    let req;
    try {
      req = decodeRequirements(requirements);
    } catch {
      try { req = JSON.parse(requirements); } catch { return text({ status: "error", error: "Could not parse requirements." }); }
    }
    // The requirements name the network to settle on; use it for the signer,
    // tree scan, and explorer so an agent can pay privately on Tempo or Robinhood.
    const net = networkByChainId(Number(req.network)) ?? MCP_NETWORKS.robinhood;
    const signer = getSigner(net);
    if (!signer) {
      return text({
        status: "no_signer",
        plan: { action: "private_pay_x402", network: net.key, pay: req.maxAmountRequired, asset: req.asset, payTo: req.payTo, pool: req.poolAddress },
        message: "No signer configured. Set GLOAM_AGENT_PRIVATE_KEY (testnet) to execute, or wire a Turnkey server wallet with policy for production.",
        notVsZone: GLOAM_VS_ZONE.oneLine,
      });
    }
    try {
      const dec = decimals ?? net.defaultAssetDecimals;
      const noteAmountWei = parseUnits(String(noteAmount), dec);
      const asset = (req.asset as Address) ?? NATIVE_ASSET;
      const commitment = fieldToHex(
        await noteCommitmentPoseidon(BigInt(noteSecret), noteAmountWei, asset)
      );
      const synced = await syncTree(signer.publicClient, {
        pool: req.poolAddress as Address,
        fromBlock: net.deployBlock,
      });
      const path = await synced.pathForCommitment(commitment);
      if (!path) {
        return text({ status: "error", error: "That note is not in the pool tree yet. Shield it first, or wait for the deposit to confirm." });
      }
      const { wasm, zkey } = await transferArtifacts();
      const payment = await buildGloamPayment({
        requirements: req,
        senderSecretHex: noteSecret as `0x${string}`,
        senderNoteAmountWei: noteAmountWei,
        path,
        prove: artifactProver({ wasm, zkey }),
        issuerTag,
      });
      const hash = await signer.walletClient.writeContract({
        address: payment.intent.exec.poolAddress,
        abi: transferAbi,
        functionName: "transfer",
        args: payment.intent.exec.args as readonly [Hex, Hex, Hex, readonly [Hex, Hex]],
      });
      const receipt = await signer.publicClient.waitForTransactionReceipt({ hash });
      if (receipt.status !== "success") {
        return text({ status: "error", error: `Transfer reverted (${hash}).` });
      }
      payment.payload.payload.txHash = hash;
      const verify = verifyGloamPayment({ requirements: req, payload: payment.payload });
      return text({
        status: "submitted",
        network: net.key,
        hash,
        explorer: `${net.explorer}/tx/${hash}`,
        verify,
        paymentNote: {
          secret: payment.paymentNote.secret,
          commitment: payment.paymentNote.commitment,
          amountWei: payment.paymentNote.amountWei,
        },
        persistChangeNote: {
          secret: payment.changeNote.secret,
          amountWei: payment.changeNote.amountWei,
          note: "Store this change note secret. It is the agent's remaining private balance.",
        },
        privacy: "The public feed shows a shielded transfer, never the amount or the parties.",
        notVsZone: GLOAM_VS_ZONE.oneLine,
      });
    } catch (err) {
      return text({ status: "error", error: err instanceof Error ? err.message : String(err) });
    }
  }
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // stderr only — stdout is the MCP transport
  console.error("Gloam MCP server running on stdio.");
}

main().catch((err) => {
  console.error("Gloam MCP fatal error:", err);
  process.exit(1);
});
