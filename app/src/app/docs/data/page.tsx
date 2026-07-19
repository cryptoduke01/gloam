import type { Metadata } from "next";
import Link from "next/link";
import { DocsLayout } from "@/components/DocsLayout";

export const metadata: Metadata = {
  title: "Prices, data & oracles",
  description:
    "Where Gloam gets prices from today, what is not an oracle, and what ships next.",
};

export default function DocsDataPage() {
  return (
    <DocsLayout
      title="Prices, data & oracles"
      lede="Straight answer: Gloam does not use an on-chain price oracle yet. Marks in the app are display data. Swaps that hit a DEX use the pool’s own spot price."
      glance={[
        { label: "Display marks", value: "Yahoo / CG" },
        { label: "DEX price", value: "Pool spot" },
        { label: "On-chain oracle", value: "Not yet" },
        { label: "Fake fills", value: "Never" },
      ]}
    >
      <h2 id="oracle">Do you use Chainlink / Pyth / RedStone?</h2>
      <p>
        <strong>No.</strong> Nothing in the contracts reads those feeds today.
        If someone asks on a call, that is the honest one-liner.
      </p>

      <h2 id="display">What prices you see in the app</h2>
      <ul>
        <li>
          <strong>Stocks</strong> — Yahoo Finance chart API for the mark and
          sparkline (server-side). If Yahoo fails, the app falls back to a
          static catalog number.
        </li>
        <li>
          <strong>ETH</strong> — CoinGecko simple price + 30-day chart for USD
          conversion and portfolio.
        </li>
        <li>
          <strong>Memes (mainnet path)</strong> — DexScreener discovery is gated
          off until mainnet product ships.
        </li>
      </ul>
      <p>
        These are <strong>display marks only</strong>. They are not binding
        settlement prices on Robinhood Chain.
      </p>

      <h2 id="execution">What sets execution price</h2>
      <ul>
        <li>
          <strong>Public / adapter swaps</strong> — Uniswap-style router{" "}
          <code>getAmountsOut</code> on the live AMM pool (spot price in that
          pool).
        </li>
        <li>
          <strong>Sealed private trade</strong> — public{" "}
          <code>rateIn</code> / <code>rateOut</code> inputs to the circuit,
          currently filled from the same display marks (or 1:1 if marks fail).
          Size stays private; the rate itself is visible on-chain in the
          settlement call.
        </li>
        <li>
          <strong>Vault inventory</strong> — cash out needs the pool to actually
          hold the asset (<code>deposited[asset]</code>). Private trade can mint
          a note; unshield still needs inventory.
        </li>
      </ul>

      <h2 id="next">What ships next for pricing</h2>
      <ol>
        <li>
          Bind sealed rates to a real source (target:{" "}
          <strong>Pyth</strong> for equities-style feeds, or AMM mid when a deep
          pool exists).
        </li>
        <li>Seed and show vault inventory per faucet stock so cash-out is safe.</li>
        <li>Never claim oracle security until the feed is on-chain and checked.</li>
      </ol>

      <h2 id="activity">Balances and history</h2>
      <ul>
        <li>
          <strong>Wallet balances</strong> — on-chain (viem / wallet).
        </li>
        <li>
          <strong>Vault notes</strong> — local secrets + on-chain tree; backup in
          Settings.
        </li>
        <li>
          <strong>Public activity</strong> — explorer / RPC logs for open
          transfers.
        </li>
      </ul>

      <h2 id="testnet-eth">Testnet ETH</h2>
      <p>
        Official faucet:{" "}
        <a
          href="https://faucet.testnet.chain.robinhood.com/"
          target="_blank"
          rel="noreferrer"
        >
          faucet.testnet.chain.robinhood.com
        </a>
        . Also linked from <Link href="/app/settings">Settings</Link>.
      </p>

      <p>
        Related:{" "}
        <Link href="/docs/sealed-trade">Sealed trade</Link> ·{" "}
        <Link href="/docs/production">Production gate</Link> ·{" "}
        <Link href="/docs/product">What ships when</Link>.
      </p>
    </DocsLayout>
  );
}
