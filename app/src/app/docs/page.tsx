import type { Metadata } from "next";
import Link from "next/link";
import { DocsLayout } from "@/components/DocsLayout";

export const metadata: Metadata = {
  title: "Docs",
  description:
    "Gloam documentation — Trade Everything on Robinhood Privately. Stocks, memes, shielded balances.",
};

export default function DocsOverviewPage() {
  return (
    <DocsLayout
      title="Trade Everything on Robinhood Privately."
      lede="Gloam is private money infrastructure on Robinhood Chain. Stocks. Memes. Shielded balances, private transfers, private trade — without printing your book to the street."
      glance={[
        { label: "Thesis", value: "Private trade" },
        { label: "Assets", value: "Stocks · Memes" },
        { label: "Chain", value: "Robinhood" },
        { label: "Chain ID", value: "4663" },
        { label: "Privacy", value: "Shielded notes" },
        { label: "Status", value: "Testnet path" },
      ]}
    >
      <h2 id="overview">1. Overview</h2>
      <p>
        Every transparent ledger is a confession. Swap, size, and timing become
        a continuous autobiography of intent — harvested by bots, copy traders,
        and anyone who can read a graph. Gloam builds the sealed chamber beside
        that confession.
      </p>
      <p>
        Not a dark theme on a public DEX. Not theatrical privacy. The product is
        real cryptographic privacy for three acts that matter:{" "}
        <strong>hold</strong>, <strong>move</strong>, <strong>trade</strong>.
      </p>

      <h2 id="actions">Core actions</h2>
      <ul>
        <li>
          <strong>Shield</strong> — assets enter a private balance set; the
          public graph loses the thread of what you hold.
        </li>
        <li>
          <strong>Move</strong> — transfer without a clear public map of sender,
          size, and timing.
        </li>
        <li>
          <strong>Trade</strong> — execute without broadcasting the full hand
          until you choose to exit to light.
        </li>
      </ul>

      <h2 id="markets">Stocks and memes</h2>
      <p>
        One private venue for everything that settles on Robinhood Chain.
        Tokenized equities for size and legitimacy. Meme markets for volume and
        urgency. Same rails. Same silence.
      </p>

      <h2 id="read-next">Read next</h2>
      <ul>
        <li>
          <Link href="/docs/encryption">How money is encrypted</Link>
        </li>
        <li>
          <Link href="/docs/privacy-model">Privacy model</Link>
        </li>
        <li>
          <Link href="/whitepaper">Whitepaper</Link>
        </li>
      </ul>
    </DocsLayout>
  );
}
