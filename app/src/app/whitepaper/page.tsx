import type { Metadata } from "next";
import Link from "next/link";
import { DocsLayout } from "@/components/DocsLayout";
import { FlowDiagram, PoolPicture } from "@/components/docs/FlowDiagram";

export const metadata: Metadata = {
  title: "Whitepaper",
  description:
    "Gloam whitepaper: private money and trading infrastructure on Robinhood Chain, thesis, architecture, cryptography, threat model, and roadmap.",
};

export default function WhitepaperPage() {
  return (
    <DocsLayout
      title="Whitepaper"
      lede="Trade Everything on Robinhood Privately. Technical and product thesis for Gloam, application-layer privacy on Robinhood Chain."
      glance={[
        { label: "Version", value: "0.3" },
        { label: "Status", value: "Public draft" },
        { label: "Network", value: "RH testnet 46630" },
        { label: "Live", value: "Shield · send · unshield" },
        { label: "Token", value: "$GLOAM · not live" },
        { label: "Mainnet", value: "Not yet" },
      ]}
      quickLinks={[
        { href: "/docs", label: "Documentation" },
        { href: "/app", label: "Testnet app" },
        { href: "https://x.com/gloamtrade", label: "@gloamtrade" },
      ]}
    >
      <p className="!text-sm !text-mute">
        This document is a living public draft. It describes design targets,
        shipped testnet capability, and intentional non-claims. It is not an
        offer of securities, a guarantee of mainnet timelines, a promise of
        absolute anonymity, or a solicitation to purchase tokens. Official{" "}
        $GLOAM status is announced through official channels only.
      </p>

      <h2 id="abstract">1. Abstract</h2>
      <p>
        Public blockchains made settlement programmable and verifiable. They also
        made financial activity permanently legible. Wallet graphs, size, and
        timing form a continuous record of intent, legible to bots, competitors,
        counterparties, and anyone with an explorer.
      </p>
      <p>
        Gloam is private money infrastructure for Robinhood Chain: an
        application-layer vault in which assets can be held and transferred with
        reduced public visibility, and a path toward private trading of stocks
        and memes on the same rails. The product thesis is a single sentence:{" "}
        <strong>Trade Everything on Robinhood Privately.</strong>
      </p>
      <p>
        Privacy on a transparent L2 is not the absence of transactions from
        explorers. It is the separation of <em>settlement visibility</em> from{" "}
        <em>strategy visibility</em>. Shield and unshield remain deliberate public
        edges. While assets remain inside the shielded set, amounts and internal
        transfer relationships are designed not to appear as a simple public
        balance sheet for a single address.
      </p>

      <h2 id="problem">2. Problem</h2>
      <h3>2.1 Transparent finance as confession</h3>
      <p>
        Open ledgers encode desire. A large swap is a signal of urgency. A
        repeated pattern of buys is a dossier. Address clustering tools turn a
        portfolio into a public narrative. For funds, market makers, and
        sophisticated retail, this is not a feature, it is adverse selection
        priced into every interaction.
      </p>
      <h3>2.2 Tokenized equities inherit the same exposure</h3>
      <p>
        Robinhood Chain positions itself as infrastructure for financial
        services and real-world assets. Tokenized stocks and high-velocity meme
        markets already coexist there. Without application-layer privacy, both
        inherit the same open-book problem: modern assets on medieval privacy
        assumptions.
      </p>
      <h3>2.3 Venue gap</h3>
      <p>
        Retail and institutional venues will list stock tokens and chase
        cultural liquidity. Few will treat private balances and private flow as
        core product. Gloam targets that gap: one private venue for everything
        that settles on Robinhood Chain, equities for size and legitimacy, memes
        for volume and urgency, same cryptographic rails.
      </p>

      <h2 id="thesis">3. Thesis and principles</h2>
      <p>
        Gloam asserts that private hold, private move, and private trade are
        first-class product requirements for serious on-chain markets, not
        optional skins on a public DEX.
      </p>
      <ul>
        <li>
          <strong>Honesty over theater.</strong> No mock private success. Claims
          expand only as contracts, circuits, and audits support them.
        </li>
        <li>
          <strong>Battle-tested patterns.</strong> Commitments, nullifiers,
          Merkle membership, and zero-knowledge proofs, not novel cryptography
          invented for a launch tweet.
        </li>
        <li>
          <strong>Edges are real.</strong> Entering and leaving the vault is
          visible. Privacy tools reduce public visibility; they do not erase the
          physical world, legal process, or operator error.
        </li>
        <li>
          <strong>Testnet until ready.</strong> Production capital requires
          production ceremonies, reviews, and operational maturity.
        </li>
      </ul>

      <h2 id="privacy-myth">4. What “privacy” means here</h2>
      <p>
        A common misconception is that private transactions leave no footprint
        on a block explorer. That is not how application-layer privacy on a
        public chain works.
      </p>
      <ul>
        <li>
          <strong>Visible by design:</strong> that the vault contract was used;
          shield (deposit) and unshield (withdrawal) events; proof verification
          transactions.
        </li>
        <li>
          <strong>Hidden by design (goal):</strong> amounts while shielded;
          the internal transfer graph between notes; trade intent during private
          execution (roadmap).
        </li>
        <li>
          <strong>Degraded when the set is small:</strong> timing and size
          correlation; thin anonymity sets.
        </li>
      </ul>
      <p>
        Private send does not mean “nothing on the explorer.” It means the
        public record does not present a simple Alice→Bob amount story for value
        that stays inside the vault.
      </p>

      <PoolPicture title="Figure 1, Wallet, vault, and exit" />

      <h2 id="architecture">5. System architecture</h2>
      <h3>5.1 Placement</h3>
      <p>
        Gloam is an application-layer privacy system on a transparent L2
        (Robinhood Chain). Settlement finality remains with the chain. Privacy
        is constructed above it via a custodial shielded pool, a Merkle tree of
        note commitments, nullifiers to prevent double-spends, and on-chain
        verifiers for zero-knowledge proofs.
      </p>
      <h3>5.2 Core components</h3>
      <ul>
        <li>
          <strong>Client application</strong>, wallet connection, note
          material generation, Merkle path reconstruction from on-chain events,
          browser-side proof generation, and product UX.
        </li>
        <li>
          <strong>ShieldPool (Poseidon)</strong>, holds assets, maintains the
          tree, accepts shield deposits, processes transfer and unshield with
          proof verification.
        </li>
        <li>
          <strong>Hash and tree</strong>, Poseidon-based commitments and
          Merkle structure aligned with circuit constraints.
        </li>
        <li>
          <strong>Circuits</strong>, unshield (exit) and transfer (private
          send / split) with public-input layouts bound to the vault.
        </li>
        <li>
          <strong>Verifiers</strong>, Groth16 verifiers for each circuit,
          multiplexed so a single pool verifier can route by public-input arity.
        </li>
      </ul>

      <FlowDiagram
        title="Figure 2, Component sketch"
        steps={[
          {
            n: "01",
            title: "Client",
            body: "Wallet UI, local note secrets, proof generation in the browser.",
          },
          {
            n: "02",
            title: "Pool",
            body: "Custody, Merkle root history, nullifier set, payout path.",
          },
          {
            n: "03",
            title: "Verifier",
            body: "On-chain check of proofs against fixed public inputs.",
          },
          {
            n: "04",
            title: "Circuits",
            body: "Unshield and transfer constraints (Poseidon notes + membership).",
          },
        ]}
      />

      <h3>5.3 Note scheme</h3>
      <p>
        A shielded note binds a secret, amount, and asset into a commitment.
        Nullifiers are derived so that spending a note can be recorded without
        reusing it. Exact field hashes and layouts are implemented in circuit
        source and client libraries and must stay aligned across releases.
      </p>
      <h3>5.4 Actions</h3>
      <ul>
        <li>
          <strong>Shield</strong>, public assets enter the vault; a commitment
          is inserted into the tree.
        </li>
        <li>
          <strong>Transfer (private send)</strong>, spend one note, insert two
          new commitments (payment and change), conserve value for a single
          asset. The payment secret is conveyed out-of-band (import package) on
          testnet.
        </li>
        <li>
          <strong>Unshield</strong>, prove ownership of a note and withdraw to
          a public address. Exit is a visible edge.
        </li>
      </ul>

      <FlowDiagram
        title="Figure 3, User loop (testnet today)"
        subtitle="Real contracts. No simulated private fills."
        steps={[
          {
            n: "1",
            title: "Connect",
            body: "Wallet on Robinhood Chain testnet (46630).",
          },
          {
            n: "2",
            title: "Shield",
            body: "Deposit ETH or faucet stock tokens into the privacy vault.",
          },
          {
            n: "3",
            title: "Send or hold",
            body: "Private send splits a note; secrets for payment notes are shared carefully off-app.",
          },
          {
            n: "4",
            title: "Unshield",
            body: "Prove and cash out to a normal wallet when ready.",
          },
        ]}
      />

      <h2 id="cryptography">6. Cryptography and verification</h2>
      <p>
        Circuits are implemented with Poseidon for circuit-friendly hashing and
        Merkle membership. Proofs are Groth16 in the current testnet stack.
        Verification keys and ceremonies used on testnet are development-grade
        and must not be treated as production toxic-waste-free setups.
      </p>
      <p>
        Public-input layouts are versioned. Unshield binds root, nullifier,
        asset, amount, and recipient. Transfer binds root, nullifier, and two
        new commitments. Sealed swap binds root, nullifier, two new commitments,
        assets, a public min-out floor, and fixed rate numerators, the app
        defaults min-out to a floor so trade size is not printed as min-out.
        The dual verifier routes transfer/unshield by public-input length; sealed
        swap uses a dedicated verifier on the sealed vault.
      </p>
      <p>
        An earlier keccak-based pool remains on testnet for historical deposits
        only. The product path is the sealed Poseidon vault with unshield,
        transfer, and sealed-swap verifiers enabled (dev keys).
      </p>

      <h2 id="threat">7. Threat model</h2>
      <h3>7.1 In scope (design goals)</h3>
      <ul>
        <li>Observer reading a single address balance while assets are shielded</li>
        <li>
          Simple public reconstruction of internal note-to-note payment graphs
          (as anonymity set grows)
        </li>
        <li>Double-spend of the same note (nullifiers)</li>
      </ul>
      <h3>7.2 Edges and residual leakage</h3>
      <ul>
        <li>Shield and unshield amounts and timing on the public chain</li>
        <li>RPC and network metadata if clients are careless</li>
        <li>
          Correlation attacks when few users participate or amounts are unique
        </li>
      </ul>
      <h3>7.3 Out of scope as “solved by crypto alone”</h3>
      <ul>
        <li>Device malware, phishing, and coerced key disclosure</li>
        <li>Legal process and off-chain identity linkage</li>
        <li>User deletion of local note material without backup</li>
        <li>Absolute anonymity against nation-state adversaries</li>
      </ul>

      <h2 id="product">8. Product surface</h2>
      <p>
        The testnet application at{" "}
        <Link href="/app">gloam.trade/app</Link> provides:
      </p>
      <ul>
        <li>Wallet connection restricted to Robinhood Chain testnet</li>
        <li>Portfolio with wallet ETH, shielded balances, and faucet stocks</li>
        <li>Public send and stock token transfer paths</li>
        <li>Shield deposits into the privacy vault</li>
        <li>Private send (transfer) and cash-out (unshield) with browser proofs</li>
        <li>Note import for payment packages received off-app</li>
        <li>
          Private trade (sealedSwap): vault ETH → vault stock with size privacy
          defaults; via-market adapter when a public pool exists
        </li>
      </ul>
      <p>
        Documentation and this whitepaper live on the same
        origin (
        <Link href="/docs">/docs</Link>,{" "}
        <Link href="/whitepaper">/whitepaper</Link>
        ). Marketing site and product share branding: black, lime, white.
      </p>

      <h2 id="token">9. $GLOAM (protocol asset)</h2>
      <p>
        Gloam reserves the ticker <strong>$GLOAM</strong> as a future
        coordination asset for the private rails on Robinhood Chain. Status is stated
        honestly: <strong>not launched</strong>. There is no tradable contract
        address until product, trust (audits / production keys), and utility
        design gates are closed.
      </p>
      <p>
        Planned roles are design targets only: protocol alignment, fee or access
        economics once mainnet volume is real, parameter voice after audits, and
        ecosystem gravity for partners and builders. This whitepaper does not
        define supply, unlocks, or distribution. Those details will be published
        before any mint. The vault, private pay, and sealed trade
        paths are useful without a token.
      </p>
      <p>
        This section is not an offer of securities or a solicitation to purchase
        tokens. Do not trust contract addresses from unsolicited messages.
      </p>

      <h2 id="roadmap">10. Roadmap</h2>
      <ol>
        <li>
          <strong>Complete (testnet):</strong> public path, shield, unshield,
          private send, sealed private trade (size privacy on by default),
          dual/sealed verifiers, client proofs.
        </li>
        <li>
          <strong>Near term:</strong> stronger public-input privacy; anonymity
          set growth; operational monitoring; inventory ops.
        </li>
        <li>
          <strong>Mid term:</strong> oracle-bound rates; deeper liquidity for
          stocks and memes; multi-chain expansion after RH rails are solid.
        </li>
        <li>
          <strong>Production gate:</strong> independent review, production
          trusted setup or equivalent, incident process, mainnet only after
          explicit readiness criteria.
        </li>
        <li>
          <strong>$GLOAM:</strong> publish utility and supply,
          then deploy only after the above
          gates, not as a substitute for shipping privacy.
        </li>
      </ol>

      <h2 id="competition">11. Positioning</h2>
      <p>
        Broad privacy protocols target multi-chain or multi-asset general
        privacy. Gloam is intentionally narrow: Robinhood Chain, stocks and
        memes, product-led vault UX. Differentiation is venue and distribution
        thesis, not a claim of novel cryptography relative to the broader
        privacy literature.
      </p>

      <h2 id="risks">12. Risks and limitations</h2>
      <ul>
        <li>Smart contract and circuit bugs prior to audit</li>
        <li>Development proving keys on testnet</li>
        <li>Browser-local note storage and user operational error</li>
        <li>Regulatory and compliance uncertainty around privacy tools</li>
        <li>Thin anonymity sets in early usage</li>
        <li>L2 and bridge operational risk of the underlying chain</li>
        <li>
          Premature or unofficial “$GLOAM” contracts, only trust
          official channels
        </li>
      </ul>

      <h2 id="non-claims">13. Explicit non-claims</h2>
      <p>
        Gloam does not claim mainnet readiness, insurance of funds, legal
        immunity, or invisibility from investigation. Testnet assets have no
        real-world value. Nothing in this paper is investment advice.{" "}
        $GLOAM is not live; this paper is not a token
        sale.
      </p>

      <h2 id="closing">14. Closing</h2>
      <p>
        Settlement will remain public. Strategy need not. Gloam builds the
        sealed chamber beside the open book on Robinhood Chain, so holders can
        shield, move, and eventually trade without printing every private
        calculation to the street.
      </p>
      <p className="!!text-[11px] !uppercase !tracking-[0.14em] !text-lime">
        gloam.trade · testnet · @gloamtrade
      </p>
    </DocsLayout>
  );
}
