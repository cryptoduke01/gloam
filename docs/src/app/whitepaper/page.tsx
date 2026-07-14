import type { Metadata } from "next";
import { DocShell } from "@/components/DocShell";

export const metadata: Metadata = {
  title: "Whitepaper",
  description:
    "Gloam whitepaper: private money on Robinhood Chain — thesis, architecture, threat model, roadmap.",
};

export default function WhitepaperPage() {
  return (
    <DocShell title="Whitepaper" eyebrow="Gloam · v0.1">
      <p className="text-sm text-mute">
        Status: living document. Version 0.1. Claims expand only as contracts
        and audits land. Last structural draft for public docs surface.
      </p>

      <h2 className="!mt-10 text-2xl text-white" style={{ fontFamily: "var(--font-display), Georgia, serif" }}>
        1. Thesis
      </h2>
      <p>
        Onchain finance inherited a strange piety: everything must be visible.
        The ledger that was meant to free money from intermediaries became a
        permanent audience. Traders, funds, and ordinary holders leave a
        continuous autobiography of intent. Bots harvest that autobiography.
        Copy traders reprice it. Enemies map it.
      </p>
      <p>
        Gloam asserts a simpler rule.{" "}
        <strong className="text-white">
          Trade and move money privately onchain.
        </strong>{" "}
        Settlement may remain public. Strategy, size, and path need not. Privacy
        is not a costume. It is the sealed chamber beside the open book.
      </p>

      <h2 className="!mt-10 text-2xl text-white" style={{ fontFamily: "var(--font-display), Georgia, serif" }}>
        2. The problem
      </h2>
      <p>
        Transparent AMMs and wallet intelligence products turned every move
        into content. Large size on a public pool is a confession of urgency.
        Address clustering turns a portfolio into a public dossier. Tokenized
        equities on Robinhood Chain inherit the same exposure: the asset is
        modern; the privacy model is medieval.
      </p>
      <p>
        Existing retail venues will list stock tokens. They will not ship
        private balances as product. That gap is Gloam.
      </p>

      <h2 className="!mt-10 text-2xl text-white" style={{ fontFamily: "var(--font-display), Georgia, serif" }}>
        3. Where we build
      </h2>
      <p>
        Robinhood Chain (mainnet ID <span className="text-lime">4663</span>) is
        an Arbitrum Orbit L2 aimed at financial services and real-world assets.
        Tokenized equities already live there. EVM tooling and Uniswap-class
        liquidity paths exist. Gloam does not invent a new chain. It adds a
        private money layer where the markets already are.
      </p>

      <h2 className="!mt-10 text-2xl text-white" style={{ fontFamily: "var(--font-display), Georgia, serif" }}>
        4. Architecture
      </h2>
      <p>
        Gloam is application-layer privacy on a transparent L2. The design
        target is a shielded balance system in the family of proven EVM privacy
        protocols: commitments, nullifiers, Merkle trees (or equivalent set
        structures), and zero-knowledge proofs that validate state transitions
        without revealing private fields.
      </p>
      <ul className="list-disc space-y-2 pl-5">
        <li>
          <strong className="text-white">Shield</strong> — public tokens enter
          as notes in a private set.
        </li>
        <li>
          <strong className="text-white">Move</strong> — private transfers
          nullify and reissue notes between authorized parties.
        </li>
        <li>
          <strong className="text-white">Trade</strong> — private execution paths
          so intent and size are not free signals on the public book.
        </li>
        <li>
          <strong className="text-white">Exit</strong> — unshield remains a
          deliberate, visible edge when value returns to clear balances.
        </li>
      </ul>
      <p>
        Prefer integrating or porting battle-tested systems over novel circuits
        on day one. Novelty is a cost center until the product is real.
      </p>

      <h2 className="!mt-10 text-2xl text-white" style={{ fontFamily: "var(--font-display), Georgia, serif" }}>
        5. How money is encrypted
      </h2>
      <p>
        Clear value becomes a commitment: ciphertext plus a proof of
        well-formedness. The commitment joins an anonymity set. Transfers spend
        notes by publishing nullifiers and creating new commitments. Only
        holders of the appropriate viewing keys decrypt note contents. The
        explorer sees the skeleton of the protocol. It does not see the flesh of
        the bag.
      </p>
      <p>
        See also:{" "}
        <a href="/encryption" className="text-lime hover:underline">
          How money is encrypted
        </a>
        .
      </p>

      <h2 className="!mt-10 text-2xl text-white" style={{ fontFamily: "var(--font-display), Georgia, serif" }}>
        6. Threat model
      </h2>
      <p>
        Honest cryptography fails under dishonest assumptions. Gloam states its
        limits plainly.
      </p>
      <ul className="list-disc space-y-2 pl-5">
        <li>
          <strong className="text-white">Hidden (goal):</strong> amounts while
          shielded; private transfer graph; trade intent during private
          execution.
        </li>
        <li>
          <strong className="text-white">Visible (edge):</strong> shield and
          unshield on the public chain; contract calls; proof verification.
        </li>
        <li>
          <strong className="text-white">Weak when small:</strong> anonymity set
          size, timing correlation, amount fingerprinting.
        </li>
        <li>
          <strong className="text-white">Out of scope as magic:</strong> device
          malware, coerced keys, legal process off-chain, user operational
          mistakes.
        </li>
      </ul>
      <p>
        Privacy tools reduce public visibility. They do not make anyone
        invisible to the state or to their own carelessness.
      </p>

      <h2 className="!mt-10 text-2xl text-white" style={{ fontFamily: "var(--font-display), Georgia, serif" }}>
        7. Product path
      </h2>
      <ol className="list-decimal space-y-2 pl-5">
        <li>Marketing and docs (live)</li>
        <li>Wallet connect + public path on testnet</li>
        <li>Shield and private transfer vertical slice</li>
        <li>Private trade for allowlisted stock tokens</li>
        <li>Audits, guardrails, anonymity-set health, mainnet gates</li>
      </ol>
      <p>
        No mock private fills. No theatrical dashboards that imply privacy
        where proofs do not exist.
      </p>

      <h2 className="!mt-10 text-2xl text-white" style={{ fontFamily: "var(--font-display), Georgia, serif" }}>
        8. Brand and voice
      </h2>
      <p>
        Black. Lime. White. Serif for weight, grotesk for interface. The tone is
        serious without costume jewelry: theoretical precision over startup
        fog. If a sentence could appear on any crypto landing page, it is wrong
        for Gloam.
      </p>

      <h2 className="!mt-10 text-2xl text-white" style={{ fontFamily: "var(--font-display), Georgia, serif" }}>
        9. Closing
      </h2>
      <p>
        The open ledger will remain. Markets need settlement. What they do not
        need is the automatic confession of every private calculation. Gloam
        exists so that on Robinhood Chain, money can move and trade in a sealed
        chamber — until the holder chooses the light.
      </p>
      <p className="mt-6 font-mono text-xs uppercase tracking-[0.14em] text-lime">
        gloam.trade · docs.gloam.trade · @gloamtrade
      </p>
    </DocShell>
  );
}
