import type { Metadata } from "next";
import Link from "next/link";
import { DocsLayout } from "@/components/DocsLayout";
import { FlowDiagram } from "@/components/docs/FlowDiagram";
import { FAUCET_BLURB, FAUCET_URL } from "@/lib/faucet";

export const metadata: Metadata = {
  title: "Testnet guide",
  description:
    "Full Gloam public testnet guide — wallet setup, faucet, shield, private pay, cash out, trade, demo video, and troubleshooting on Robinhood Chain.",
};

export default function DocsTestnetPage() {
  return (
    <DocsLayout
      title="Testnet guide"
      lede="Everything you need to use Gloam on Robinhood Chain testnet — from wallet setup to private pay. Bookmark this page for launch day."
      glance={[
        { label: "App", value: "/app" },
        { label: "Chain ID", value: "46630" },
        { label: "Network", value: "RH testnet" },
        { label: "Vault", value: "Sealed live" },
        { label: "Keys", value: "Dev ceremony" },
        { label: "Value", value: "Play money only" },
      ]}
      quickLinks={[
        { href: "/app", label: "Open testnet app" },
        { href: "/app/trade?path=sealed", label: "Private trade" },
        { href: "/docs/sealed-trade", label: "Sealed trade docs" },
        { href: "/docs/privacy-model", label: "Privacy model" },
        { href: "https://x.com/gloamtrade", label: "@gloamtrade" },
      ]}
    >
      <p className="!text-sm !text-mute">
        Testnet is experimental. Assets have no real-world value. Development
        proving keys are used. Do not use real funds or treat this as a security
        audit. For product status, see{" "}
        <Link href="/docs/product">what ships when</Link>.
      </p>

      <h2 id="demo">Demo video</h2>
      <p>
        X does not offer a site embed for posts, so the walkthrough opens in a
        new tab on X. Watch the demo, then follow the steps below on testnet.
      </p>
      <div className="not-prose my-6 overflow-hidden rounded-xl border border-line bg-panel">
        <div className="flex flex-col items-start gap-3 px-6 py-8 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-lime">
              Demo on X
            </p>
            <p className="mt-2 max-w-md text-sm text-mute">
              Shield → private pay → cash out walkthrough (posted by the team).
            </p>
          </div>
          <a
            href="https://x.com/dukedotsol/status/2077117792520634789"
            target="_blank"
            rel="noreferrer"
            className="inline-flex min-h-11 shrink-0 items-center rounded-md bg-lime px-5 text-sm font-semibold text-black hover:opacity-90"
          >
            Watch demo on X →
          </a>
        </div>
      </div>
      <p className="!text-sm !text-mute">
        Also follow{" "}
        <a
          href="https://x.com/gloamtrade"
          target="_blank"
          rel="noreferrer"
        >
          @gloamtrade
        </a>{" "}
        for go-live updates.
      </p>

      <h2 id="what-you-get">What you can do on testnet</h2>
      <FlowDiagram
        title="Core loop"
        steps={[
          {
            n: "1",
            title: "Connect",
            body: "Wallet on Robinhood Chain testnet (chain ID 46630).",
          },
          {
            n: "2",
            title: "Faucet",
            body: "Claim testnet ETH + sample stock tokens from the official faucet.",
          },
          {
            n: "3",
            title: "Shield",
            body: "Deposit into the Gloam vault. Commitment goes on-chain; amount is not a public balance on your address.",
          },
          {
            n: "4",
            title: "Private rails",
            body: "Private send (Move) and private trade (size privacy on). Cash out only when you want a public exit.",
          },
          {
            n: "5",
            title: "Trade paths",
            body: "Prefer Private trade (no DEX). Via market needs a pool. Wallet path is fully public.",
          },
        ]}
      />

      <h2 id="before-you-start">Before you start</h2>
      <ul>
        <li>
          A browser wallet (MetaMask, Rabby, or similar) that can add custom
          EVM networks.
        </li>
        <li>
          Desktop or laptop recommended for first proofs (browser proving can
          take tens of seconds).
        </li>
        <li>
          Optional: second wallet or a friend to receive a private payment.
        </li>
        <li>
          Follow{" "}
          <a
            href="https://x.com/gloamtrade"
            target="_blank"
            rel="noreferrer"
          >
            @gloamtrade
          </a>{" "}
          for open time, incidents, and demo clips.
        </li>
      </ul>

      <h2 id="network">1. Add Robinhood Chain testnet</h2>
      <p>
        Open{" "}
        <Link href="/app">
          <strong>/app</strong>
        </Link>
        , click <strong>Connect wallet</strong>, then use{" "}
        <strong>Add / switch RH testnet</strong> if the wallet is on the wrong
        chain. Gloam targets:
      </p>
      <ul>
        <li>
          <strong>Chain ID</strong> — <code>46630</code>
        </li>
        <li>
          <strong>Name</strong> — Robinhood Chain Testnet
        </li>
        <li>
          <strong>RPC</strong> —{" "}
          <code>https://rpc.testnet.chain.robinhood.com</code>
        </li>
        <li>
          <strong>Explorer</strong> —{" "}
          <a
            href="https://explorer.testnet.chain.robinhood.com"
            target="_blank"
            rel="noreferrer"
          >
            explorer.testnet.chain.robinhood.com
          </a>
        </li>
        <li>
          <strong>Native currency</strong> — ETH (testnet only)
        </li>
      </ul>
      <p>
        Official chain docs:{" "}
        <a
          href="https://docs.robinhood.com/chain/"
          target="_blank"
          rel="noreferrer"
        >
          docs.robinhood.com/chain
        </a>
        . More network context:{" "}
        <Link href="/docs/chain">Robinhood Chain in Gloam docs</Link>.
      </p>

      <h2 id="faucet">2. Get testnet funds (faucet)</h2>
      <p>{FAUCET_BLURB}</p>
      <ul>
        <li>
          Faucet:{" "}
          <a href={FAUCET_URL} target="_blank" rel="noreferrer">
            {FAUCET_URL}
          </a>
        </li>
        <li>Connect the same address you use in Gloam.</li>
        <li>
          Claim testnet ETH for gas and sample stock tokens (e.g. TSLA, AMZN
          test assets) when offered.
        </li>
        <li>Typical limit: once per 24 hours — plan your demo flow.</li>
      </ul>
      <p>
        After claiming, open <Link href="/app">Portfolio</Link> and confirm ETH
        + stock balances appear.
      </p>

      <h2 id="portfolio">3. Portfolio at a glance</h2>
      <p>
        <Link href="/app">/app</Link> shows:
      </p>
      <ul>
        <li>
          <strong>Open wallet</strong> — public balances on RH testnet.
        </li>
        <li>
          <strong>Vault (private)</strong> — notes you control locally after
          shield / private receive. Back up notes in Settings if prompted.
        </li>
        <li>
          <strong>Stocks / markets</strong> — discovery; not all pairs have deep
          DEX liquidity on testnet.
        </li>
      </ul>
      <p>
        Local notes live in the browser. Clearing site data can lose notes
        unless you exported a backup.
      </p>

      <h2 id="shield">4. Shield (deposit into the vault)</h2>
      <ol>
        <li>
          Go to <Link href="/app/shield">Shield</Link>.
        </li>
        <li>Pick ETH or a faucet stock token and a small amount.</li>
        <li>
          Confirm the wallet transaction. A <strong>Shielded</strong> event is
          written on-chain with a commitment (not your full private state).
        </li>
        <li>
          Wait for success. Portfolio vault balance updates; open wallet
          balance decreases.
        </li>
      </ol>
      <p>
        Details: <Link href="/docs/encryption">How shield works</Link> and{" "}
        <Link href="/docs/privacy-model">what stays private</Link>.
      </p>

      <h2 id="private-pay">5. Private pay (send inside the vault)</h2>
      <ol>
        <li>
          Open <Link href="/app/move">Move</Link> → private send.
        </li>
        <li>
          Choose a vault note and amount. Prefer leaving a small change note
          when the UI offers it.
        </li>
        <li>
          Generate or paste a receive tag / contact if the UI asks for a
          recipient package path.
        </li>
        <li>
          Browser builds a ZK proof (can take a while — keep the tab open).
        </li>
        <li>Confirm the on-chain transfer transaction.</li>
        <li>
          Share the <strong>payment code / package</strong> with the recipient
          off-app (or via the share UI). Optional passphrase lock if offered.
        </li>
        <li>
          Recipient: import the package in Move / receive flow so their vault
          shows the note.
        </li>
      </ol>
      <p>
        Deeper docs: <Link href="/docs/private-pay">Private pay</Link>.
      </p>

      <h2 id="cash-out">6. Cash out (unshield)</h2>
      <ol>
        <li>
          <Link href="/app/move">Move</Link> → cash out / unshield.
        </li>
        <li>Select a note and confirm.</li>
        <li>Wait for the browser proof, then confirm the wallet tx.</li>
        <li>
          Funds return to your open wallet on RH testnet. That edge is{" "}
          <strong>public</strong> (amount and destination appear on explorers).
        </li>
      </ol>

      <h2 id="trade">7. Trade paths</h2>
      <ul>
        <li>
          <strong>Private trade (preferred)</strong> —{" "}
          <Link href="/app/trade?path=sealed">Trade → Private</Link>. Vault ETH
          → vault stock. Size privacy on by default (min-out floor). No DEX
          pool required. See{" "}
          <Link href="/docs/sealed-trade">sealed trade</Link>.
        </li>
        <li>
          <strong>Wallet</strong> — public swaps / transfers from the open
          wallet when a pool exists.
        </li>
        <li>
          <strong>Via market</strong> — cash out → public swap → re-shield. Size
          is public on the swap edge. Many faucet pairs have empty pools; use
          Private instead.
        </li>
      </ul>

      <h2 id="private-trade">7b. Private trade walkthrough</h2>
      <ol>
        <li>
          <Link href="/app/shield">Shield ETH</Link> (not only stock tokens).
        </li>
        <li>
          Open{" "}
          <Link href="/app/trade?path=sealed">Trade → Private</Link> and pick
          TSLA / AMZN / etc.
        </li>
        <li>
          Leave <strong>Max size privacy</strong> on. Enter amount or Max →
          prove → confirm wallet.
        </li>
        <li>
          Explorer shows a vault <code>sealedSwap</code>, not a Uniswap fill.
          Cash out later publishes amount — stay in vault to stay private.
        </li>
      </ol>

      <h2 id="settings">8. Settings & backups</h2>
      <ul>
        <li>
          <Link href="/app/settings">Settings</Link> — note backup (optional
          lock), trading prefs, diagnostics.
        </li>
        <li>
          Export / import before clearing cache or switching browsers.
        </li>
        <li>
          Dev proving keys: proofs are for testnet only, not production
          ceremony keys. See{" "}
          <Link href="/docs/production">production gate</Link>.
        </li>
      </ul>

      <h2 id="checklist">Launch-day checklist</h2>
      <ol>
        <li>Wallet on chain ID 46630</li>
        <li>Faucet ETH (+ stocks if needed)</li>
        <li>Shield a small amount of ETH</li>
        <li>Private trade (size privacy on) → explorer sealedSwap</li>
        <li>Private send to yourself or a friend + import package</li>
        <li>Optional: cash out dust once (public amount — intentional)</li>
        <li>Export note backup (Settings)</li>
        <li>
          Report bugs via{" "}
          <a
            href="https://x.com/gloamtrade"
            target="_blank"
            rel="noreferrer"
          >
            @gloamtrade
          </a>{" "}
          (include explorer tx hash, not seed phrases)
        </li>
      </ol>

      <h2 id="troubleshooting">Troubleshooting</h2>
      <ul>
        <li>
          <strong>Wrong network</strong> — use Add / switch RH testnet; chain
          ID must be 46630.
        </li>
        <li>
          <strong>Proof stuck / failed</strong> — reload, try a smaller note,
          use a stronger machine, ensure only one tab is proving.
        </li>
        <li>
          <strong>Root / tree mismatch</strong> — wait a few seconds and retry;
          another user may have inserted leaves. Refresh the app.
        </li>
        <li>
          <strong>No vault balance after shield</strong> — confirm tx success on
          explorer; hard-refresh; check you did not clear site data mid-flow.
        </li>
        <li>
          <strong>Payment not showing for recipient</strong> — they must import
          the package; sender still has spent nullifier so resending the same
          note fails.
        </li>
        <li>
          <strong>No DEX pool for stock</strong> — testnet liquidity is thin;
          use ETH pairs or private trade paths when available.
        </li>
        <li>
          <strong>RPC rate limits</strong> — wait and retry; public RH RPC is
          shared.
        </li>
        <li>
          <strong>App shows countdown</strong> — public open is timed; follow
          @gloamtrade or read this guide until unlock. Founders may use early
          access if issued.
        </li>
      </ul>

      <h2 id="safety">Safety & non-claims</h2>
      <ul>
        <li>No mainnet funds. No investment advice.</li>
        <li>
          Privacy tools reduce public visibility; they do not make you invisible
          to law enforcement or fix bad OPSEC.
        </li>
        <li>
          Shield / unshield edges are visible on explorers. Internal transfers
          depend on anonymity set size.
        </li>
        <li>
          $GLOAM is not required to use the testnet. Token status:{" "}
          <Link href="/token">/token</Link> (docs / whitepaper only for detail).
        </li>
      </ul>

      <h2 id="next">Read next</h2>
      <ul>
        <li>
          <Link href="/app">Open the testnet app</Link>
        </li>
        <li>
          <Link href="/docs/encryption">How shield works</Link>
        </li>
        <li>
          <Link href="/docs/private-pay">Private pay</Link>
        </li>
        <li>
          <Link href="/docs/privacy-model">What stays private</Link>
        </li>
        <li>
          <Link href="/docs/product">What ships when</Link>
        </li>
        <li>
          <Link href="/whitepaper">Whitepaper</Link>
        </li>
      </ul>
    </DocsLayout>
  );
}
