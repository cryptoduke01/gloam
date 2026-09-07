import type { Metadata } from "next";
import Link from "next/link";
import { DocsLayout } from "@/components/DocsLayout";
import { FlowDiagram } from "@/components/docs/FlowDiagram";

export const metadata: Metadata = {
  title: "Sealed-size private trade",
  description:
    "What sealed private trade means on Gloam, why it is paused on-chain pending the H1 solvency fix, and the design that turns it back on.",
};

export default function DocsSealedTradePage() {
  return (
    <DocsLayout
      title="Sealed-size private trade"
      lede="Convert one vault asset to another with your size sealed. This is currently paused on-chain: the sealed-swap verifier is disabled pending the H1 solvency fix. The path is built, and the design to re-enable it with full privacy and solvency is set. Here is how it works, why it is paused, and the way back on."
      glance={[
        { label: "Status", value: "Paused (H1)" },
        { label: "Goal", value: "Size sealed" },
        { label: "Live instead", value: "shield / send / cash out" },
        { label: "Fake fills", value: "Never" },
      ]}
    >
      <h2>Why it is paused</h2>
      <p>
        A sealed swap spends an <code>assetIn</code> note and mints an{" "}
        <code>assetOut</code> note with both amounts private, but no tokens move,
        so the pool ends up owing <code>assetOut</code> it does not physically
        hold (audit H1). Rather than ship an insolvent swap or reveal your size to
        fix the accounting, the on-chain verifier is set to zero and the swap is
        off. Shield, private send, and cash out are live and solvent in the
        meantime. The re-enable design is below and in{" "}
        <code>contracts/audit/H1-CONFIDENTIAL-SWAP-DESIGN.md</code>.
      </p>

      <h2>How the sealed path works (when enabled)</h2>
      <FlowDiagram
        title="Private trade (sealed path)"
        steps={[
          {
            n: "1",
            title: "Pick direction + vault note",
            body: "Buy (ETH → stock) or sell (stock → ETH). Spend a note you already hold in the vault.",
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
        Testnet rates use <strong>coarsened display marks</strong> (Yahoo /
        CoinGecko for the UI), not an on-chain oracle. If marks fail, 1:1
        fallback. Dev ceremony keys only.
      </p>
      <p>
        <strong>Size privacy (default on when enabled):</strong> the public{" "}
        <code>amountOutMin</code> is a 1-wei floor, not your real output (an
        earlier build leaked size by setting min-out to the exact amount; the
        sealed path fixes that). Rates and asset pair are public. Cash out
        publishes amount. See{" "}
        <Link href="/docs/privacy-model">privacy model</Link> ·{" "}
        <Link href="/docs/production">production gate</Link>.
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
        <li>
          Public observers do not get your exact size as a free signal (with max
          size privacy on)
        </li>
        <li>Settlement still ends on-chain (we do not claim invisibility)</li>
        <li>No theatrical “private success” without a real proof</li>
        <li>
          Explorer shows <code>sealedSwap</code> + pair, not a Uniswap fill
        </li>
      </ul>

      <h2>What ships next</h2>
      <ol>
        <li>
          <strong>H1 confidential-reserve solvency (the re-enable gate)</strong>,
          the swap draws the out asset from a protocol reserve tracked as Pedersen
          commitments, with an in-circuit reserve range proof, so size stays
          sealed and the pool stays solvent. Design in{" "}
          <code>contracts/audit/H1-CONFIDENTIAL-SWAP-DESIGN.md</code>.
        </li>
        <li>
          <strong>On-chain rates</strong>, replace display-mark rates with
          oracle-bound or pool-bound pricing (Pyth / AMM). Full write-up:{" "}
          <Link href="/docs/data">Prices &amp; oracles</Link>.
        </li>
        <li>
          <strong>Vault inventory</strong>, seed faucet stocks so cash-out after
          a sealed trade does not fail for empty <code>deposited</code>.
        </li>
        <li>
          <strong>Production ceremony keys</strong>, multi-party proving keys
          before any mainnet value.
        </li>
        <li>
          <strong>Ethereum expansion</strong>, same private rails where the
          largest onchain audience already sits.
        </li>
        <li>
          <strong>Deeper liquidity design</strong>, intent batching or
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
        The sealed path is paused on-chain, so the trade panel shows it as
        disabled until the H1 work lands. Available today: the{" "}
        <Link href="/app/trade?path=vault">from-vault adapter</Link> (honest,
        not sealed), and <Link href="/app/move">Move</Link> to hold and send
        privately.
      </p>
    </DocsLayout>
  );
}
