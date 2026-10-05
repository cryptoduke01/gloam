import type { Metadata } from "next";
import Link from "next/link";
import { DocsLayout } from "@/components/DocsLayout";
import { FlowDiagram } from "@/components/docs/FlowDiagram";

export const metadata: Metadata = {
  title: "Proofs",
  description:
    "Prove an exact balance, that you hold at least an amount, or that you were paid, to one person you choose. What each proof shows, what it hides, and how anyone can check it.",
};

export default function DocsProofsPage() {
  return (
    <DocsLayout
      title="Proofs"
      lede="Your money in Gloam is private by default. A proof lets you show one fact about it to one person you choose: a balance, that you hold at least an amount, or that you were paid. They check it themselves, in their browser, against the live vault."
      glance={[
        { label: "Exact balance", value: "one balance, shown" },
        { label: "At least", value: "a minimum, balance hidden" },
        { label: "Payment", value: "the amount, or a minimum" },
        { label: "Check it", value: "in the browser, no wallet" },
      ]}
      quickLinks={[
        { href: "/app/disclose", label: "Make a proof" },
        { href: "/verify", label: "Check a proof" },
        { href: "/docs/privacy-model", label: "What stays private" },
        { href: "/docs/sdk/disclosure", label: "Selective disclosure (SDK)" },
      ]}
    >
      <h2>Three proofs</h2>
      <p>
        All three are made on your device from balances only you can open, and
        none of them can be used to move your money. Open{" "}
        <Link href="/app/disclose">Prove</Link> in the app and pick one.
      </p>

      <h3>Exact balance</h3>
      <p>
        Shows one of your private balances exactly: the asset and the amount. Use
        it when the number itself is the point, for example a lender asking what
        is in one account. It covers one balance, never your total.
      </p>

      <h3>At least (proof of funds)</h3>
      <p>
        Shows that you hold <strong>at least</strong> an amount you name, such as
        at least 10,000 USDG, without showing how much you really hold. Up to four
        of your balances in the same asset can back it, and the app picks the
        fewest that cover the amount. If it would take more than four, prove a
        smaller amount or combine balances first.
      </p>

      <h3>Payment (proof of payment)</h3>
      <p>
        Shows that you received a private payment. You choose whether it shows the
        exact amount, or only that it was at least a figure you pick. It works for
        payments sent to your Gloam address, claim links and payroll payouts, once
        you have claimed them.
      </p>

      <h2>What each one shows and hides</h2>
      <table>
        <thead>
          <tr>
            <th>Proof</th>
            <th>They see</th>
            <th>They never see</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Exact balance</td>
            <td>The asset and that one amount</td>
            <td>Your wallet, other balances, history</td>
          </tr>
          <tr>
            <td>At least</td>
            <td>The asset and the minimum you named</td>
            <td>Your real balance, which balances back it, your wallet, history</td>
          </tr>
          <tr>
            <td>Payment</td>
            <td>The asset, the amount or a minimum, and when it landed</td>
            <td>Your balance, your other payments, your wallet</td>
          </tr>
        </tbody>
      </table>
      <p>
        Proofs of funds and payment also carry two things you set: who the proof
        is for, and when it expires.
      </p>

      <h2>Made for one person</h2>
      <p>
        When you make an at least or payment proof, you say who it is for, like
        &quot;Acme Bank&quot; or &quot;my landlord&quot;, and how long it is good
        for: 1, 7 or 30 days. Both are sealed into the proof. Anyone can still
        read a forwarded copy, but it will say who it was made for and when it
        ran out, and changing either one breaks it.
      </p>

      <h2>How checking works</h2>
      <FlowDiagram
        title="What the verifier does"
        steps={[
          {
            n: "1",
            title: "Checks the math",
            body: "The zero-knowledge proof is checked in the browser with Gloam's published checking key. Nothing is sent to Gloam.",
          },
          {
            n: "2",
            title: "Checks who it is for",
            body: "The name, expiry, network and vault must match what was sealed into the proof.",
          },
          {
            n: "3",
            title: "Checks the live vault",
            body: "It reads the vault on Robinhood Chain or Tempo directly: the state the proof was made against, and for a payment, that the payment is there.",
          },
          {
            n: "4",
            title: "Checks it is still current",
            body: "For at least, that none of the backing balances has been spent since. For all of them, that the proof has not expired.",
          },
        ]}
      />
      <p>
        Each check is listed on the result with a plain pass, fail or could not
        check. A proof only reads as verified when every check passes. If the
        network cannot be reached, the result says so instead of guessing.
      </p>

      <h2>Limits worth knowing</h2>
      <ul>
        <li>
          <strong>Testnet only.</strong> Proofs run on Robinhood Chain and Tempo
          testnets with play money, using proving keys from a development
          ceremony. A production ceremony and an external audit come before
          mainnet. See the <Link href="/docs/production">production gate</Link>.
        </li>
        <li>
          <strong>At least publishes spend markers.</strong> A proof of funds
          carries a marker for each balance behind it, so the verifier can tell
          none were spent. The flip side: if you later spend one of those
          balances, whoever holds the proof can see that it was spent. Not where
          it went or how much.
        </li>
        <li>
          <strong>At least means &quot;can open at least this much&quot;.</strong>{" "}
          Strictly, a proof of funds shows the holder knows the keys to unspent
          balances worth at least the amount. A balance someone paid you was
          created by them, so until you move it, the sender knows its key too
          and could count it in a proof of their own. Balances you added
          yourself, or change left over after you pay someone, are yours alone.
        </li>
        <li>
          <strong>A payment proof points at its record.</strong>{" "}
          They can find the transaction that delivered it and when it landed. That transaction
          never shows the amount. It shows the sender&apos;s wallet only if they
          paid without Hide my wallet.
        </li>
        <li>
          <strong>Up to four balances</strong> can back one proof of funds.
        </li>
        <li>
          <strong>Expired is not the same as false.</strong> An expired proof may
          have been true when it was made. Ask for a fresh one.
        </li>
      </ul>

      <h2>How to check a proof</h2>
      <ol>
        <li>
          Open <Link href="/verify">gloam.trade/verify</Link>. No wallet or
          account needed.
        </li>
        <li>
          Paste the proof. It starts with <code>gloamfunds1:</code>,{" "}
          <code>gloampay1:</code> or <code>gloamdisc1:</code>. If you were sent a
          link, opening it fills the proof in for you. The proof travels after the
          # in the link, so it never reaches a server.
        </li>
        <li>
          Read the verdict, who it was made for and when it expires, then the
          list of checks.
        </li>
      </ol>
    </DocsLayout>
  );
}
