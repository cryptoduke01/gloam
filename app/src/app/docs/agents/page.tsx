import type { Metadata } from "next";
import Link from "next/link";
import { DocsLayout } from "@/components/DocsLayout";

export const metadata: Metadata = {
  title: "Agents",
  description:
    "Give an AI agent private execution on Robinhood Chain: shield, pay, and disclose end to end via @gloamtrade/sdk and the @gloamtrade/mcp server, under policy.",
};

export default function DocsAgentsPage() {
  return (
    <DocsLayout
      title="Build a private agent"
      lede="Give an AI agent a private execution surface on Robinhood Chain. It shields, pays, and proves holdings end to end, with size and strategy hidden and signing under policy."
      glance={[
        { label: "SDK", value: "@gloamtrade/sdk" },
        { label: "Server", value: "@gloamtrade/mcp (MCP)" },
        { label: "Example", value: "examples/agent-shield" },
        { label: "Secrets", value: "server-side only" },
      ]}
      quickLinks={[
        { href: "/docs/sdk", label: "SDK" },
        { href: "/docs/sdk/disclosure", label: "Selective disclosure" },
        { href: "/docs/privacy-model", label: "Privacy model" },
      ]}
    >
      <h2>Why agents need this most</h2>
      <p>
        An agent trading a public chain leaks its whole strategy: every position,
        size, and time is on the graph for anyone to copy or front-run. Agents run
        predictable, high-frequency strategies, so they are the easiest to
        reverse-engineer. Gloam gives an agent a private execution surface — hold,
        move, and prove value with size hidden, so its edge stays its own.
      </p>

      <h2>Two ways in</h2>
      <p>
        Both speak the same intent shape, so a plan an app builds and a plan an
        agent builds are the same object.
      </p>
      <ul>
        <li>
          <strong>Directly via <code>@gloamtrade/sdk</code>.</strong> Your agent
          framework builds an intent and signs it with its own wallet. Best when
          the agent already has an execution loop.
        </li>
        <li>
          <strong>Via the <code>@gloamtrade/mcp</code> server.</strong> An
          MCP-speaking model (Claude, etc.) gets Gloam as tools alongside its
          other capabilities — the same way Robinhood&apos;s own MCP exposes
          public trading. Best for a general assistant that should also act
          privately.
        </li>
      </ul>

      <h2>Reference agent (the SDK path)</h2>
      <p>
        <code>examples/agent-shield</code> is the smallest complete agent: it
        mints a note, generates the shield proof, and deposits privately via{" "}
        <code>shieldBound</code>. The whole private path is a few lines.
      </p>
      <pre>
        <code>{`import { buildShieldBoundIntent, artifactProver } from "@gloamtrade/sdk";
import { parseEther } from "viem";

// 1) SDK mints the note + generates the shield proof
const intent = await buildShieldBoundIntent({
  amountWei: parseEther("0.001"),
  prover: artifactProver({ wasm: "shield.wasm", zkey: "shield_final.zkey" }),
});

// 2) the agent signs the resolved call with its (server-held) wallet
const hash = await wallet.writeContract({
  address: intent.exec.poolAddress,
  abi: shieldPoolAbi,
  functionName: intent.exec.fn,   // "shieldBound"
  args: intent.exec.args,
  value: intent.exec.valueWei,
});
// persist intent.note.secret in the agent's note store, keyed by commitment`}</code>
      </pre>
      <p>
        From there the agent can cash out, pay a receive tag, or prove a balance
        to a counterparty with a <Link href="/docs/sdk/disclosure">disclosure</Link>{" "}
        — all with the same core.
      </p>

      <h2>The MCP server</h2>
      <p>
        <code>@gloamtrade/mcp</code> exposes Gloam as tools to any MCP client. It keeps
        two phases separate on purpose: planning tools build an unsigned intent
        and describe, in plain language, what is private and what is not;
        execution tools take a plan, sign it server-side, and broadcast.
      </p>
      <table>
        <thead>
          <tr>
            <th>Tool</th>
            <th>Does</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>
              <code>gloam_info</code> / <code>gloam_privacy_status</code>
            </td>
            <td>What Gloam is; the honest current privacy posture (read)</td>
          </tr>
          <tr>
            <td>
              <code>gloam_list_markets</code> / <code>gloam_quote</code>
            </td>
            <td>Markets and indicative quotes, with what stays private (read)</td>
          </tr>
          <tr>
            <td>
              <code>gloam_plan_shield</code> / <code>gloam_plan_private_trade</code>
            </td>
            <td>Build an unsigned intent an agent can reason over (plan)</td>
          </tr>
          <tr>
            <td>
              <code>gloam_execute_transfer</code>
            </td>
            <td>Sign + broadcast on the real testnet execution rail (execute)</td>
          </tr>
        </tbody>
      </table>

      <h2>Policy and key custody</h2>
      <p>
        Signing keys live <strong>server-side only</strong> and never enter a
        model context or a log. For production, swap the testnet key for a Turnkey
        server wallet with policy the agent cannot override: spend caps, an
        allow-list of contracts and markets, and size privacy always on. An
        out-of-policy action is refused, not quietly clamped.
      </p>

      <h2>Honesty</h2>
      <p>
        No fabricated fills, ever. If a private path is not live, the tool says so
        and returns a plan rather than a fake success. Sealed swaps are currently
        disabled pending the H1 solvency work; shield, private send, cash out, and
        disclosure are live and proof-gated. Testnet only, with dev-ceremony keys,
        until a production ceremony and an external audit.
      </p>
    </DocsLayout>
  );
}
