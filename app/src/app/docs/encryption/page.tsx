import type { Metadata } from "next";
import Link from "next/link";
import { DocsLayout } from "@/components/DocsLayout";
import { FlowDiagram, PoolPicture } from "@/components/docs/FlowDiagram";
import { EncryptFlow } from "@/components/EncryptFlow";

export const metadata: Metadata = {
  title: "How shield works",
  description:
    "Simple explanation of Gloam shield and unshield — deposit, private note, proof, withdraw.",
};

export default function DocsEncryptionPage() {
  return (
    <DocsLayout
      title="How shield works"
      lede="No exam required. This is the deposit / note / withdraw loop in plain language."
      glance={[
        { label: "In", value: "Shield" },
        { label: "Hold", value: "Note" },
        { label: "Out", value: "Unshield" },
        { label: "Network", value: "Testnet" },
      ]}
    >
      <h2>The short version</h2>
      <p>
        <strong>Shield</strong> = put money into Gloam’s vault.
        <br />
        <strong>Unshield</strong> = take it back out with a proof that you own
        it.
      </p>
      <p>
        While it is in the vault, your normal wallet balance no longer shows
        that amount. The vault holds many people’s deposits together.
      </p>

      <PoolPicture />

      <FlowDiagram
        title="Step by step"
        steps={[
          {
            n: "1",
            title: "You start public",
            body: "ETH or stock tokens sit in your wallet. Explorers can show that balance.",
          },
          {
            n: "2",
            title: "You shield",
            body: "You send assets to the pool contract. A “commitment” (a fingerprint of your deposit) is written on-chain.",
          },
          {
            n: "3",
            title: "You keep a note",
            body: "Your browser stores a secret linked to that deposit. Clear site data and you lose the local copy (the on-chain leaf remains).",
          },
          {
            n: "4",
            title: "You unshield",
            body: "The app builds a proof: “I know a secret for a valid note.” The pool checks it and pays your wallet.",
          },
        ]}
      />

      <h2>Visual path</h2>
      <EncryptFlow />

      <h2>What the public still sees</h2>
      <ul>
        <li>That someone used the Gloam contract</li>
        <li>When money entered or left the vault (shield / unshield edges)</li>
        <li>Not (goal) your exact private bag while it stays inside</li>
      </ul>

      <h2>What we do not claim</h2>
      <p>
        Unshield is not invisible. Leaving the vault is a public moment. Private
        send between two people is the next product step, not this page’s claim.
      </p>

      <p>
        Try it: <Link href="/app/shield">Shield</Link> →{" "}
        <Link href="/app/move">Unshield</Link>.
      </p>
    </DocsLayout>
  );
}
