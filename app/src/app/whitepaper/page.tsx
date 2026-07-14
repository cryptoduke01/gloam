import type { Metadata } from "next";
import Link from "next/link";
import { DocsLayout } from "@/components/DocsLayout";

export const metadata: Metadata = {
  title: "Whitepaper",
  description:
    "Gloam whitepaper: Trade Everything on Robinhood Privately — thesis, architecture, threat model, roadmap.",
};

export default function WhitepaperPage() {
  return (
    <DocsLayout
      title="Whitepaper"
      lede="Living document · v0.1. Claims expand only as contracts and audits land."
      glance={[
        { label: "Version", value: "0.1" },
        { label: "Thesis", value: "Private everything" },
        { label: "Chain", value: "Robinhood 4663" },
        { label: "Assets", value: "Stocks · Memes" },
        { label: "Privacy", value: "Shielded set" },
      ]}
      quickLinks={[
        { href: "/docs", label: "Docs home" },
        { href: "/docs/encryption", label: "Encryption path" },
        { href: "/#waitlist", label: "Launch testnet" },
        { href: "https://x.com/gloamtrade", label: "@gloamtrade" },
      ]}
    >
      <p className="!text-sm">
        Status: public draft. Not a promise of mainnet dates.
      </p>

      <h2>1. Thesis</h2>
      <p>
        Onchain finance inherited a strange piety: everything must be visible.
        The ledger that was meant to free money from intermediaries became a
        permanent audience. Traders, funds, and ordinary holders leave a
        continuous autobiography of intent. Bots harvest that autobiography.
        Copy traders reprice it. Enemies map it.
      </p>
      <p>
        Gloam asserts one rule.{" "}
        <strong>Trade Everything on Robinhood Privately.</strong> Stocks. Memes.
        Whatever is liquid on Robinhood Chain. Settlement may remain public.
        Strategy, size, and path need not. Privacy is not a costume. It is the
        sealed chamber beside the open book.
      </p>

      <h2>2. The problem</h2>
      <p>
        Transparent AMMs and wallet intelligence products turned every move
        into content. Large size on a public pool is a confession of urgency.
        Address clustering turns a portfolio into a public dossier. Tokenized
        equities and meme books on Robinhood Chain inherit the same exposure:
        the asset is modern; the privacy model is medieval.
      </p>
      <p>
        Existing retail venues will list stock tokens and chase degen flow.
        They will not ship private balances as product. That gap is Gloam —
        one private venue for everything that settles on Robinhood.
      </p>

      <h2>3. Where we build</h2>
      <p>
        Robinhood Chain (mainnet ID <strong>4663</strong>) is an Arbitrum Orbit
        L2 aimed at financial services and real-world assets — and it is also
        where onchain culture trades. Tokenized equities and meme liquidity
        already live there. Gloam adds a private trading layer: stocks and memes
        on the same rails.
      </p>

      <h2>4. Architecture</h2>
      <p>
        Application-layer privacy on a transparent L2. Design target: shielded
        balances in the family of proven EVM privacy protocols — commitments,
        nullifiers, set structures, and zero-knowledge proofs that validate
        state transitions without revealing private fields.
      </p>
      <ul>
        <li>
          <strong>Shield</strong> — public tokens enter as notes in a private
          set.
        </li>
        <li>
          <strong>Move</strong> — private transfers nullify and reissue notes.
        </li>
        <li>
          <strong>Trade</strong> — private execution so intent and size are not
          free signals.
        </li>
        <li>
          <strong>Exit</strong> — unshield remains a deliberate, visible edge.
        </li>
      </ul>
      <p>
        Prefer integrating or porting battle-tested systems over novel circuits
        on day one.
      </p>

      <h2>5. How money is encrypted</h2>
      <p>
        Clear value becomes a commitment: ciphertext plus a proof of
        well-formedness. The commitment joins an anonymity set. Transfers spend
        notes by publishing nullifiers and creating new commitments. Only
        holders of the appropriate viewing keys decrypt note contents. Detail:{" "}
        <Link href="/docs/encryption">encryption docs</Link>.
      </p>

      <h2>6. Threat model</h2>
      <ul>
        <li>
          <strong>Hidden (goal):</strong> amounts while shielded; private
          transfer graph; trade intent during private execution.
        </li>
        <li>
          <strong>Visible (edge):</strong> shield and unshield; contract calls;
          proof verification.
        </li>
        <li>
          <strong>Weak when small:</strong> anonymity set size, timing
          correlation, amount fingerprinting.
        </li>
        <li>
          <strong>Out of scope as magic:</strong> device malware, coerced keys,
          legal process off-chain, operational mistakes.
        </li>
      </ul>
      <p>
        Privacy tools reduce public visibility. They do not make anyone
        invisible to the state or to their own carelessness.
      </p>

      <h2>7. Product path</h2>
      <ol>
        <li>Marketing and docs (live at gloam.trade)</li>
        <li>Wallet connect + public path on testnet</li>
        <li>Shield and private transfer vertical slice</li>
        <li>Private trade for stock tokens and meme markets</li>
        <li>Audits, guardrails, anonymity-set health, mainnet gates</li>
      </ol>
      <p>
        No mock private fills. No theatrical dashboards that imply privacy
        where proofs do not exist.
      </p>

      <h2>8. Closing</h2>
      <p>
        The open ledger will remain. Markets need settlement. What they do not
        need is the automatic confession of every private calculation. Gloam
        exists so that on Robinhood Chain, money can move and trade in a sealed
        chamber — until the holder chooses the light.
      </p>
      <p className="!font-mono !text-[11px] !uppercase !tracking-[0.14em] !text-lime">
        gloam.trade · /docs · /whitepaper · @gloamtrade
      </p>
    </DocsLayout>
  );
}
