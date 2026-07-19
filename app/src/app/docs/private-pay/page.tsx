import type { Metadata } from "next";
import Link from "next/link";
import { DocsLayout } from "@/components/DocsLayout";
import { FlowDiagram } from "@/components/docs/FlowDiagram";

export const metadata: Metadata = {
  title: "Private pay on RH",
  description:
    "How Gloam private pay compares to Solana private send and Zcash — and what is live on Robinhood Chain testnet.",
};

export default function DocsPrivatePayPage() {
  return (
    <DocsLayout
      title="Private pay on Robinhood Chain"
      lede="Yes, Solana-style “pay like public send” is possible on RH. Gloam is building that path with vault proofs + receive tags + on-chain memos."
      glance={[
        { label: "Chain", value: "RH EVM" },
        { label: "Direct", value: "Receive tag" },
        { label: "Discovery", value: "Memo + scan" },
        { label: "Also", value: "Private trade" },
      ]}
    >
      <h2>Why Solana private send “feels” like public send</h2>
      <p>
        Wallets like Solflare hide the hard parts. You still pick a recipient
        and an amount — under the hood they use a shielded program, encryption,
        and discovery so you are not pasting raw note secrets. The <em>UI</em>{" "}
        matches public send; the <em>settlement</em> is private.
      </p>
      <p>
        Robinhood Chain is <strong>EVM</strong>, not Solana. There is no
        built-in Elusiv/Light-style stack. That does <strong>not</strong> mean
        the pattern is impossible — it means the app + contracts must implement
        it (which is what Gloam is).
      </p>

      <FlowDiagram
        title="Gloam private pay (current)"
        steps={[
          {
            n: "1",
            title: "Receive tag",
            body: "Recipient publishes gloamr1… (shielded identity, not a public 0x transfer target).",
          },
          {
            n: "2",
            title: "Vault transfer proof",
            body: "Sender spends a vault note → payment + change. Chain does not see Alice→Bob amount.",
          },
          {
            n: "3",
            title: "Encrypted package",
            body: "Ticket sealed to their tag (gloam2t). Optional: post as on-chain memo for Scan inbox.",
          },
          {
            n: "4",
            title: "Claim",
            body: "Recipient decrypts (tag key) and imports the note into their vault.",
          },
        ]}
      />

      <h2>Is RH “not able” to do Solana-style private send?</h2>
      <p>
        <strong>No.</strong> EVM supports the same ingredients: Merkle notes,
        ZK proofs, encrypted memos, client scan. Solana’s edge today is{" "}
        <em>product integration in wallets</em>, not magic of the SVM.
      </p>

      <h2>Replicating Zcash on Robinhood with Gloam?</h2>
      <p>
        <strong>Directionally yes; literally cloning Zcash no.</strong>
      </p>
      <ul>
        <li>
          <strong>Zcash</strong> = private <em>ZEC</em> (its own asset + full
          shielded protocol).
        </li>
        <li>
          <strong>Gloam</strong> = private rails for{" "}
          <em>RH stock tokens / RWA / ETH</em> — hold, private pay, and private
          trade (testnet live) next to open settlement on the same chain RH
          cares about.
        </li>
      </ul>
      <p>What still gates a full Zcash-class experience:</p>
      <ul>
        <li>Production trusted setup (not dev zkeys)</li>
        <li>Stronger public-input privacy on trade rates / pair</li>
        <li>Anonymity set / usage</li>
        <li>Audit before real money</li>
      </ul>

      <h2>Try it</h2>
      <p>
        <Link href="/app/move">Move</Link> — private pay ·{" "}
        <Link href="/app/trade?path=sealed">Private trade</Link> — size
        privacy on ·{" "}
        <Link href="/docs/privacy-model">Privacy model</Link>.
      </p>
    </DocsLayout>
  );
}
