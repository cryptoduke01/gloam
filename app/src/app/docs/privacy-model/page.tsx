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
            title: "While shielded",
            body: "Your open wallet no longer shows that amount. Goal: harder to read your full position from the street.",
          },
          {
            n: "!",
            title: "When you enter/exit",
            body: "Shield and unshield touch the public chain. Someone can see that the vault was used.",
          },
          {
            n: "→",
            title: "Not yet",
            body: "Private send between people, and private trade size, are product goals — not fully shipped.",
          },
        ]}
      />

      <h2>We aim to hide</h2>
      <ul>
        <li>How much you hold while it is in the vault</li>
        <li>(Later) who paid whom inside the vault</li>
        <li>(Later) trade size during private execution</li>
      </ul>

      <h2>The public can still see</h2>
      <ul>
        <li>That someone used Gloam</li>
        <li>When money went in or out of the vault</li>
        <li>Timing clues if very few people use the system</li>
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
        <Link href="/whitepaper">Whitepaper</Link>.
      </p>
    </DocsLayout>
  );
}
