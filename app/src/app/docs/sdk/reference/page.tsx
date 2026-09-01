import type { Metadata } from "next";
import Link from "next/link";
import { DocsLayout } from "@/components/DocsLayout";

export const metadata: Metadata = {
  title: "API reference",
  description:
    "The complete @gloam/sdk surface: intent builders, note and prover primitives, incremental Merkle tree, sealed-rate math, and constants. One barrel import.",
};

export default function DocsSdkReferencePage() {
  return (
    <DocsLayout
      title="API reference"
      lede="The complete @gloam/sdk surface. Everything exports from one barrel; the crypto core is pure and runs anywhere, and proving and storage are injected so the same code serves a browser app and a node agent."
      glance={[
        { label: "Package", value: "@gloam/sdk" },
        { label: "Import", value: "one barrel" },
        { label: "Core", value: "pure, isomorphic" },
        { label: "Injected", value: "prover, storage" },
      ]}
      quickLinks={[
        { href: "/docs/quickstart", label: "Quickstart" },
        { href: "/docs/sdk", label: "SDK overview" },
        { href: "/docs/sdk/disclosure", label: "Selective disclosure" },
        { href: "/docs/agents", label: "Agents" },
      ]}
    >
      <h2>Import</h2>
      <p>
        One entry point. Tree-shake what you do not use. <code>viem</code> types
        (<code>Address</code>, <code>Hex</code>) flow through the surface;{" "}
        <code>snarkjs</code> is a lazy peer, imported only inside{" "}
        <code>proveGroth16</code>.
      </p>
      <pre>
        <code>{`import {
  buildShieldBoundIntent, buildUnshieldIntent, buildPrivateSendIntent,
  makeBoundNotePoseidon, artifactProver,
  IncrementalMerkleTreePoseidon,
  SEALED_VAULT, NATIVE_ASSET,
} from "@gloam/sdk";`}</code>
      </pre>

      {/* ─────────────────────────  builders  ───────────────────────── */}
      <h2>Intent builders</h2>
      <p>
        The primary surface. Each builder returns an unsigned{" "}
        <code>GloamIntent</code> — a portable <code>plan</code> plus a resolved{" "}
        <code>exec</code> (the on-chain call). You sign and broadcast; the SDK
        never holds a key.
      </p>
      <table>
        <thead>
          <tr>
            <th>Function</th>
            <th>Signature</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>
              <code>buildShieldBoundIntent</code>
            </td>
            <td>
              <code>(p: ShieldBoundIntentParams) =&gt; Promise&lt;ShieldIntent&gt;</code>
              <br />
              Mints a note + shield proof → <code>shieldBound(...)</code>
            </td>
            <td>Live</td>
          </tr>
          <tr>
            <td>
              <code>buildShieldIntent</code>
            </td>
            <td>
              <code>(p: ShieldIntentParams) =&gt; Promise&lt;ShieldIntent&gt;</code>
              <br />
              Plain <code>shield(...)</code>, no proof
            </td>
            <td>Legacy pools only</td>
          </tr>
          <tr>
            <td>
              <code>buildUnshieldIntent</code>
            </td>
            <td>
              <code>(p: UnshieldIntentParams) =&gt; Promise&lt;GloamIntent&lt;&quot;unshield&quot;&gt;&gt;</code>
              <br />
              Witness + proof → <code>unshield(...)</code> (cash out)
            </td>
            <td>Live</td>
          </tr>
          <tr>
            <td>
              <code>buildPrivateSendIntent</code>
            </td>
            <td>
              <code>(p: PrivateSendIntentParams) =&gt; Promise&lt;PrivateSendIntent&gt;</code>
              <br />
              Transfer witness → <code>transfer(...)</code>; returns payment +
              change notes
            </td>
            <td>Live</td>
          </tr>
          <tr>
            <td>
              <code>buildPrivateTradeIntent</code>
            </td>
            <td>
              <code>(p: PrivateTradeIntentParams) =&gt; Promise&lt;PrivateTradeIntent&gt;</code>
              <br />
              Sealed-swap witness → <code>sealedSwap(...)</code>
            </td>
            <td>Disabled (H1)</td>
          </tr>
        </tbody>
      </table>
      <p>
        <code>buildPrivateTradeIntent</code> produces a valid intent, but the
        on-chain sealed-swap path is disabled pending the H1 solvency work — the
        builder is here so you can wire it ahead of the flip.
      </p>

      <h3>Parameters</h3>
      <pre>
        <code>{`interface ShieldIntentParams {
  amountWei: bigint;          // wei (native) or token base units
  asset?: Address;            // default NATIVE_ASSET (zero address)
  chainId?: number;           // default RH_TESTNET_CHAIN_ID
  poolAddress?: Address;      // default SEALED_VAULT
  agentAddress?: Address | null;
}
interface ShieldBoundIntentParams extends ShieldIntentParams {
  prover: Prover;             // bound to the shield circuit artifacts
}
interface UnshieldIntentParams {
  secretHex: \`0x\${string}\`;  // the note's spend key
  amountWei: bigint;
  to: Address;                // public recipient
  asset?: Address;
  path: PoseidonMerklePath;   // membership path (from the rebuilt tree)
  prove: Prover;
  poolAddress?: Address; chainId?: number; agentAddress?: Address | null;
}
interface PrivateSendIntentParams {
  secretHex: \`0x\${string}\`;
  amountInWei: bigint;        // the source note's amount
  amountPayWei: bigint;       // amount to send (remainder is your change note)
  asset?: Address;
  path: PoseidonMerklePath;
  prove: Prover;
  poolAddress?: Address; chainId?: number; agentAddress?: Address | null;
}`}</code>
      </pre>

      {/* ─────────────────────────  intents  ───────────────────────── */}
      <h2>Intent shape</h2>
      <p>
        Every builder returns this. The <code>plan</code> is safe to log or hand
        to an agent; the <code>exec</code> is the resolved call.
      </p>
      <pre>
        <code>{`interface GloamIntent<K> {
  intent: K;                  // one of the four IntentKind values
  chainId: number;
  agentAddress: Address | null;
  plan: PlanFor<K>;           // portable: symbol, amount — no secrets
  privacy: string;            // plain-language: what is and isn't hidden
  execution: string;          // plain-language: how to sign + broadcast
  exec: IntentExec;
}
interface IntentExec {
  poolAddress: Address;
  fn: PoolFn;                 // e.g. "shieldBound", "unshield", "transfer"
  valueWei: bigint;           // ETH to attach (native shield only)
  args: readonly unknown[];   // ABI-ordered call args
}`}</code>
      </pre>
      <p>
        <code>ShieldIntent</code> adds <code>note: BoundNote</code>;{" "}
        <code>PrivateSendIntent</code> and <code>PrivateTradeIntent</code> add{" "}
        <code>paymentNote</code>/<code>outNote</code> and <code>changeNote</code>{" "}
        (each a <code>NoteExport</code>).
      </p>

      <h3>Pinned public inputs</h3>
      <p>
        <code>PUBLIC_INPUTS</code> pins the exact signal ordering the deployed
        verifiers expect, so an integrator cannot drift out of proof
        compatibility.
      </p>
      <pre>
        <code>{`PUBLIC_INPUTS.unshield   // [root, nullifier, asset, amount, to]
PUBLIC_INPUTS.transfer   // [root, nullifier, newCommitment0, newCommitment1]
PUBLIC_INPUTS.sealedSwap // [root, nullifier, newCOut, newCChange,
                         //  assetIn, assetOut, amountOutMin, rateIn, rateOut]`}</code>
      </pre>

      {/* ─────────────────────────  notes  ───────────────────────── */}
      <h2>Notes</h2>
      <p>
        A private balance is a note:{" "}
        <code>commitment = Poseidon(secret, amount, asset)</code>,{" "}
        <code>nullifier = Poseidon(secret, commitment)</code>. The{" "}
        <code>secret</code> is the sole spend authority.
      </p>
      <pre>
        <code>{`makeBoundNotePoseidon(amount: bigint, asset?: Address): Promise<BoundNote>
noteCommitmentPoseidon(secret: bigint, amount: bigint, asset?: Address): Promise<bigint>
noteNullifierPoseidon(secret: bigint, commitment: bigint): Promise<bigint>
openNotePoseidon(secretHex: Hex, amount: bigint, asset: Address)
  : Promise<{ commitment: Hex; nullifier: Hex }>
randomSecretField(): Promise<bigint>   // uniform, under the field prime

interface BoundNote {
  secret: Hex; commitment: Hex; nullifier: Hex;
  secretField: bigint; commitmentField: bigint; nullifierField: bigint;
}`}</code>
      </pre>

      {/* ─────────────────────────  prover  ───────────────────────── */}
      <h2>Prover</h2>
      <p>
        Proving is environment-bound, so it is injected. A <code>Prover</code>{" "}
        takes a circom input and returns packed proof bytes.{" "}
        <code>artifactProver</code> binds snarkjs to a fixed set of artifacts
        (file paths in node, URLs in the browser).
      </p>
      <pre>
        <code>{`type Prover = (input: Record<string, string | string[]>) => Promise<ProveResult>
type ProveResult = { proofBytes: Hex; publicSignals?: string[] }

interface Groth16Artifacts { wasm: string; zkey: string }

artifactProver(a: Groth16Artifacts): Prover
proveGroth16(input, wasm: string, zkey: string)
  : Promise<{ proofBytes: Hex; publicSignals: string[]; proof: Groth16Proof }>`}</code>
      </pre>
      <p>
        <code>snarkjs</code> is imported dynamically inside{" "}
        <code>proveGroth16</code>; install it as a peer where you prove. A browser
        app and a node signer differ only in whether <code>wasm</code>/
        <code>zkey</code> are URLs or paths.
      </p>

      {/* ─────────────────────────  merkle  ───────────────────────── */}
      <h2>Merkle tree</h2>
      <p>
        A depth-20 (<code>MERKLE_DEPTH</code>) incremental Poseidon tree. Rebuild
        it from the pool&apos;s <code>Shielded</code> events, then produce a
        membership path for a spend proof.
      </p>
      <pre>
        <code>{`class IncrementalMerkleTreePoseidon {
  leaves: bigint[];
  insert(leaf: bigint): Promise<number>          // returns the leaf index
  path(leafIndex: number): Promise<PoseidonMerklePath>
}
type PoseidonMerklePath = {
  leafIndex: number; leaf: bigint;
  pathElements: bigint[]; pathIndices: number[]; root: bigint;
}
pathToCircomInput(path: PoseidonMerklePath)  // -> circom-ready string fields`}</code>
      </pre>

      {/* ─────────────────────────  witness  ───────────────────────── */}
      <h2>Witness builders</h2>
      <p>
        Pure circom-input builders under the intent builders. Use these directly
        only if you drive proving yourself; otherwise the intent builders call
        them for you.
      </p>
      <pre>
        <code>{`buildPoseidonUnshieldWitness({ secretHex, amount, asset?, to, path })
buildTransferWitness({ secretHex, amountIn, amountPay, asset?, path })
buildSealedSwapWitness({ secretHex, amountIn, amountSwap, assetIn?, assetOut,
                         amountOutMin, rateIn, rateOut, path })
sealedSwapArtifactsReady(): boolean

type NoteExport = { secret: Hex; commitment: Hex; nullifier: Hex;
                    amountWei: string; asset: Address }`}</code>
      </pre>
      <p>
        Each returns the circom input, the derived public inputs, the output
        notes, and a <code>blocker</code> string if the witness is not provable
        (for example a commitment that is not in the tree).
      </p>

      {/* ─────────────────────────  rates  ───────────────────────── */}
      <h2>Sealed-rate math</h2>
      <p>
        Pure integer math for sealed swaps, proven against the circuit equality{" "}
        <code>amountOut · rateOut === amountSwap · rateIn</code>. Rates are USD
        cents (<code>SEALED_RATE_SCALE = 100</code>) to keep the constraint exact.
      </p>
      <pre>
        <code>{`marksToSealedRates(ethUsd, outUsd, source?): SealedRateQuote | null
estimateSealedOut(amountSwap: bigint, rateIn: bigint, rateOut: bigint): bigint
exactSealedAmounts(amountSwapWanted: bigint, rateIn: bigint, rateOut: bigint)
  : { amountSwap: bigint; amountOut: bigint } | null   // exact, no rounding leak
formatSealedAmount(wei: bigint, maxFrac?: number): string
fallbackOneToOneRates(): SealedRateQuote

type SealedRateQuote = { rateIn: bigint; rateOut: bigint; /* … */ }`}</code>
      </pre>

      {/* ─────────────────────────  privacy  ───────────────────────── */}
      <h2>Size-privacy policy</h2>
      <p>
        The public floor an integrator publishes for a spend. The default mode
        keeps the on-chain minimum at <code>SIZE_PRIVACY_OUT_MIN = 1</code> so the
        settled size leaks nothing; a slippage mode trades some privacy for a
        tighter guarantee.
      </p>
      <pre>
        <code>{`type SizePrivacyMode = "max" | "slippage"
publicAmountOutMin(expectedOut: bigint, mode: SizePrivacyMode, bps?: number): bigint
coarsenMarkUsd(usd: number): number          // bucket a mark so quotes don't fingerprint
SEALED_PRIVACY_FACTS                          // plain-language privacy notes`}</code>
      </pre>

      {/* ─────────────────────────  poseidon / proof  ───────────────────────── */}
      <h2>Field math &amp; proof packing</h2>
      <p>Low-level helpers, shared by the note and witness layers.</p>
      <pre>
        <code>{`// poseidon.ts
poseidon2(a: bigint, b: bigint): Promise<bigint>
poseidon3(a: bigint, b: bigint, c: bigint): Promise<bigint>
toField(x: bigint | string | number): bigint   // reduce mod the field prime
fieldToHex(f: bigint): \`0x\${string}\`
hexToField(hex: string): bigint

// proof.ts
packGroth16Proof(proof: Groth16Proof): Hex      // -> the bytes the verifier wants
fieldToBytes32(field: bigint | string): Hex`}</code>
      </pre>

      {/* ─────────────────────────  constants  ───────────────────────── */}
      <h2>Constants</h2>
      <table>
        <thead>
          <tr>
            <th>Constant</th>
            <th>Value / meaning</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>
              <code>SEALED_VAULT</code>
            </td>
            <td>The hardened C1/C2/C3 pool — the default deposit target</td>
          </tr>
          <tr>
            <td>
              <code>SHIELD_VERIFIER</code>
            </td>
            <td>The deployed shield verifier the hardened pool checks against</td>
          </tr>
          <tr>
            <td>
              <code>GLOAM_PAY_MEMO</code>
            </td>
            <td>The encrypted-memo contract for private-pay discovery</td>
          </tr>
          <tr>
            <td>
              <code>NATIVE_ASSET</code>
            </td>
            <td>Zero address — native ETH</td>
          </tr>
          <tr>
            <td>
              <code>RH_TESTNET_CHAIN_ID</code> / <code>RH_MAINNET_CHAIN_ID</code>
            </td>
            <td>
              <code>46630</code> / <code>4663</code>
            </td>
          </tr>
          <tr>
            <td>
              <code>FIELD_PRIME</code>
            </td>
            <td>The BN254 scalar field modulus</td>
          </tr>
          <tr>
            <td>
              <code>MERKLE_DEPTH</code> / <code>SEALED_RATE_SCALE</code>
            </td>
            <td>
              <code>20</code> / <code>100</code>
            </td>
          </tr>
        </tbody>
      </table>
      <p>
        The default <code>SEALED_VAULT</code> is the hardened pool — never the
        retired <code>0x4F38</code> deployment. Pass <code>poolAddress</code> to
        any builder to override it.
      </p>

      <h2>Guardrails</h2>
      <p>
        Robinhood Chain testnet <code>46630</code> with dev-ceremony keys. Real
        proofs only, never a mock. Note secrets are the sole spend authority —
        persist and protect them. See the <Link href="/docs/quickstart">quickstart</Link>{" "}
        to put this together, or <Link href="/docs/production">the production
        gate</Link> for what mainnet still needs.
      </p>
    </DocsLayout>
  );
}
