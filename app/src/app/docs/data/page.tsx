import type { Metadata } from "next";
import Link from "next/link";
import { DocsLayout } from "@/components/DocsLayout";

export const metadata: Metadata = {
  title: "Live data",
};

export default function DocsDataPage() {
  return (
    <DocsLayout
      title="Live data"
      lede="Prices update on their own. Activity comes from the chain. Nothing is a fake fill."
      glance={[
        { label: "Stocks", value: "Live" },
        { label: "Memes", value: "Live" },
        { label: "Balance", value: "Onchain" },
        { label: "History", value: "Onchain" },
      ]}
    >
      <h2>What you see</h2>
      <ul>
        <li>
          <strong>Prices</strong> — refreshed in the app every few seconds.
        </li>
        <li>
          <strong>Charts</strong> — recent path for each market.
        </li>
        <li>
          <strong>Balance</strong> — your wallet on Robinhood testnet.
        </li>
        <li>
          <strong>Activity</strong> — recent public transfers after you send.
        </li>
      </ul>

      <h2>What is not live yet</h2>
      <ul>
        <li>Private trade fills</li>
        <li>Shielded balances</li>
        <li>Onchain stock-token settlement</li>
      </ul>

      <h2>Testnet ETH</h2>
      <p>
        Use the official faucet:{" "}
        <a
          href="https://faucet.testnet.chain.robinhood.com/"
          target="_blank"
          rel="noreferrer"
        >
          faucet.testnet.chain.robinhood.com
        </a>
        . About 0.01 ETH plus sample stock tokens, once per day.
      </p>
      <p>
        Also in-app: <Link href="/app/settings">Settings</Link>.
      </p>
    </DocsLayout>
  );
}
