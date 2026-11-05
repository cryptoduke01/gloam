import type { Metadata } from "next";
import Link from "next/link";
import { DocsLayout } from "@/components/DocsLayout";

export const metadata: Metadata = {
  title: "Add Gloam to your agent kit or marketplace",
  description:
    "Give the agents in your kit private balances, private payments, claim links, cash outs and proofs of funds with a drop-in tool pack that previews before it signs, or let the sellers on your x402 marketplace take private payments next to standard ones.",
  alternates: { canonical: "/docs/integrate" },
};

const REPO = "https://github.com/cryptoduke01/gloam/tree/main";
const PACK = `${REPO}/examples/agent-kit-tools`;
const SELLER_GUIDE = `${PACK}#sell-with-private-x402`;

const PATHS: { path: string; for: string; what: string }[] = [
  {
    path: "The tool pack",
    for: "Agent kits and MCP add-ons with their own wallet and approval step",
    what: "Tool definitions (name, description, JSON schema) and handlers. Every money action is a preview, then an execute of that preview.",
  },
  {
    path: "The Gloam MCP server",
    for: "Kits that compose MCP servers",
    what: "npx -y @gloamtrade/mcp next to your own server. No code; approval is your MCP client's tool approval.",
  },
  {
    path: "The seller helper",
    for: "x402 marketplaces and the APIs on them",
    what: "Adds a Gloam price next to the standard x402 price, settles and secures Gloam payments before the resource is served.",
  },
  {
    path: "The SDK",
    for: "Teams building their own flow",
    what: "@gloamtrade/sdk: the intents, proofs, x402 and receive helpers everything above is built on.",
  },
];

const TOOLS: { name: string; kind: string; does: string; chain: string }[] = [
  { name: "gloam_balance", kind: "read", does: "Private balance per asset, the agent's Gloam address, what the wallet holds, limits left today.", chain: "Nothing" },
  { name: "gloam_receive", kind: "read", does: "Pick up payments sent to the agent's Gloam address and secure each one into a note only it knows.", chain: "A shielded transfer" },
  { name: "gloam_preview_shield", kind: "preview", does: "Deposit from the wallet into the private balance (USDG on Robinhood Chain, or any asset the vault takes).", chain: "The deposit: wallet, asset, amount" },
  { name: "gloam_preview_pay", kind: "preview", does: "Pay a Gloam address or a payment request link privately.", chain: "A shielded transfer only" },
  { name: "gloam_preview_claim_link", kind: "preview", does: "Pay by claim link, for someone with no Gloam address. The link goes to your code, never to the model.", chain: "A shielded transfer only" },
  { name: "gloam_preview_cash_out", kind: "preview", does: "Private balance to a 0x address, with the vault's live fee and what arrives.", chain: "The cash out: asset, amount, recipient" },
  { name: "gloam_preview_prove_funds", kind: "preview", does: "A proof the agent holds at least an amount, for one named reader, with an expiry.", chain: "Nothing" },
  { name: "gloam_preview_pay_x402", kind: "preview", does: "Request a URL; if it answers 402 with a Gloam price, plan paying it privately.", chain: "A shielded transfer only" },
  { name: "gloam_execute", kind: "execute", does: "Run a preview by its previewId and digest, once.", chain: "What the preview said" },
  { name: "gloam_verify_proof", kind: "read", does: "Check a gloamfunds1: or gloampay1: proof against the chain.", chain: "Nothing" },
];

