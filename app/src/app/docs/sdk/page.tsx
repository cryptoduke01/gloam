import type { Metadata } from "next";
import { DocsLayout } from "@/components/DocsLayout";

export const metadata: Metadata = {
  title: "SDK",
  description:
    "@gloam/sdk — add shielded balances, private transfers, and private trades to any Robinhood Chain app.",
};

export default function DocsSdkPage() {
  return (
    <DocsLayout
      title="SDK"
      lede="The private path as a package. Add shielded balances, private transfers, and private trades to any Robinhood Chain app."
      glance={[
        { label: "Package", value: "@gloam/sdk" },
        { label: "Runtime", value: "browser + node" },
        { label: "Chain", value: "RH testnet 46630" },
        { label: "Proofs", value: "Groth16 + Poseidon" },
      ]}
    >
      <h2>What it is</h2>
      <p>
        <code>@gloam/sdk</code> is the same private path the Gloam vault app
        runs, extracted into one reusable package. The vault app is its
        reference implementation, not a special case. Any app on Robinhood
        Chain can shield a balance, send it privately, cash it out, or trade it
        with size hidden, without building a proving stack from scratch.
      </p>

      <h2>The core</h2>
      <p>
        One shared core powers the SDK, the agent server, and the app: the
        Poseidon note scheme (commitment binds secret, amount, asset), a
        depth-20 incremental Merkle tree, circom witness builders, and Groth16
        proof packing. The crypto and math are pure and run anywhere. Storage
        (notes, viewing keys), snarkjs proving, and RPC are injected through
        adapters, so the same core serves the browser and a node agent.
      </p>

      <h2>Intents</h2>
      <p>
        Every action is an intent with two layers. The plan layer is portable
        and safe to log or hand to an agent (symbol, USD, no secrets). The exec
        layer resolves the on-chain call (wei amounts, resolved addresses,
        proof args). The SDK and the agent server share one intent shape.
      </p>
      <ul>
        <li>
          <strong>shield</strong>, deposit into the sealed vault
        </li>
        <li>
          <strong>privateSend</strong>, move a note to a receive tag
        </li>
        <li>
          <strong>unshield</strong>, cash out to a public balance
        </li>
        <li>
          <strong>privateTrade</strong>, sealed swap with size hidden
        </li>
      </ul>

      <h2>Public inputs are pinned</h2>
      <p>
        The SDK pins the exact public-input ordering the deployed verifiers
        expect, so an integrator cannot drift out of proof compatibility:
      </p>
      <ul>
        <li>
          <strong>unshield</strong>, <code>[root, nullifier, asset, amount, to]</code>
        </li>
        <li>
          <strong>transfer</strong>,{" "}
          <code>[root, nullifier, newCommitment0, newCommitment1]</code>
        </li>
        <li>
          <strong>sealedSwap</strong>, nine signals ending in{" "}
          <code>amountOutMin, rateIn, rateOut</code>
        </li>
      </ul>

      <h2>Quickstart</h2>
      <p>
        The SDK is a workspace package today and installs from the monorepo.
        Build and run its self-test:
      </p>
      <pre>
        <code>{`pnpm --filter @gloam/sdk test   # rate + size-privacy parity with the circuit`}</code>
      </pre>
      <p>
        The intent builders that shield and privately send from a script land as
        the core port completes. The rate and size-privacy math are already
        exported and proven against the sealed-swap circuit equality
        (amountOut times rateOut equals amountSwap times rateIn).
      </p>

      <h2>Testnet only</h2>
      <p>
        The SDK targets Robinhood Chain testnet with dev-ceremony keys. Real
        privacy only, never a mock success. Mainnet waits for a production
        ceremony and an external audit.
      </p>
    </DocsLayout>
  );
}
