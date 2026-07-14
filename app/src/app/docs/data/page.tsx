import type { Metadata } from "next";
import { DocsLayout } from "@/components/DocsLayout";

export const metadata: Metadata = {
  title: "Live data",
  description:
    "How Gloam fetches live market marks, chain state, and activity on Robinhood Chain.",
};

export default function DocsDataPage() {
  return (
    <DocsLayout
      title="Live data"
      lede="How the product reads the world — marks, chain head, and public activity — without faking fills."
      glance={[
        { label: "Stocks", value: "Yahoo chart" },
        { label: "Memes", value: "CoinGecko" },
        { label: "Chain", value: "JSON-RPC" },
        { label: "Activity", value: "Blockscout" },
        { label: "Cache", value: "~30s" },
      ]}
    >
      <h2>Architecture</h2>
      <p>
        The browser never talks to Yahoo or CoinGecko directly (CORS + rate
        limits). It hits our Next routes; the server fetches and caches.
      </p>
      <ul>
        <li>
          <strong>Marks</strong> —{" "}
          <code>GET /api/markets</code> → stocks via Yahoo Finance chart API,
          memes via CoinGecko simple price. Cached ~30s.
        </li>
        <li>
          <strong>Chain head</strong> — wagmi{" "}
          <code>useBlockNumber</code> against Robinhood testnet RPC (46630).
        </li>
        <li>
          <strong>Balances</strong> — wagmi <code>useBalance</code> on the
          connected address.
        </li>
        <li>
          <strong>Activity</strong> —{" "}
          <code>GET /api/activity?address=0x…</code> → Blockscout{" "}
          <code>txlist</code> on testnet explorer.
        </li>
      </ul>

      <h2>What is live vs not</h2>
      <ul>
        <li>
          <strong>Live:</strong> reference marks, public ETH balance, public
          send, public tx history, block height.
        </li>
        <li>
          <strong>Not live:</strong> private trade fills, shielded balances,
          RH stock-token onchain prices (next), Uniswap pool quotes on RH.
        </li>
      </ul>

      <h2>Next data sources</h2>
      <ol>
        <li>
          Robinhood Chain stock-token contracts + Chainlink feeds (mainnet docs:
          oracles &amp; price feeds).
        </li>
        <li>DEX pool reserves / Uniswap quoter for executable size.</li>
        <li>Alchemy Data API for richer portfolio indexing.</li>
        <li>Private note state once shield contracts deploy.</li>
      </ol>

      <h2>Honesty rule</h2>
      <p>
        A mark is a reference price. A fill is a settlement. We never show a
        private fill without a proof path. Live data improves the book you see
        — it does not invent privacy.
      </p>
    </DocsLayout>
  );
}
