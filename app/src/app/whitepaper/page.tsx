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
      lede="Private money on public chains. The technical and product thesis for Gloam: application-layer privacy on Robinhood Chain, with the same core now live on Tempo testnet."
      glance={[
        { label: "Version", value: "0.4" },
        { label: "Status", value: "Public draft" },
        { label: "Networks", value: "RH 46630 · Tempo 42431 (testnet)" },
        { label: "Live", value: "Shield · send · cash out · proofs" },
        { label: "Private trade", value: "Built, off pending audit" },
        { label: "Mainnet", value: "Not yet" },
      ]}
      quickLinks={[
        { href: "/docs", label: "Documentation" },
        { href: "/app", label: "Testnet app" },
        { href: "https://x.com/gloamtrade", label: "@gloamtrade" },
      ]}
    >
      <div className="rounded-[14px] bg-surface px-5 py-4 text-[14px] leading-relaxed text-mute">
        This document is a living public draft. It describes design targets,
        shipped testnet capability, and intentional non-claims. It is not an
        offer of securities, a guarantee of mainnet timelines, a promise of
        absolute anonymity, or a solicitation to purchase anything.
      </div>

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
        <strong>private money on public chains.</strong>
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
          transactions and the account that submits them (the Gloam relay can
          submit in the user&apos;s place).
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
        (Robinhood Chain), with the same contracts deployed on Tempo, a
        payments-first L1. Settlement finality remains with the chain. Privacy
        is constructed above it via a self-custodial shielded pool, a Merkle
        tree of note commitments, nullifiers to prevent double-spends, and
        on-chain verifiers for zero-knowledge proofs. The pool holds deposits,
        but only a valid proof from the note holder moves them: there is no
        admin withdraw, and rule changes are timelocked (5.5).
      </p>
      <h3>5.2 Core components</h3>
      <ul>
        <li>
          <strong>Client application</strong>, wallet connection, note
          material generation, Merkle path reconstruction from on-chain events,
          browser-side proof generation, notes encrypted at rest, and product
          UX.
        </li>
        <li>
          <strong>ShieldPool (Poseidon)</strong>, holds deposited assets,
          maintains the tree, accepts proof-bound shield deposits, and
          processes transfer and unshield with proof verification. It has no
          admin withdraw.
        </li>
        <li>
          <strong>Hash and tree</strong>, Poseidon-based commitments and a
          depth-20 Merkle structure aligned with circuit constraints.
        </li>
        <li>
          <strong>Circuits</strong>, shield (binds a deposit to its note),
          transfer (private send / split) and unshield (exit), with
          public-input layouts bound to the vault. A sealed-swap circuit for
          private trade is built but switched off. Three more circuits back the
          proofs in 6.1.
        </li>
        <li>
          <strong>Verifiers</strong>, Groth16 verifiers for each on-chain
          circuit. A dual verifier routes transfer and unshield by public-input
          count; deposits use a separate shield verifier.
        </li>
        <li>
          <strong>Memo board</strong>, an encrypted payment-message contract
          that lets a recipient find payments sent to them. It holds no funds.
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
            body: "Holds deposits, Merkle root history, nullifier set, proof-gated payout. No admin withdraw.",
          },
          {
            n: "03",
            title: "Verifier",
            body: "On-chain check of proofs against fixed public inputs.",
          },
          {
            n: "04",
            title: "Circuits",
            body: "Shield, transfer and unshield constraints (Poseidon notes + membership).",
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
          <strong>Shield</strong>, public assets enter the vault with a proof
          that the new commitment encodes exactly the amount and asset
          deposited; the commitment is inserted into the tree.
        </li>
        <li>
          <strong>Transfer (private send)</strong>, spend one note, insert two
          new commitments (payment and change), conserve value for a single
          asset. The payment note is encrypted to the recipient&apos;s Gloam
          address (receive tag) and posted to the memo board, where the
          recipient&apos;s app finds it by scanning. A payment link covers
          people without a Gloam address.
        </li>
        <li>
          <strong>Unshield</strong>, prove ownership of a note and withdraw to
          a public address bound in the proof. Exit is a visible edge.
        </li>
        <li>
          <strong>Prove</strong>, show a named party a balance, a payment
          received, or a payroll total without opening the wallet (6.1).
        </li>
      </ul>
      <h3>5.5 Custody and rule changes</h3>
      <p>
        The pool is self-custodial. No function lets the owner, the team, or
        anyone else withdraw note-backed funds; value leaves only through an
        unshield proof, to the recipient bound in that proof. The owner&apos;s
        one transfer function returns native currency sent to the contract by
        mistake, above what notes back, and cannot reach note-backed funds.
      </p>
      <p>
        The owner wallet can still change rules: swap verifiers, set rates, and
        set oracle feeds. Setup has ended on both live pools, so every such
        change must be queued on-chain and can only run after a public 3-day
        delay. Users see a pending change before it takes effect and can cash
        out first. On testnet the owner is a single wallet; moving it to a
        multisig is an open mainnet decision.
      </p>

      <FlowDiagram
        title="Figure 3, User loop (testnet today)"
        subtitle="Real contracts. No simulated private fills."
        steps={[
          {
            n: "1",
            title: "Connect",
            body: "Wallet on Robinhood Chain (46630) or Tempo (42431) testnet.",
          },
          {
            n: "2",
            title: "Shield",
            body: "Deposit ETH, USDG or faucet stocks (Robinhood Chain), or PathUSD (Tempo), into the vault.",
          },
          {
            n: "3",
            title: "Send or hold",
            body: "Private send splits a note; the payment is sealed to the recipient's Gloam address.",
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
        Circuits are written in Circom 2.1.6, with Poseidon for
        circuit-friendly hashing and Merkle membership. Proofs are Groth16 on
        BN254, generated in the browser with snarkjs 0.7.5 and checked by
        on-chain verifiers. The trusted setup used on testnet is a
        single-contributor dev ceremony: its keys must not be treated as a
        production setup, and a multi-party ceremony is required before
        mainnet.
      </p>
      <p>
        Public-input layouts are versioned. Shield binds commitment, amount,
        and asset. Unshield binds root, nullifier, asset, amount, and
        recipient. Transfer binds root, nullifier, and two new commitments.
        The dual verifier routes transfer and unshield by public-input count.
      </p>
      <p>
        Sealed swap (private trade) binds root, nullifier, two new commitments,
        assets, a public min-out floor, and rate numerators. Its circuit,
        verifier, and oracle-bound rate checks are built and tested, but it is
        switched off: neither live pool has a sealed-swap verifier set, so
        every swap call reverts. It stays off until its solvency accounting is
        redesigned and audited, and any re-enable goes through the 3-day
        timelock.
      </p>
      <p>
        Earlier pools on both chains, including a keccak-based Robinhood Chain
        pool, remain on-chain for history only and are superseded. The product
        path is the Poseidon vault redeployed on 2026-09-29 with shield,
        transfer, and unshield verifiers enabled (dev keys).
      </p>
      <h3>6.1 Proofs shared with others</h3>
      <p>
        Three more circuits back proofs a holder hands to someone else: proof
        of funds (at least an amount across up to four unspent notes, balance
        hidden), proof of payment (a payment received, with the amount shown
        or only a minimum), and a payroll total (a run paid exactly a total in
        a given number of payments). These are verified off-chain, in the
        browser at gloam.trade/verify, against the live vault state. Each one
        (<code>gloamfunds1</code>, <code>gloampay1</code>,{" "}
        <code>gloamroll1</code>) carries a label naming who it is for and an
        expiry, both bound into the proof. The older{" "}
        <code>gloamdisc1</code> balance disclosure reuses the shield circuit
        and carries no recipient label or expiry.
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
          The submitting wallet, when a user sends without the relay. On
          Robinhood Chain the deployed memo board also records who posted each
          memo, so the sender stays off that record only when the relay posts
          it; Tempo&apos;s board does not record the poster.
        </li>
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
        <li>
          Wallet connection restricted to Robinhood Chain testnet and Tempo
          Moderato testnet
        </li>
        <li>Portfolio with wallet balances, shielded balances, and faucet stocks</li>
        <li>Public send and stock token transfer paths</li>
        <li>Shield deposits into the privacy vault</li>
        <li>
          Private send (transfer) and cash-out (unshield) with browser proofs,
          optionally submitted by the Gloam relay so the user&apos;s wallet does
          not appear
        </li>
        <li>
          Receiving by Gloam address (encrypted memos) or payment link, plus
          note import
        </li>
        <li>Private payroll, scheduled payroll, and payment requests</li>
        <li>Proofs of funds, payment, and payroll totals, checked at /verify</li>
        <li>
          Private trade (sealedSwap): built, switched off pending audit. A
          via-market path (cash out, public swap, re-shield) is available where
          a public pool exists, with the swap size public on that edge
        </li>
      </ul>
      <p>
        Documentation and this whitepaper live on the same
        origin (
        <Link href="/docs">/docs</Link>,{" "}
        <Link href="/whitepaper">/whitepaper</Link>
        ). Marketing site and product share one brand: ink, paper, and a single green tint that marks what is private.
      </p>

      <h2 id="roadmap">9. Roadmap</h2>
      <ol>
        <li>
          <strong>Live (testnet):</strong> public path, proof-bound shield,
          unshield, private send with encrypted memos, the Gloam relay,
          payroll, proofs of funds, payment, and payroll totals, the Tempo
          deployment, and pools with no admin withdraw and timelocked rule
          changes.
        </li>
        <li>
          <strong>Built, switched off:</strong> sealed private trade. The
          circuit, verifier, and oracle-bound rates are built and tested; it
          stays off until its solvency accounting is redesigned and audited.
        </li>
        <li>
          <strong>Near term:</strong> stronger public-input privacy; anonymity
          set growth; operational monitoring; encrypting the receive key at
          rest.
        </li>
        <li>
          <strong>Mid term:</strong> deeper liquidity for stocks and memes;
          issuer-scoped disclosure for regulated stablecoins on Tempo.
        </li>
        <li>
          <strong>Production gate:</strong> external review (audits so far are
          internal), a multi-party trusted setup, incident process, mainnet
          only after explicit readiness criteria.
        </li>
      </ol>

      <h2 id="competition">10. Positioning</h2>
      <p>
        Broad privacy protocols target multi-chain or multi-asset general
        privacy. Gloam is intentionally narrow: Robinhood Chain for stocks and
        memes, Tempo for stablecoin payments, product-led vault UX, and an SDK
        and MCP server so other apps and agents can use the same vault.
        Differentiation is venue and distribution
        thesis, not a claim of novel cryptography relative to the broader
        privacy literature.
      </p>

      <h2 id="risks">11. Risks and limitations</h2>
      <ul>
        <li>
          Smart contract and circuit bugs: audits so far are internal, with no
          external audit yet
        </li>
        <li>Development proving keys from a single-contributor dev ceremony</li>
        <li>
          Rule changes, including verifier swaps, by a single owner wallet,
          limited by a public 3-day delay
        </li>
        <li>Browser-local note storage and user operational error</li>
        <li>Regulatory and compliance uncertainty around privacy tools</li>
        <li>Thin anonymity sets in early usage</li>
        <li>L2 and bridge operational risk of the underlying chain</li>
      </ul>

      <h2 id="non-claims">12. Explicit non-claims</h2>
      <p>
        Gloam does not claim mainnet readiness, an external audit, insurance of
        funds, legal immunity, or invisibility from investigation. Testnet
        assets have no
        real-world value. Nothing in this paper is investment advice.
      </p>

      <h2 id="closing">13. Closing</h2>
      <p>
        Settlement will remain public. Strategy need not. Gloam builds the
        sealed chamber beside the open book on Robinhood Chain, so holders can
        shield, move, and eventually trade without printing every private
        calculation to the street.
      </p>
      <div className="t-label pt-4">gloam.trade · testnet · hello@gloam.trade · @gloamtrade</div>
    </DocsLayout>
  );
}
