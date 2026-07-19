import type { Metadata } from "next";
import { DocsLayout } from "@/components/DocsLayout";

export const metadata: Metadata = {
  title: "Robinhood Chain",
  description: "Gloam on Robinhood Chain — network details, chain ID, RPC.",
};

export default function DocsChainPage() {
  return (
    <DocsLayout
      title="Robinhood Chain"
      lede="Private rails where equities and onchain culture already settle."
      glance={[
        { label: "Mainnet", value: "4663" },
        { label: "Testnet", value: "46630" },
        { label: "Gas", value: "ETH" },
        { label: "Stack", value: "Arbitrum Orbit" },
      ]}
    >
      <h2>Network</h2>
      <p>
        Gloam targets Robinhood Chain, an Arbitrum Orbit L2 built for financial
        services and real-world assets — and the surface where meme liquidity
        and stock tokens already live. EVM tooling and Uniswap-class paths
        exist. Gloam does not invent a new chain. It adds a private layer where
        the markets already are.
      </p>

      <h2>Parameters</h2>
      <ul>
        <li>
          <strong>Mainnet chain ID</strong> — 4663
        </li>
        <li>
          <strong>Testnet chain ID</strong> — 46630
        </li>
        <li>
          <strong>Native gas</strong> — ETH
        </li>
        <li>
          <strong>Mainnet RPC (rate limited)</strong> —{" "}
          <code>https://rpc.mainnet.chain.robinhood.com</code>
        </li>
        <li>
          <strong>Testnet RPC</strong> —{" "}
          <code>https://rpc.testnet.chain.robinhood.com</code>
        </li>
        <li>
          <strong>Testnet vault (sealed)</strong> —{" "}
          <code>0x4F38a4d80e5ca516A2e5549404C7be0E91c12D8F</code>
        </li>
      </ul>

      <p>
        Prefer Alchemy / QuickNode for production. Official chain docs:{" "}
        <a
          href="https://docs.robinhood.com/chain/connecting/"
          target="_blank"
          rel="noreferrer"
        >
          docs.robinhood.com/chain
        </a>
        .
      </p>

      <h2>Why this chain</h2>
      <p>
        Tokenized equities are the legitimacy wedge. Memes are the volume
        wedge. Privacy is the product neither retail venue will ship as
        construction. Gloam sits where size is real and the public graph is
        already a problem.
      </p>
    </DocsLayout>
  );
}
