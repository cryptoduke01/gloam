import type { Metadata } from "next";
import Link from "next/link";
import { DocsLayout } from "@/components/DocsLayout";
import { FlowDiagram } from "@/components/docs/FlowDiagram";

export const metadata: Metadata = {
  title: "What stays private",
  description:
    "The honest privacy model for Gloam: what an explorer still shows, what stays hidden, how strong the anonymity set is, and what we will not promise.",
};

export default function DocsPrivacyPage() {
  return (
    <DocsLayout
      title="What stays private"
      lede="Robinhood Chain is a public ledger. Gloam adds a shielded pool on top. Privacy here means unlinkability and hidden holdings, not that transactions vanish from the explorer. Here is exactly what that does and does not hide."
      glance={[
        { label: "Hidden", value: "the link, the bag" },
        { label: "Public", value: "deposits + exits" },
        { label: "Anon set", value: "more users = stronger" },
        { label: "Sealed swaps", value: "paused (H1)" },
      ]}
    >
      <FlowDiagram
        title="At a glance"
        steps={[
          {
            n: "✓",
            title: "In the vault",
            body: "While value sits in a note, your public wallet no longer shows it. Your holdings inside the pool are hidden.",
          },
          {
            n: "✓",
            title: "Private send (live)",
            body: "Pay inside the vault. The chain sees a transfer proof and two new commitments, not who paid whom or how much.",
          },
          {
            n: "✓",
            title: "Selective disclosure (live)",
            body: "Prove one balance to one party you choose, revealing nothing else.",
          },
          {
            n: "!",
            title: "Enter and exit are public",
            body: "Shield (deposit) and cash out (unshield) are ordinary public transactions. The amount and address are visible.",
          },
          {
            n: "✕",
            title: "Sealed swaps (paused)",
            body: "Private trade is disabled pending the H1 solvency work. Do not rely on it yet.",
          },
          {
            n: "!",
            title: "Anonymity set",
            body: "Unlinkability is only as strong as the crowd of notes to hide among. On a near-empty pool, an exit is traceable to your deposit.",
          },
        ]}
      />

      <h2>What an explorer actually shows</h2>
      <p>
        This is the part people get wrong, so it is worth stating plainly. Put
        your own address into the block explorer and you will find your shield
        deposit: a public transaction from your wallet, into the pool, for the
        exact amount, and its <code>Shielded</code> event carries your address,
        the amount, and the note commitment together. Nothing about the deposit
        is hidden.
      </p>
      <p>
        The <strong>commitment</strong> is a Poseidon hash (a 32-byte value). If
        you paste it into the explorer search you get nothing back, because it is
        not a transaction or an address, just a leaf in the pool&apos;s Merkle
        tree. Querying the contract returns only{" "}
        <code>commitmentSeen(commitment) == true</code>. The hash reveals no
        amount, no secret, and no owner on its own.
      </p>
      <p>
        The privacy is on the <strong>spend</strong>. When you later send or cash
        out, the zero-knowledge proof shows that you own <em>some</em> note in the
        tree and publishes a nullifier, without revealing <em>which</em> note. So
        a withdrawal to a fresh address, or a private send, cannot be linked back
        to your deposit. That unlinkability is the product.
      </p>

      <h2>What stays hidden</h2>
      <ul>
        <li>The link between your deposit and any later spend or exit</li>
        <li>How much you hold while it is in the vault</li>
        <li>Who paid whom, and how much, on a private send (live on testnet)</li>
      </ul>

      <h2>What the public still sees</h2>
      <ul>
        <li>Each shield deposit: your address, the asset, and the amount</li>
        <li>Each cash out: the asset, the amount, and the destination address</li>
        <li>That the pool was used, the caller of each transaction, and timing</li>
        <li>Every commitment and nullifier as opaque hashes, plus the pool total</li>
      </ul>

      <h2>The anonymity set is the whole game</h2>
      <p>
        A shielded pool hides you in a crowd. If you are the only note of your
        size, an exit of that size is trivially yours. Today the testnet pool is
        small, so treat unlinkability as weak until it fills up. This is true of
        every shielded pool, Gloam included. We would rather say it than let you
        assume more privacy than you have.
      </p>

      <h2>What we will not promise</h2>
      <ul>
        <li>Invisibility from law, courts, or a subpoena</li>
        <li>Privacy once you cash out to a public address</li>
        <li>Safety if your device or browser is compromised</li>
        <li>Strong anonymity while the pool has few users</li>
        <li>Recovery if you lose a note secret</li>
      </ul>

      <h2>Before mainnet</h2>
      <p>
        Gloam is testnet only today, and there are honest gaps we will not ship to
        real value without closing:
      </p>
      <ul>
        <li>
          <strong>Dev-ceremony proving keys.</strong> Mainnet needs a real
          multi-party trusted setup and an external audit.
        </li>
        <li>
          <strong>Sealed swaps are disabled</strong> pending the H1 solvency fix.
        </li>
      </ul>
      <p>
        See <Link href="/docs/production">the production gate</Link> for the full
        list. More detail: <Link href="/docs/encryption">How shield works</Link>{" "}
        and the <Link href="/whitepaper">whitepaper</Link>.
      </p>
    </DocsLayout>
  );
}
