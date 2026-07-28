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
import { CHAIN, MARKETS, PRIVACY_STATUS, findMarket } from "./data.js";

const server = new McpServer({ name: "gloam", version: "0.1.0" });

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
        "gloam_privacy_status: honest privacy posture (read)",
        "gloam_list_markets: tradable markets and marks (read)",
        "gloam_quote: indicative quote and what stays private (read)",
        "gloam_plan_private_trade: build a private-trade intent (planning)",
        "gloam_plan_shield: build a shield (deposit-to-private) intent (planning)",
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
