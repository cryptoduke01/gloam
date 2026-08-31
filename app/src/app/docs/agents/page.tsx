import type { Metadata } from "next";
import { DocsLayout } from "@/components/DocsLayout";

export const metadata: Metadata = {
  title: "Agents",
  description:
    "@gloam/mcp, an MCP server so an AI agent can shield and privately trade on Robinhood Chain, under policy.",
};

export default function DocsAgentsPage() {
  return (
    <DocsLayout
      title="Agents"
      lede="An MCP server so an AI agent can shield and privately trade on Robinhood Chain, end to end, under policy."
      glance={[
        { label: "Package", value: "@gloam/mcp" },
        { label: "Protocol", value: "Model Context Protocol" },
        { label: "Chain", value: "RH testnet 46630" },
        { label: "Secrets", value: "server-side only" },
      ]}
    >
      <h2>Why agents</h2>
      <p>
        An agent trading a public chain leaks its whole strategy: every position,
        size, and time is on the graph for anyone to copy or front-run. Gloam
        gives an agent a private execution surface. It can hold, move, and trade
        with size hidden, so its edge stays its own.
      </p>

      <h2>Plan, then execute</h2>
      <p>
        The server keeps two phases separate on purpose. Planning tools build an
        unsigned intent and describe, in plain language, what is private and
        what is not. Execution tools take a plan, sign it server-side, and
        broadcast on testnet. An agent can reason over a plan before anything is
        signed.
      </p>
      <ul>
        <li>
          <strong>Plan</strong>, shield, private trade, private send, unshield,
          each returns an intent plus honest privacy and execution notes
        </li>
        <li>
          <strong>Execute</strong>, take a plan, sign, broadcast, return a real
          testnet transaction hash
        </li>
        <li>
          <strong>Read</strong>, markets, quotes, and privacy status
        </li>
      </ul>

      <h2>Policy guardrails</h2>
      <p>
        Execution runs under policy the agent cannot override: spend caps,
        allowed markets, and size privacy always on. An out-of-policy trade is
        refused, not quietly clamped. Signing keys live server-side only and
        never enter a model context or a log.
      </p>

      <h2>Shared core with the SDK</h2>
      <p>
        The agent server and the <a href="/docs/sdk">SDK</a> speak the same
        intent shape, so a plan built in an app and a plan built by an agent are
        the same object. One private path, two front doors.
      </p>

      <h2>Honesty</h2>
      <p>
        No fabricated fills, ever. If a private path is not live, the tool says
        so and returns a plan rather than a fake success. Testnet only, with
        dev-ceremony keys, until a production ceremony and an external audit.
      </p>
    </DocsLayout>
  );
}
