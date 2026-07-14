import type { Metadata } from "next";
import { DocShell } from "@/components/DocShell";

export const metadata: Metadata = { title: "Robinhood Chain" };

export default function ChainPage() {
  return (
    <DocShell title="Robinhood Chain" eyebrow="Network">
      <p>
        Gloam targets Robinhood Chain, an Arbitrum Orbit L2 built for financial
        services and real-world assets, including stock tokens that trade past
        the traditional equity close. Private money belongs where the assets
        already settle.
      </p>

      <dl className="mt-8 space-y-4 font-mono text-sm">
        <div>
          <dt className="text-mute">Mainnet chain ID</dt>
          <dd className="text-lime">4663</dd>
        </div>
        <div>
          <dt className="text-mute">Testnet chain ID</dt>
          <dd className="text-white">46630</dd>
        </div>
        <div>
          <dt className="text-mute">Native gas</dt>
          <dd className="text-white">ETH</dd>
        </div>
        <div>
          <dt className="text-mute">Public RPC (rate limited)</dt>
          <dd className="break-all text-white">
            https://rpc.mainnet.chain.robinhood.com
          </dd>
        </div>
      </dl>

      <p className="mt-8">
        Prefer Alchemy / QuickNode for production. Official chain docs:{" "}
        <a
          href="https://docs.robinhood.com/chain/connecting/"
          className="text-lime hover:underline"
          target="_blank"
          rel="noreferrer"
        >
          docs.robinhood.com/chain
        </a>
        .
      </p>

      <h2 className="!mt-10 text-xl text-white">Why this chain</h2>
      <p>
        Tokenized equities are the wedge: markets that already exist as tokens,
        with liquidity paths and institutional gravity. Gloam does not need a
        new asset class to justify privacy. It needs a place where size is real
        and the public graph is already a problem.
      </p>
    </DocShell>
  );
}
