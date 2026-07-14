import type { Metadata } from "next";
import Link from "next/link";
import { DocsLayout } from "@/components/DocsLayout";
import { FlowDiagram } from "@/components/docs/FlowDiagram";

export const metadata: Metadata = {
  title: "Sealed-size private trade",
  description:
    "What sealed private trade means on Gloam, what the vault adapter does today, and design options next.",
};

export default function DocsSealedTradePage() {
  return (
    <DocsLayout
      title="Sealed-size private trade"
      lede="Goal: trade without printing full size to the public book. Not shipped. The vault trade adapter is a stepping stone."
      glance={[
        { label: "Today", value: "Adapter (public swap)" },
        { label: "Goal", value: "Size sealed" },
        { label: "Status", value: "Design" },
        { label: "Fake fills", value: "Never" },
      ]}
    >
      <h2>What lives today</h2>
      <FlowDiagram
        title="Vault trade adapter"
        steps={[
          {
            n: "1",
            title: "Cash out",
            body: "Unshield a vault note to your open wallet (public edge).",
          },
          {
            n: "2",
            title: "Swap",
            body: "Public DEX swap — size and pair are visible on the explorer.",
          },
          {
            n: "3",
            title: "Re-shield",
            body: "Proceeds go back into the vault. Hold is private again.",
          },
        ]}
      />
      <p>
        Useful: you do not leave inventory sitting public forever.{" "}
        <strong>Not</strong> sealed trade: the swap edge still leaks size.
      </p>

      <h2>What “sealed” means</h2>
      <ul>
        <li>Public observers cannot read your trade size as free signal</li>
        <li>Settlement still ends on-chain (we do not claim invisibility)</li>
        <li>No theatrical “private success” without a real mechanism</li>
      </ul>

      <h2>Design options (next engineering)</h2>
      <ol>
        <li>
          <strong>Intent + batch settlement</strong> — users post sealed
          intents; a matcher settles net flows so individual sizes blur in a
          batch.
        </li>
        <li>
          <strong>Vault-native pool</strong> — AMM or RFQ that spends notes and
          mints notes without an intermediate public wallet hop.
        </li>
        <li>
          <strong>Hybrid</strong> — adapter for thin markets; sealed path when
          liquidity and circuits support it.
        </li>
      </ol>
      <p>
        Each option needs circuits (or TEE/intent infra), liquidity design, and
        the same production-key gate as the rest of the private path. See{" "}
        <Link href="/docs/production">Production gate</Link>.
      </p>

      <h2>What we will not do</h2>
      <ul>
        <li>Hide a public swap behind a “private” button</li>
        <li>Ship sealed UI before proofs/settlement exist</li>
        <li>Promise dark-pool guarantees on thin testnet liquidity</li>
      </ul>

      <p>
        Try the adapter: <Link href="/app/trade?path=vault">Trade → From vault</Link>
        . Hold/move: <Link href="/app/move">Move</Link>.
      </p>
    </DocsLayout>
  );
}
