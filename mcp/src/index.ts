#!/usr/bin/env node
/**
 * Gloam MCP server.
 *
 * Gives an AI agent private-trading tools on Robinhood Chain, the same way
 * Robinhood's own MCP server gives it public trading. An agent adds both:
 * Robinhood for open execution, Gloam for private execution.
 *
 * This v0 exposes read + planning tools that work today, and returns honest
 * "intent" objects for write actions (shield / trade / send) that need a
 * connected agent wallet with signing. It never fakes a private fill.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { isAddress, parseEther, type Address, type Hex } from "viem";
import { buildShieldBoundIntent, artifactProver, SEALED_VAULT } from "@gloamtrade/sdk";
import { CHAIN, MARKETS, PRIVACY_STATUS, findMarket } from "./data.js";
import { getSigner } from "./signer.js";
import { shieldArtifacts } from "./artifacts.js";

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
      ],
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
      "Deposit ETH into a PRIVATE balance on Robinhood Chain. Mints a note, generates the Groth16 shield proof server-side, and broadcasts shieldBound(). This is the real private-execution rail: the agent ends up holding a shielded balance only it can spend. Requires GLOAM_AGENT_PRIVATE_KEY; without it, returns a plan. The returned note secret is the ONLY authority to spend the balance later, so the agent must persist it.",
    inputSchema: {
      eth: z
        .number()
        .positive()
        .describe("Amount of testnet ETH to shield into a private balance."),
    },
  },
  async ({ eth }) => {
    const signer = getSigner();
    if (!signer) {
      return text({
        status: "no_signer",
        plan: { action: "shield", eth, chainId: CHAIN.chainId, pool: SEALED_VAULT },
        message:
          "No signer configured. Set GLOAM_AGENT_PRIVATE_KEY (testnet) to execute, or wire a Turnkey server wallet with policy for production.",
      });
    }
    try {
      const { wasm, zkey } = await shieldArtifacts();
      const intent = await buildShieldBoundIntent({
        amountWei: parseEther(String(eth)),
        prover: artifactProver({ wasm, zkey }),
      });
      const hash = await signer.walletClient.writeContract({
        address: intent.exec.poolAddress,
        abi: shieldPoolAbi,
        functionName: "shieldBound",
        args: intent.exec.args as readonly [Address, bigint, Hex, Hex],
        value: intent.exec.valueWei,
      });
      return text({
        status: "submitted",
        hash,
        from: signer.account.address,
        explorer: `${CHAIN.explorer}/tx/${hash}`,
        note: {
          commitment: intent.note.commitment,
          secret: intent.note.secret,
        },
        persist:
          "Store note.secret. It is the only authority to spend this private balance; losing it loses the funds.",
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
