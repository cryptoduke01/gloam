import type { Metadata } from "next";
import Link from "next/link";
import { DocsLayout } from "@/components/DocsLayout";
import { FlowDiagram, PoolPicture } from "@/components/docs/FlowDiagram";

export const metadata: Metadata = {
  title: "Whitepaper",
  description:
    "Gloam whitepaper — private trading on Robinhood Chain, explained simply. What works today, what does not.",
};

export default function WhitepaperPage() {
  return (
    <DocsLayout
      title="Whitepaper"
      lede="v0.2 · Living draft. Written for humans first. Technical details only where they matter."
      glance={[
        { label: "Version", value: "0.2" },
        { label: "Chain", value: "RH testnet 46630" },
        { label: "Live", value: "Shield + unshield" },
        { label: "Assets", value: "ETH · stocks" },
        { label: "Status", value: "Testnet" },
      ]}
      quickLinks={[
        { href: "/app", label: "Open app" },
        { href: "/docs", label: "Docs" },
        { href: "/docs/encryption", label: "How shield works" },
        { href: "https://x.com/gloamtrade", label: "@gloamtrade" },
      ]}
    >
      <p className="!text-sm">
        <strong className="text-foreground">Plain English:</strong> Gloam lets
        you park money in a shared vault on Robinhood Chain so your open wallet
        balance is not the whole story. Today on <strong>testnet</strong> you can
        put ETH (and faucet stocks) in, and take them out with a real proof.
        Private send-to-someone-else is next.
      </p>

      <h2>1. The idea</h2>
      <p>
        Public blockchains show almost everything. If someone knows your
        address, they can watch what you hold and when you move it.
      </p>
      <p>
        Gloam&apos;s goal is simple:{" "}
        <strong>Trade everything on Robinhood privately</strong> — stocks,
        memes, whatever settles on that chain — without turning every move into
        a public confession.
      </p>

      <h2>2. Why it matters</h2>
      <p>
        Size and timing are signals. Bots and copy-traders read public wallets.
        Tokenized stocks and meme markets on Robinhood Chain inherit the same
        problem: modern assets, old privacy model.
      </p>
      <p>
        We are not claiming invisibility from the law or from your own mistakes.
        We are building a product layer where balances can sit and (soon) move
        without the open tape showing every detail.
      </p>

      <h2>3. How it works (picture)</h2>
      <PoolPicture />
      <FlowDiagram
        title="The loop you can run today"
        subtitle="Testnet · real contracts · no fake success screens"
        steps={[
          {
            n: "01",
            title: "Wallet",
            body: "You hold testnet ETH (or faucet stock tokens) in a normal wallet.",
          },
          {
            n: "02",
            title: "Shield",
            body: "You deposit into Gloam’s pool. The chain records a deposit; you keep a private note in your browser.",
          },
          {
            n: "03",
            title: "Prove",
            body: "When you want out, your browser builds a math proof that you own a valid note — without pasting the secret on-chain.",
          },
          {
            n: "04",
            title: "Unshield",
            body: "The pool checks the proof and sends the asset back to your wallet. Exit is public; that is intentional.",
          },
        ]}
      />

      <h2>4. Words we use (and what they mean)</h2>
      <ul>
        <li>
          <strong>Shield</strong> — put money into the Gloam vault.
        </li>
        <li>
          <strong>Note</strong> — your private claim that some of the vault is
          yours (saved in this browser when you deposit).
        </li>
        <li>
          <strong>Unshield</strong> — take money back out to a normal wallet.
        </li>
        <li>
          <strong>Pool</strong> — the smart contract that holds everyone’s
          shielded deposits together.
        </li>
        <li>
          <strong>Proof</strong> — a short cryptographic certificate that a
          deposit is valid, without revealing your secret.
        </li>
      </ul>
      <p>
        You do not need those words to use the app. They exist so builders can
        talk precisely.
      </p>

      <h2>5. What is live (testnet)</h2>
      <ul>
        <li>Wallet connect on Robinhood Chain testnet (chain ID 46630)</li>
        <li>Portfolio, send ETH, send faucet stock tokens, markets</li>
        <li>
          <strong>Shield</strong> ETH and stocks into the Poseidon pool
        </li>
        <li>
          <strong>Unshield</strong> with a real zero-knowledge proof in the
          browser
        </li>
      </ul>
      <p>
        Product:{" "}
        <Link href="/app">gloam.trade/app</Link>. This is testnet money only.
      </p>

      <h2>6. What is not live yet</h2>
      <ul>
        <li>Private send from one person to another (inside the vault)</li>
        <li>Private trading (swap without showing size on the open book)</li>
        <li>Mainnet / real money</li>
        <li>Production security ceremony for the proving keys</li>
      </ul>
      <p>
        We will not show a “private success” screen until those paths are real.
      </p>

      <h2>7. Architecture (for builders)</h2>
      <p>
        Application privacy on a transparent L2: a custody pool, a Merkle tree of
        note commitments, nullifiers to stop double-spends, and a verifier that
        checks proofs for unshield. Notes bind amount and asset. Today’s live
        path uses a Poseidon tree and circuit pair; an earlier keccak pool remains
        for history only.
      </p>
      <p>
        Prefer proven patterns (commitments, nullifiers, Merkle roots, ZK
        proofs) over invented cryptography.
      </p>
      <FlowDiagram
        title="System sketch"
        steps={[
          {
            n: "A",
            title: "App",
            body: "Wallet UI, note storage in the browser, builds proofs.",
          },
          {
            n: "B",
            title: "Pool contract",
            body: "Holds assets, stores the tree root, pays out on valid unshield.",
          },
          {
            n: "C",
            title: "Verifier",
            body: "On-chain check that a proof matches public inputs.",
          },
          {
            n: "D",
            title: "Circuit",
            body: "Math rules: open note, check tree membership, derive nullifier.",
          },
        ]}
      />

      <h2>8. Honesty about privacy</h2>
      <ul>
        <li>
          <strong>Hidden (goal):</strong> what you hold while it is shielded;
          later, private transfer graph.
        </li>
        <li>
          <strong>Still visible:</strong> when you enter or exit the vault;
          that you used the contract at all.
        </li>
        <li>
          <strong>Weak when small:</strong> few users means weaker privacy set.
        </li>
        <li>
          <strong>Not magic:</strong> malware, lost keys, or legal process are
          outside the product.
        </li>
      </ul>

      <h2>9. Roadmap</h2>
      <ol>
        <li>
          <strong>Done:</strong> testnet app, shield, unshield with real proofs
        </li>
        <li>
          <strong>Next:</strong> private move between notes; clearer product
          language everywhere
        </li>
        <li>Private trade for stock tokens and memes</li>
        <li>Audits, production keys, mainnet only when ready</li>
      </ol>

      <h2>10. Closing</h2>
      <p>
        The open ledger will stay — markets need settlement. They do not need
        every private calculation on a billboard. Gloam is the sealed chamber
        beside that book.
      </p>
      <p className="!font-mono !text-[11px] !uppercase !tracking-[0.14em] !text-lime">
        gloam.trade · /docs · /whitepaper · @gloamtrade
      </p>
    </DocsLayout>
  );
}
