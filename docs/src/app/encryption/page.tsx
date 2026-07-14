import type { Metadata } from "next";
import { DocShell } from "@/components/DocShell";

export const metadata: Metadata = { title: "How money is encrypted" };

const steps = [
  {
    n: "01",
    title: "Clear balance",
    body: "The wallet holds a plain ERC-20 (or equivalent) on Robinhood Chain. The explorer can see it. So can anyone watching the address.",
  },
  {
    n: "02",
    title: "Encrypt / commit",
    body: "Amount and asset identity commit into a ciphertext. A zero-knowledge proof attests that the commitment is well-formed and funded without revealing the values.",
  },
  {
    n: "03",
    title: "Shielded note",
    body: "The note enters the anonymity set as a commitment. The public graph sees structure: a deposit, a tree update. It does not see which bag is yours.",
  },
  {
    n: "04",
    title: "Private transfer",
    body: "To move value, the spender nullifies the old note and issues one or more new notes. Recipients are addresses or viewing keys in the private domain. The transfer graph breaks.",
  },
  {
    n: "05",
    title: "Only the holder reads",
    body: "Decryption belongs to those who hold the viewing key. Everyone else sees commitments and nullifiers: noise with a formal shape.",
  },
];

export default function EncryptionPage() {
  return (
    <DocShell title="How money is encrypted" eyebrow="Mechanism">
      <p>
        Value does not disappear when it becomes private. It is rewritten.
        Clear tokens become sealed notes. Notes move by nullification and
        reissue. The open ledger remains the settlement backbone; the private
        layer is the chamber where size and path go quiet.
      </p>

      <ol className="mt-8 space-y-6">
        {steps.map((s) => (
          <li key={s.n} className="flex gap-4">
            <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-lime font-mono text-[11px] text-lime">
              {s.n}
            </span>
            <div>
              <h2 className="text-lg text-white">{s.title}</h2>
              <p className="mt-1.5">{s.body}</p>
            </div>
          </li>
        ))}
      </ol>

      <h2 className="!mt-10 text-xl text-white">What the explorer still sees</h2>
      <p>
        Shield and unshield events touch the public chain. Contract calls are
        visible. Proofs are verified on-chain. Privacy lives in the gap between
        those facts and the identity of amounts, owners, and counterparties
        inside the set. A small set is a weak set. Growth of honest users is
        part of the cryptography.
      </p>

      <p className="mt-6">
        For the full argument and threat model, read the{" "}
        <a href="/whitepaper" className="text-lime hover:underline">
          whitepaper
        </a>
        .
      </p>
    </DocShell>
  );
}