export default function DocsIntegratePage() {
  return (
    <DocsLayout
      title="Add Gloam to your agent kit or marketplace"
      lede="Your agents get a private balance, private payments, claim links, cash outs and proofs of funds, behind the same preview and approval step your kit already has. Your marketplace's sellers take private payments next to the standard x402 ones they take today."
      glance={[
        { label: "Tool pack", value: "examples/agent-kit-tools" },
        { label: "Engine", value: "GloamAgent, on @gloamtrade/sdk" },
        { label: "x402", value: "gloam-private, next to exact" },
        { label: "Networks", value: "Robinhood Chain, Tempo, Base, Ethereum" },
      ]}
      quickLinks={[
        { href: PACK, label: "Tool pack source" },
        { href: SELLER_GUIDE, label: "Seller guide" },
        { href: "/partners/dashboard", label: "Partner dashboard" },
        { href: "/docs/agents", label: "Agents" },
      ]}
    >
      <h2 id="paths">Pick a path</h2>
      <p>
        Most capabilities already exist in the SDK and the MCP server. These are
        the shortest ways to put them in front of your users.
      </p>
      <div className="overflow-x-auto">
        <table className="min-w-[680px]">
          <thead>
            <tr>
              <th>Path</th>
              <th>For</th>
              <th>What you get</th>
            </tr>
          </thead>
          <tbody>
            {PATHS.map((p) => (
              <tr key={p.path}>
                <td>{p.path}</td>
                <td>{p.for}</td>
                <td>{p.what}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2 id="tool-pack">The tool pack</h2>
      <p>
        A small TypeScript pack, with no framework types. Tools are plain data
        plus one <code>call(name, input)</code>, so they map onto MCP, the
        Anthropic or OpenAI tool formats, or your own registry in a few lines.
        The handlers run <code>GloamAgent</code>, the engine behind the{" "}
        <Link href="/docs/virtuals">Virtuals plugin</Link>, so proving, notes,
        spending limits and recovery from a lost answer are the same code.
      </p>
      <pre>
        <code>{`import { createGloamToolPack } from "./agent-kit-tools/src/index.js";

const gloam = createGloamToolPack({
  network: "robinhood-mainnet",
  sender: myKitWallet,              // anything with an address and sendCalls(calls)
  limits: { recipients: "any", assets: { USDG: { maxPerPayment: "50", maxPerDay: "200" } } },
  onClaimLink: (c) => deliverToUser(c.link),        // bearer secrets go to your code
  onSign: async (calls, ctx) => showApproval(ctx.action, calls),
  apiKey: process.env.GLOAM_API_KEY,                // counts your volume to you
});

for (const t of gloam.definitions) {
  registerTool(t.name, t.description, t.inputSchema, (input) => gloam.call(t.name, input));
}`}</code>
      </pre>
      <div className="overflow-x-auto">
        <table className="min-w-[680px]">
          <thead>
            <tr>
              <th>Tool</th>
              <th>What it does</th>
              <th>Public on chain</th>
            </tr>
          </thead>
          <tbody>
            {TOOLS.map((t) => (
              <tr key={t.name}>
                <td>
                  <code>{t.name}</code>
                  <br />
                  <span className="text-[13px] text-mute">{t.kind}</span>
                </td>
                <td>{t.does}</td>
                <td>{t.chain}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p>
        The pack lives in the repo today. Its engine entry (
        <code>@gloamtrade/game-plugin-gloam/engine</code>) ships to npm with the
        plugin&apos;s next release; until then, run it from a checkout. The{" "}
        <a href={PACK} target="_blank" rel="noreferrer">
          README
        </a>{" "}
        has a five-minute quickstart.
      </p>

      <h2 id="preview">Preview, then execute</h2>
      <p>
        Every action that moves money or shows something about it is two
        calls. A preview checks the request against the chain and the
        owner&apos;s limits and returns exactly what will happen, with a{" "}
        <code>previewId</code> and a <code>digest</code>. Nothing moves until{" "}
        <code>gloam_execute</code> runs it.
      </p>
      <pre>
        <code>{`{
  "status": "preview",
  "previewId": "pv_Xq3...",
  "digest": "sha256:9c1e...",
  "action": "cash_out",
  "summary": "Cash out 100 USDG to 0xAbc... on Robinhood Chain mainnet: 99.5 USDG arrives after the 0.5% fee.",
  "details": {
    "amount": "100 USDG",
    "to": "0xAbc...",
    "fee": { "bps": 50, "percent": "0.5%", "amount": "0.5 USDG" },
    "receives": "99.5 USDG"
  },
  "walletSigns": [],
  "submittedBy": "the Gloam relay, which pays the gas (your wallet does not appear next to it)"
}`}</code>
      </pre>
      <ul>
        <li>
          <strong>Execute runs the preview, not new input.</strong> Amount,
          asset, recipient, network and fee are bound when the preview is made
          and hashed into the digest. Pass the digest you approved and a
          different preview is refused.
        </li>
        <li>
          <strong>Once.</strong> A second execute returns the first result. A
          preview expires after 10 minutes, and a cash out whose fee changed
          since is refused.
        </li>
        <li>
          <strong>The wallet signs only what the preview named.</strong> Your
          wallet sits behind a guard: outside a running preview it signs
          nothing, and a deposit may sign only an approve of the vault for
          exactly the amount and one deposit of exactly that asset and amount.{" "}
          <code>onSign</code> sees each batch decoded and can still say no.
        </li>
        <li>
          <strong>Proofs authorize the rest.</strong> Private payments and cash
          outs are proven on your machine and sent by the Gloam relay, so the
          wallet signs only deposits. The relay can send or refuse; it cannot
          move or redirect money.
        </li>
      </ul>

      <h2 id="secrets">Secrets stay with the kit</h2>
      <ul>
        <li>
          A note&apos;s secret is the money. Secrets stay in an encrypted note
          store (AES-256-GCM), a local file by default or your own storage
          through <code>noteBackend</code>, which only ever sees ciphertext.
        </li>
        <li>Tools hand out handles and public facts, and every result is checked for secrets before it leaves.</li>
        <li>
          Claim links go to <code>onClaimLink</code> or are sealed to a Gloam
          address. A tool result never carries one.
        </li>
        <li>
          Spending limits are the owner&apos;s: per asset, per payment, per 24
          hours, recipients and an expiry, checked before anything is signed.
          They are enforced by this code, not by the vault contract.
        </li>
      </ul>

      <h2 id="mcp">Or bundle the Gloam MCP server</h2>
      <p>A kit that composes MCP servers can run Gloam&apos;s next to its own, with no code:</p>
      <pre>
        <code>{`{
  "mcpServers": {
    "gloam": {
      "command": "npx",
      "args": ["-y", "@gloamtrade/mcp"],
      "env": { "GLOAM_ENV_FILE": "/home/agent/.gloam/agent.env" }
    }
  }
}`}</code>
      </pre>
      <p>
        Keys and limits go in that file, not in the client config. The server
        shields, pays privately, pays x402 and MPP resources, checks payments
        it is paid and runs private swaps. Its execute tools run directly, so
        the approval step is your MCP client&apos;s tool approval, and it has no
        claim link, cash out or proof of funds tool yet. See{" "}
        <Link href="/docs/agents">Agents</Link>.
      </p>

      <h2 id="marketplaces">For x402 marketplaces</h2>
      <p>
        A seller keeps its standard x402 <code>exact</code> price and adds a
        Gloam price next to it. Agents that can pay privately do; the rest keep
        paying the normal way.
      </p>
      <ul>
        <li>
          <strong>Standard clients are not affected.</strong> They never see or
          pay the Gloam price. x402 v1 clients parse the 402 body&apos;s{" "}
          <code>accepts</code> strictly, so the Gloam price rides in its own{" "}
          <code>X-Payment-Required</code> header and the body stays as it was.
          On x402 v2 it is also added to <code>PAYMENT-REQUIRED</code>, where
          clients skip schemes they do not know.
        </li>
        <li>
          <strong>Paying privately takes a client that supports{" "}
          <code>gloam-private</code></strong>: the tool pack, the Gloam MCP
          server, or the SDK. There is no plugin for the standard x402 SDKs
          today.
        </li>
        <li>
          <strong>The seller secures a payment before it serves.</strong> The
          buyer made the payment note, so it could spend it back until the
          seller moves it. The helper opens the payment with the seller&apos;s
          key, checks it against this route&apos;s price, sweeps it into a fresh
          note only the seller knows, and serves once that is in the vault. Each
          payment is served once.
        </li>
      </ul>
      <pre>
        <code>{`import { generateReceiveKey } from "@gloamtrade/sdk";
import { createGloamSeller, protectWithGloam } from "./agent-kit-tools/src/index.js";

const seller = createGloamSeller({
  receiveKey: await generateReceiveKey(),        // keep privateJwk on the server
  network: "robinhood-mainnet",
  saveNote: (fresh) => db.insert("gloam_notes", fresh),  // the swept money
});

export const GET = protectWithGloam({
  seller,
  price: () => ({ amount: "0.25", asset: "USDG" }),
  handler: quoteHandler,
  standard: withStandardX402(quoteHandler),      // your existing x402 middleware
});`}</code>
      </pre>
      <p>
        The{" "}
        <a href={SELLER_GUIDE} target="_blank" rel="noreferrer">
          seller guide
        </a>{" "}
        shows the 402 answer with the Gloam price added, an Express version,
        and each check the settle runs.
      </p>

      <h2 id="counted">Get your integration counted</h2>
      <p>
        Make a partner key at{" "}
        <Link href="/partners/dashboard">/partners/dashboard</Link> and pass it
        as <code>apiKey</code> to the tool pack or the seller helper. Private
        payments, cash outs and sweeps then go through the partner relay, and
        deposits are attributed once they land, so the dashboard counts what
        your kit or marketplace brings in. Partner fees are not charged yet. See
        the <Link href="/docs/partners">Partner API</Link>.
      </p>

      <h2 id="public">What is public, fees and networks</h2>
      <ul>
        <li>
          A deposit and a cash out are public: the wallet or recipient, the
          asset and the amount. A private payment shows only that a shielded
          transfer happened.
        </li>
        <li>Deposits and private payments are free. A cash out costs 0.5%.</li>
        <li>
          Mainnets: Robinhood Chain, Tempo, Base and Ethereum, in beta with
          deposit limits (50,000 of a stablecoin per deposit). Every network
          has a testnet; see <Link href="/docs/chain">Networks</Link>.
        </li>
        <li>
          Privacy grows with the number of notes in a vault, so a quick deposit
          and cash out of the same amount can be linked. See{" "}
          <Link href="/docs/privacy-model">what stays private</Link>.
        </li>
      </ul>

      <h2 id="faq">FAQ</h2>
      <h3>Does Gloam hold my users&apos; money?</h3>
      <p>
        No. The money sits in the vault contract, which has no admin withdraw
        and timelocks its rule changes, and only the agent holds the secrets to
        its notes.
      </p>
      <h3>Do my users need a Gloam account?</h3>
      <p>
        No. Each agent gets a Gloam address from the pack, kept in its own note
        store. Someone with no Gloam address can be paid by claim link.
      </p>
      <h3>Has it been reviewed?</h3>
      <p>
        Kann Audits reviewed the vault contracts (
        <Link href="/security">report, 1 November 2026</Link>) and Hey Research
        Lab reviewed the stack. The tool pack and the seller helper are new;
        read them before you trust them with money, and start on small limits.
      </p>
    </DocsLayout>
  );
}
