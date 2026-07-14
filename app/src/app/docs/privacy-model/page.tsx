import type { Metadata } from "next";
import Link from "next/link";
import { DocsLayout } from "@/components/DocsLayout";

export const metadata: Metadata = {
  title: "Privacy model",
  description:
    "What Gloam hides, what may leak, and the honest threat model.",
};

export default function DocsPrivacyPage() {
  return (
    <DocsLayout
      title="Privacy model"
      lede="Robinhood Chain is transparent. Privacy is not free with the chain — Gloam adds it at the application layer."
      glance={[
        { label: "Layer", value: "App-layer" },
        { label: "Hidden", value: "Amount · path" },
        { label: "Edge", value: "Shield / unshield" },
        { label: "Set", value: "Anonymity size" },
      ]}
    >
      <h2>What we aim to hide</h2>
      <ul>
        <li>Balance amounts while shielded</li>
        <li>The private transfer graph between shielded parties</li>
        <li>Trade intent and size before and during private execution</li>
      </ul>

      <h2>What may still leak</h2>
      <ul>
        <li>Shield and unshield edges on the public chain</li>
        <li>Timing and amount correlation if the anonymity set is small</li>
        <li>User error, malware, or legal process off-chain</li>
        <li>Metadata at the network and RPC layers if clients are careless</li>
      </ul>

      <h2>Design stance</h2>
      <p>
        Prefer battle-tested EVM privacy systems (Railgun-class) over inventing
        circuits from nothing on day one. Honest threat models beat marketing
        that pretends the edge does not exist. Privacy reduces public
        visibility. It does not erase the physical world.
      </p>
      <p>
        Implementation details land as contracts land on testnet. Until then,
        treat this page as the contract with the reader: no fake privacy, no
        silent expansion of claims.
      </p>
      <p>
        See also: <Link href="/docs/encryption">How money is encrypted</Link>{" "}
        and the <Link href="/whitepaper">whitepaper</Link>.
      </p>
    </DocsLayout>
  );
}
