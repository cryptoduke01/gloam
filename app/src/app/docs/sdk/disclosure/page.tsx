import type { Metadata } from "next";
import Link from "next/link";
import { AppLink } from "@/components/AppLink";
import { DocsLayout } from "@/components/DocsLayout";

export const metadata: Metadata = {
  title: "Selective disclosure",
  description:
    "Prove the amount and asset of one shielded note, revealing nothing else. The newer proofs of funds, payment and payroll add a label and an expiry.",
};

export default function DocsDisclosurePage() {
  return (
    <DocsLayout
      title="Selective disclosure"
      lede="The original note disclosure format, gloamdisc1, is retired: the verifier no longer accepts it, because anyone can copy a deposit's proof from public transaction data. Use the Exact balance proof (gloambal1) or a proof of funds instead. This page stays for reference."
      glance={[
        { label: "Reveals", value: "one note's amount and asset" },
        { label: "Hides", value: "identity, secret, other notes" },
        { label: "Circuit", value: "reuses shield (no new setup)" },
        { label: "Verify", value: "in-browser, no wallet" },
      ]}
      quickLinks={[
        { href: "/verify", label: "Open the verifier" },
        { href: "/app/disclose", label: "Create a disclosure" },
        { href: "/docs/sdk", label: "SDK" },
        { href: "/docs/privacy-model", label: "Privacy model" },
      ]}
    >
      <div className="rounded-[14px] bg-surface px-5 py-4 text-[14px] leading-relaxed text-mute">
        Retired format. A <code>gloamdisc1</code> proof reuses the deposit
        statement, and every deposit publishes that proof on chain, so it cannot
        show who holds a balance. The verifier now answers &quot;can&apos;t
        confirm&quot; for it. Make an Exact balance proof in{" "}
        <Link href="/app/disclose">Prove</Link> instead; it carries a label and
        an expiry and never goes on chain. See{" "}
        <Link href="/docs/proofs">proofs</Link>.
      </div>

      <h2>Why it matters</h2>
      <p>
        A shielded pool that can only hide is a dark pool, and a regulated-chain
        sponsor cannot build on that. Gloam is private by default and{" "}
        <strong>provable on demand</strong>: the holder, and only the holder,
        chooses what to prove and who to send it to. That is the
        difference between privacy and opacity, and the answer to the dark-pool
        objection.
      </p>

      <h2>What a disclosure proves</h2>
      <p>A disclosure is a portable token that lets a verifier confirm:</p>
      <ul>
        <li>
          the discloser <strong>knows the secret</strong> that binds a commitment
          to a specific <code>amount</code> and <code>asset</code>, and
        </li>
        <li>
          that commitment was <strong>added to the pool</strong>.
        </li>
      </ul>
      <p>
        Together: <em>this holder controls, or controlled, this balance in the
        Gloam vault.</em> It reveals nothing about who they are, does not expose
        the note secret (so it can never be used to spend), and says nothing
        about any of their other notes. It does not show the note is still
        unspent.
      </p>

      <h2>How it works</h2>
      <p>
        It reuses the <strong>shield circuit</strong>, so there is no new trusted setup. The
        shield proof already proves{" "}
        <code>commitment == Poseidon(secret, amount, asset)</code> with the
        secret private. A disclosure is that proof plus the public commitment.
        The verifier checks the proof, then confirms membership on-chain with{" "}
        <code>pool.commitmentSeen(commitment)</code>. Because the commitment is
        already a public tree leaf, a disclosure leaks nothing new beyond the
        amount and asset the holder chose to reveal.
      </p>

      <h2>Create a disclosure</h2>
      <p>
        In the app, open <AppLink href="/app/disclose">/app/disclose</AppLink>, pick a
        note, and copy the token. Programmatically, generate the shield proof for
        the note you want to reveal and package it:
      </p>
      <pre>
        <code>{`import { artifactProver } from "@gloamtrade/sdk";

// prove the note you choose to reveal (same input as a shield)
const prover = artifactProver({ wasm: "shield.wasm", zkey: "shield_final.zkey" });
const { proof, publicSignals } = await prover({
  commitment: note.commitmentField.toString(),
  amount:     note.amountWei.toString(),
  asset:      assetField.toString(),
  secret:     note.secretField.toString(),
});

// publicSignals === [commitment, amount, asset]
const disclosure = { v: 1, chainId, pool, commitment: publicSignals[0],
  amount: publicSignals[1], asset: publicSignals[2], proof };`}</code>
      </pre>

      <h2>Verify a disclosure</h2>
      <p>
        Anyone can verify at <Link href="/verify">/verify</Link>, with no wallet and no
        account. The proof is checked locally with snarkjs and the note is looked
        up directly on Robinhood Chain. Verification is two independent checks:
      </p>
      <pre>
        <code>{`import { groth16 } from "snarkjs";

// 1) the proof (ownership + amount/asset binding)
const vkey = await (await fetch("/circuits/shield_vkey.json")).json();
const proofOk = await groth16.verify(vkey, [d.commitment, d.amount, d.asset], d.proof);

// 2) membership: the commitment was added to the pool
const live = await pool.read.commitmentSeen([toBytes32(d.commitment)]);

const verified = proofOk && live;`}</code>
      </pre>

      <h2>Guarantees</h2>
      <ul>
        <li>
          <strong>Unspendable.</strong> The disclosure carries a proof, not the
          secret, so it can never move the funds.
        </li>
        <li>
          <strong>Scoped.</strong> It reveals exactly one note. Other holdings,
          the wallet, and the history stay private.
        </li>
        <li>
          <strong>Not bound to a reader or a time.</strong> This original format
          has no recipient label and no expiry, and stays valid after the note
          is spent. Anyone holding it can check it, so send it only to the party
          you mean to.
        </li>
        <li>
          <strong>Trustless to verify.</strong> The recipient checks the math and
          the chain themselves; they do not trust the holder or Gloam.
        </li>
      </ul>
      <p>
        Newer proofs cover what this format cannot. A proof of funds shows you
        hold at least X across up to four unspent notes, a proof of payment
        shows a private payment was made, and a payroll total shows a run added up. Each
        carries a label naming who it is for and an expiry, and is checked at{" "}
        <Link href="/verify">/verify</Link>. See{" "}
        <Link href="/docs/proofs">proofs</Link>.
      </p>
      <p>
        Roadmap: viewing keys for continuous read access to a designated
        auditor.
      </p>
    </DocsLayout>
  );
}
