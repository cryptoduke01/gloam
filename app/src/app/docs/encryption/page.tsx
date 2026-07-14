import type { Metadata } from "next";
import Link from "next/link";
import { DocsLayout } from "@/components/DocsLayout";

export const metadata: Metadata = {
  title: "How money is encrypted",
  description:
    "Clear value → commit → shielded note → private transfer → only the holder reads.",
};

export default function DocsEncryptionPage() {
  return (
    <DocsLayout
      title="How money is encrypted"
      lede="Value does not disappear when it becomes private. It is rewritten — clear tokens become sealed notes only a viewing key can read."
      glance={[
        { label: "Step 1", value: "Clear balance" },
        { label: "Step 2", value: "Commit + proof" },
        { label: "Step 3", value: "Shielded note" },
        { label: "Step 4", value: "Private transfer" },
        { label: "Step 5", value: "Viewing key" },
      ]}
    >
      <h2>01 · Clear balance</h2>
      <p>
        The wallet holds a plain ERC-20 (or equivalent) on Robinhood Chain. The
        explorer can see it. So can anyone watching the address.
      </p>

      <h2>02 · Encrypt / commit</h2>
      <p>
        Amount and asset identity commit into a ciphertext. A zero-knowledge
        proof attests that the commitment is well-formed and funded without
        revealing the values.
      </p>

      <h2>03 · Shielded note</h2>
      <p>
        The note enters the anonymity set as a commitment. The public graph sees
        structure: a deposit, a tree update. It does not see which bag is yours.
      </p>

      <h2>04 · Private transfer</h2>
      <p>
        To move value, the spender nullifies the old note and issues one or more
        new notes. Recipients are addresses or viewing keys in the private
        domain. The transfer graph breaks.
      </p>

      <h2>05 · Only the holder reads</h2>
      <p>
        Decryption belongs to those who hold the viewing key. Everyone else sees
        commitments and nullifiers: noise with a formal shape.
      </p>

      <h2>What the explorer still sees</h2>
      <p>
        Shield and unshield events touch the public chain. Contract calls are
        visible. Proofs are verified on-chain. Privacy lives in the gap between
        those facts and the identity of amounts, owners, and counterparties
        inside the set. A small set is a weak set. Growth of honest users is
        part of the cryptography.
      </p>
      <p>
        Full argument: <Link href="/whitepaper">whitepaper</Link>. Threat
        notes: <Link href="/docs/privacy-model">privacy model</Link>.
      </p>
    </DocsLayout>
  );
}
