import type { Metadata } from "next";
import Link from "next/link";
import { DocsLayout } from "@/components/DocsLayout";

export const metadata: Metadata = {
  title: "Selective disclosure",
  description:
    "Prove you hold a specific shielded balance to a party you choose, revealing nothing else. Private by default, proven by choice.",
};

export default function DocsDisclosurePage() {
  return (
    <DocsLayout
      title="Selective disclosure"
      lede="Private by default, proven by choice. A holder proves one shielded balance to a party they choose — an auditor, a counterparty — revealing nothing else."
      glance={[
        { label: "Reveals", value: "one note, to one party" },
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
      <h2>Why it matters</h2>
      <p>
        A shielded pool that can only hide is a dark pool, and a regulated-chain
        sponsor cannot build on that. Gloam is private by default and{" "}
        <strong>provable on demand</strong>: the holder, and only the holder,
        chooses to prove a specific fact to a specific party. That is the
        difference between privacy and opacity — and the answer to the dark-pool
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
          that commitment is a <strong>live note in the pool</strong>.
        </li>
      </ul>
      <p>
        Together: <em>this holder owns this balance in the Gloam vault.</em> It
        reveals nothing about who they are, does not expose the note secret (so
        it can never be used to spend), and says nothing about any of their other
        notes.
      </p>

      <h2>How it works</h2>
      <p>
        It reuses the <strong>shield circuit</strong> — no new trusted setup. The
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
        In the app, open <Link href="/app/disclose">/app/disclose</Link>, pick a
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
        Anyone can verify at <Link href="/verify">/verify</Link> — no wallet, no
        account. The proof is checked locally with snarkjs and the note is looked
        up directly on Robinhood Chain. Verification is two independent checks:
      </p>
      <pre>
        <code>{`import { groth16 } from "snarkjs";

// 1) the proof (ownership + amount/asset binding)
const vkey = await (await fetch("/circuits/shield_vkey.json")).json();
const proofOk = await groth16.verify(vkey, [d.commitment, d.amount, d.asset], d.proof);

// 2) membership: the commitment is a live note in the pool
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
          <strong>Trustless to verify.</strong> The recipient checks the math and
          the chain themselves; they do not trust the holder or Gloam.
        </li>
      </ul>
      <p>
        Roadmap: viewing keys for continuous read access to a designated auditor,
        and range disclosures (&quot;I hold at least X&quot;) without revealing
        the exact amount.
      </p>
    </DocsLayout>
  );
}
