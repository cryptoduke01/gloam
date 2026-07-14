import type { Metadata } from "next";
import { DocShell } from "@/components/DocShell";

export const metadata: Metadata = { title: "What is Gloam" };

export default function IntroPage() {
  return (
    <DocShell title="What is Gloam" eyebrow="Introduction">
      <p>
        Gloam is private money infrastructure on{" "}
        <strong className="text-white">Robinhood Chain</strong>. Not a dark skin
        on a public book. Not a theatre of green numbers. The product is real
        cryptographic privacy for three acts that matter: hold, move, trade.
      </p>
      <p>
        The public chain is a confessional. Every swap, every size, every
        hesitation of the wallet becomes evidence for whoever can read a graph.
        Gloam builds the sealed chamber beside that confession: shielded
        balances, private transfers, private execution. Stock tokens are the
        first market. Liquid markets follow.
      </p>

      <h2 className="!mt-10 text-xl text-white">Core actions</h2>
      <ul className="mt-3 list-disc space-y-2 pl-5">
        <li>
          <strong className="text-white">Shield</strong> — assets enter a
          private balance set; the public graph loses the thread of what you hold.
        </li>
        <li>
          <strong className="text-white">Move</strong> — transfer without a clear
          public map of sender, size, and timing.
        </li>
        <li>
          <strong className="text-white">Trade</strong> — execute without
          broadcasting the full hand until you choose to exit to light.
        </li>
      </ul>

      <h2 className="!mt-10 text-xl text-white">What Gloam is not</h2>
      <ul className="mt-3 list-disc space-y-2 pl-5">
        <li>A promise of absolute invisibility to law enforcement</li>
        <li>A substitute for operational security off-chain</li>
        <li>Mock fills or simulated privacy for demos</li>
      </ul>

      <p className="mt-6">
        Status: marketing and docs live; protocol rails shipping toward
        testnet. Nothing here is a calendar promise for mainnet.
      </p>
    </DocShell>
  );
}
