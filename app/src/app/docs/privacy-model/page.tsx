import type { Metadata } from "next";
import Link from "next/link";
import { DocsLayout } from "@/components/DocsLayout";
import { FlowDiagram } from "@/components/docs/FlowDiagram";

export const metadata: Metadata = {
  title: "What stays private",
  description:
    "Honest privacy model for Gloam — what we hide, what the public still sees, and what we will not promise.",
};

export default function DocsPrivacyPage() {
  return (
    <DocsLayout
      title="What stays private"
      lede="Robinhood Chain is a public ledger. Gloam adds a vault on top. Here is what that does and does not hide."
      glance={[
        { label: "Goal", value: "Hide the bag" },
        { label: "Edge", value: "In / out public" },
        { label: "Set", value: "More users = better" },
        { label: "Mode", value: "Honest" },
      ]}
    >
      <FlowDiagram
        title="At a glance"
        steps={[
          {
            n: "✓",
            title: "While in the vault",
            body: "Your open wallet no longer shows that amount. Harder to read your full bag from the street.",
          },
          {
            n: "✓",
            title: "Private send (live)",
            body: "Pay someone inside the vault with a receive tag. The chain sees a transfer proof — not “Alice paid Bob 0.01 ETH”.",
          },
          {
            n: "!",
            title: "When you enter / exit",
            body: "Shield and cash out touch the public chain. Someone can see that the vault was used.",
          },
          {
            n: "✓",
            title: "Private trade (live)",
            body: "Vault ETH → vault stock with a sealedSwap proof. Size is private by default (min-out floor, not your exact size). Pair and caller still public.",
          },
          {
            n: "½",
            title: "Via market adapter",
            body: "Cash out → public swap → re-shield. Swap size is public on that edge. Prefer Private trade when a pool is empty or you want size privacy.",
          },
          {
            n: "!",
            title: "Cash out",
            body: "Unshield publishes asset, amount, and destination. Stay in the vault to stay private.",
          },
        ]}
      />

      <h2>We aim to hide</h2>
      <ul>
        <li>How much you hold while it is in the vault</li>
        <li>Who paid whom inside the vault (private send — live on testnet)</li>
        <li>
          Trade size on private trade (default max size privacy — see{" "}
          <Link href="/docs/sealed-trade">sealed trade</Link>)
        </li>
      </ul>

      <h2>The public can still see</h2>
      <ul>
        <li>That someone used Gloam (shield / sealedSwap / unshield txs)</li>
        <li>Asset pair on a private trade (e.g. ETH → TSLA), not the size</li>
        <li>When money went in or out of the vault (and amounts on cash out)</li>
        <li>Caller address on each tx; timing clues if few people use the system</li>
      </ul>

      <h2>We will not promise</h2>
      <ul>
        <li>Invisibility from law or courts</li>
        <li>Safety if your phone is compromised</li>
        <li>Privacy if you clear the browser note and lose the secret</li>
        <li>Strong anonymity with almost no users</li>
      </ul>

      <p>
        More detail: <Link href="/docs/encryption">How shield works</Link> ·{" "}
        <Link href="/whitepaper">Whitepaper</Link>. Token status:{" "}
        <Link href="/token">$GLOAM</Link> (not launched).
      </p>
    </DocsLayout>
  );
}
