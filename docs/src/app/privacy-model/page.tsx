import type { Metadata } from "next";
import { DocShell } from "@/components/DocShell";

export const metadata: Metadata = { title: "Privacy model" };

export default function PrivacyModelPage() {
  return (
    <DocShell title="Privacy model" eyebrow="Threat & design">
      <p>
        Robinhood Chain is a transparent L2. Privacy is not free with the
        chain. Gloam adds application-layer privacy: shielded balances and
        private execution paths on top of a public settlement layer.
      </p>

      <h2 className="!mt-10 text-xl text-white">What we aim to hide</h2>
      <ul className="mt-3 list-disc space-y-2 pl-5">
        <li>Balance amounts while shielded</li>
        <li>The private transfer graph between shielded parties</li>
        <li>Trade intent and size before and during private execution</li>
      </ul>

      <h2 className="!mt-10 text-xl text-white">What may still leak</h2>
      <ul className="mt-3 list-disc space-y-2 pl-5">
        <li>Shield and unshield edges on the public chain</li>
        <li>Timing and amount correlation if the anonymity set is small</li>
        <li>User error, malware, or legal process off-chain</li>
        <li>Metadata at the network and RPC layers if clients are careless</li>
      </ul>

      <h2 className="!mt-10 text-xl text-white">Design stance</h2>
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
    </DocShell>
  );
}
