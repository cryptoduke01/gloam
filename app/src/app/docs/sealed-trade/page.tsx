import type { Metadata } from "next";
import Link from "next/link";
import { DocsLayout } from "@/components/DocsLayout";
import { FlowDiagram } from "@/components/docs/FlowDiagram";

export const metadata: Metadata = {
  title: "Sealed-size private trade",
  description:
    "What sealed private trade means on Gloam, what is live on testnet today, and what still ships next.",
};

export default function DocsSealedTradePage() {
  return (
    <DocsLayout
      title="Sealed-size private trade"
      lede="Goal: trade without printing full size to the public book. Live on Robinhood Chain testnet with fixed rates and dev proving keys. Real rates and production keys still ship next."
      glance={[
        { label: "Today", value: "Sealed path + adapter" },
        { label: "Goal", value: "Size sealed" },
        { label: "Status", value: "Testnet live" },
        { label: "Fake fills", value: "Never" },
      ]}
    >
      <h2>What lives today</h2>
      <FlowDiagram
        title="Private trade (sealed path)"
        steps={[
          {
            n: "1",
            title: "Pick a vault note",
            body: "Spend a shielded ETH note you already hold in the vault.",
          },
          {
            n: "2",
            title: "Prove the trade",
            body: "Browser builds a sealed-swap proof. Size stays private; the chain only sees a vault proof.",
          },
          {
            n: "3",
            title: "Settle in vault",
            body: "You receive the out asset as a new vault note, plus change. No public DEX hop.",
          },
        ]}
      />
      <p>
        Testnet rates use <strong>display marks</strong> (Yahoo / CoinGecko for
        the UI), not an on-chain oracle. If marks fail to load, the app falls
        back to 1:1. Dev ceremony keys only. See{" "}
        <Link href="/docs/production">Production gate</Link> before real money.
      </p>

      <h2>Vault trade adapter (fallback)</h2>
      <FlowDiagram
        title="From vault (public swap step)"
        steps={[
          {
            n: "1",
            title: "Cash out",
            body: "Unshield a vault note to your open wallet (public edge).",
          },
          {
            n: "2",
            title: "Swap",
            body: "Public DEX swap. Size and pair are visible on the explorer.",
          },
          {
            n: "3",
            title: "Re-shield",
            body: "Proceeds go back into the vault. Hold is private again.",
          },
        ]}
      />
      <p>
        Useful on thin books. <strong>Not</strong> sealed trade: the swap edge
        still leaks size. The product shows both paths honestly.
      </p>

      <h2>What “sealed” means</h2>
      <ul>
        <li>Public observers cannot read your trade size as free signal</li>
        <li>Settlement still ends on-chain (we do not claim invisibility)</li>
        <li>No theatrical “private success” without a real proof</li>
      </ul>

      <h2>What ships next</h2>
      <ol>
        <li>
          <strong>On-chain rates</strong> — replace display-mark rates with
          oracle-bound or pool-bound pricing (Pyth / AMM).
        </li>
        <li>
          <strong>Production ceremony keys</strong> — multi-party proving keys
          before any mainnet value.
        </li>
        <li>
          <strong>Ethereum expansion</strong> — same private rails where the
          largest onchain audience already sits.
        </li>
        <li>
          <strong>Deeper liquidity design</strong> — intent batching or
          vault-native pool when books are thin.
        </li>
      </ol>
      <p>
        Each step keeps the same rule: no fake private fills. See{" "}
        <Link href="/docs/production">Production gate</Link>.
      </p>

      <h2>What we will not do</h2>
      <ul>
        <li>Hide a public swap behind a “private” button</li>
        <li>Claim production readiness on dev proving keys</li>
        <li>Promise dark-pool guarantees on thin testnet liquidity</li>
      </ul>

      <h2>Repo pointers</h2>
      <ul>
        <li>
          Engineering design: <code>contracts/SEALED_TRADE.md</code>
        </li>
        <li>
          Status helper: <code>app/src/lib/sealedTrade.ts</code> (
          <code>sealedTradeReady() === true</code> when artifacts ship; panel
          still checks the on-chain verifier)
        </li>
        <li>
          UI: <code>app/src/components/app/SealedTradePanel.tsx</code>
        </li>
        <li>
          Production keys gate:{" "}
          <Link href="/docs/production">/docs/production</Link>
        </li>
      </ul>

      <p>
        Try it:{" "}
        <Link href="/app/trade?path=private">Trade → Private trade</Link>.
        Adapter fallback:{" "}
        <Link href="/app/trade?path=vault">From vault</Link>. Hold/move:{" "}
        <Link href="/app/move">Move</Link>.
      </p>
    </DocsLayout>
  );
}
