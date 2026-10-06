import type { Metadata } from "next";
import Link from "next/link";
import { DocsLayout } from "@/components/DocsLayout";
import { FlowDiagram } from "@/components/docs/FlowDiagram";
import { SCREEN_LIST_INFO } from "@/lib/screening";

export const metadata: Metadata = {
  title: "What stays private",
  description:
    "The honest privacy model for Gloam: what an explorer still shows, what stays hidden, how strong the anonymity set is, and what we will not promise.",
};

export default function DocsPrivacyPage() {
  return (
    <DocsLayout
      title="What stays private"
      lede="Robinhood Chain is a public ledger. Gloam adds a shielded pool on top. Privacy here means unlinkability and hidden holdings, not that transactions vanish from the explorer. Here is exactly what that does and does not hide."
      glance={[
        { label: "Hidden", value: "the link, the bag" },
        { label: "Public", value: "deposits + exits" },
        { label: "Anon set", value: "more users = stronger" },
        { label: "Sealed swaps", value: "paused (H1)" },
      ]}
    >
      <FlowDiagram
        title="At a glance"
        steps={[
          {
            n: "✓",
            title: "In the vault",
            body: "While value sits in a note, your public wallet no longer shows it. Your holdings inside the pool are hidden.",
          },
          {
            n: "✓",
            title: "Private send (live)",
            body: "Pay inside the vault. The chain sees a transfer proof and two new commitments, not who paid whom or how much.",
          },
          {
            n: "✓",
            title: "Selective disclosure (live)",
            body: "Prove one balance to one party you choose, revealing nothing else.",
          },
          {
            n: "!",
            title: "Enter and exit are public",
            body: "Shield (deposit) and cash out (unshield) are ordinary public transactions. The amount and address are visible.",
          },
          {
            n: "✕",
            title: "Sealed swaps (paused)",
            body: "Private trade is disabled pending the H1 solvency work. Do not rely on it yet.",
          },
          {
            n: "!",
            title: "Anonymity set",
            body: "Unlinkability is only as strong as the crowd of notes to hide among. On a near-empty pool, an exit is traceable to your deposit.",
          },
        ]}
      />

      <h2>What an explorer actually shows</h2>
      <p>
        This is the part people get wrong, so it is worth stating plainly. Put
        your own address into the block explorer and you will find your shield
        deposit: a public transaction from your wallet, into the pool, for the
        exact amount, and its <code>Shielded</code> event carries your address,
        the amount, and the note commitment together. Nothing about the deposit
        is hidden.
      </p>
      <p>
        The <strong>commitment</strong> is a Poseidon hash (a 32-byte value). If
        you paste it into the explorer search you get nothing back, because it is
        not a transaction or an address, just a leaf in the pool&apos;s Merkle
        tree. Querying the contract returns only{" "}
        <code>commitmentSeen(commitment) == true</code>. The hash reveals no
        amount, no secret, and no owner on its own.
      </p>
      <p>
        The privacy is on the <strong>spend</strong>. When you later send or cash
        out, the zero-knowledge proof shows that you own <em>some</em> note in the
        tree and publishes a nullifier, without revealing <em>which</em> note. So
        a withdrawal to a fresh address, or a private send, cannot be linked back
        to your deposit. That unlinkability is the product.
      </p>

      <h2>What stays hidden</h2>
      <ul>
        <li>The link between your deposit and any later spend or exit</li>
        <li>How much you hold while it is in the vault</li>
        <li>Who paid whom, and how much, on a private send (live on testnet)</li>
      </ul>

      <h2>What the public still sees</h2>
      <ul>
        <li>Each shield deposit: your address, the asset, and the amount</li>
        <li>Each cash out: the asset, the amount, and the destination address</li>
        <li>That the pool was used, the caller of each transaction, and timing</li>
        <li>Every commitment and nullifier as opaque hashes, plus the pool total</li>
      </ul>

      <h2>The anonymity set is the whole game</h2>
      <p>
        A shielded pool hides you in a crowd. If you are the only note of your
        size, an exit of that size is trivially yours. Today the testnet pool is
        small, so treat unlinkability as weak until it fills up. This is true of
        every shielded pool, Gloam included. We would rather say it than let you
        assume more privacy than you have.
      </p>

      <h2>What we will not promise</h2>
      <ul>
        <li>Invisibility from law, courts, or a subpoena</li>
        <li>Privacy once you cash out to a public address</li>
        <li>Safety if your device or browser is compromised</li>
        <li>Strong anonymity while the pool has few users</li>
        <li>Recovery if you lose a note secret</li>
      </ul>

      <h2>Private from the public, not from an operator</h2>
      <p>
        Some chains offer privacy through operator-run environments, for example
        Tempo Zones, where a designated operator sees every transaction inside
        the zone and only the wider public is kept out. Gloam is a different
        model. It is a self-custodial shielded pool with no operator in the
        middle: only you hold the note secret, and only a party you choose sees a
        balance, through selective disclosure. When Gloam settles a private agent
        payment over x402, the payer and the payee learn the amount and no one
        else does. Where a regulated asset needs oversight, compliance visibility
        is opt-in per payment through an issuer-scoped disclosure, never a
        standing view handed to an operator.
      </p>

      <h2 id="security">Security and compliance</h2>
      <h3>Passkey lock (optional)</h3>
      <p>
        Your notes are encrypted at rest in this browser under a device key. In{" "}
        <Link href="/app/settings">Settings</Link> you can protect that key with
        a passkey: Face ID, Touch ID or a security key. Gloam asks
        the passkey for a secret only it can produce (the WebAuthn PRF
        extension), uses it to wrap the key, and stores only the wrapped copy.
        Each time you open the app, the passkey unlocks it. There is no server
        or account behind this, and removing the passkey asks for it first.
      </p>
      <p>
        Backups are separate. A backup holds your balances themselves, so
        restoring one needs only the backup, plus its passphrase if you set one,
        on any browser. It never needs the passkey. If you lose the passkey, a
        backup is the only way back. Browsers or passkeys without PRF support
        keep the device key, unchanged.
      </p>
      <h3>Sanctions screening</h3>
      <p>
        Before a deposit, and before the relay submits a cash out, Gloam checks
        the public addresses involved against the OFAC list of sanctioned digital
        currency addresses: the wallet that deposits, and the address a cash out
        pays. Nothing private is screened. Notes, receive tags, amounts and
        private sends are never looked at.
      </p>
      <ul>
        <li>
          <strong>Against what:</strong> a snapshot of the EVM addresses in the{" "}
          <a href={SCREEN_LIST_INFO.source} target="_blank" rel="noreferrer">
            0xB10C OFAC list
          </a>
          , built from the OFAC SDN list. It ships with the app with its source
          commit and date (snapshot of {SCREEN_LIST_INFO.snapshotDate},{" "}
          {SCREEN_LIST_INFO.count} addresses) and is refreshed by a script, so it
          can lag the official list until the next refresh.
        </li>
        <li>
          <strong>When:</strong> in the app before your wallet signs a deposit,
          on the server at <code>/api/screen</code>, and inside the relay before
          it checks or sends anything.
        </li>
        <li>
          <strong>What you see:</strong> a blocked wallet gets one neutral
          message, &quot;This wallet can&apos;t use Gloam.&quot;, and nothing
          more.
        </li>
        <li>
          <strong>Optional:</strong> an operator can add the Chainalysis free
          sanctions API by setting <code>CHAINALYSIS_API_KEY</code> on the server.
        </li>
      </ul>
      <p>
        Screening lives in the app and the relay, not in the vault contract, which
        stays permissionless.
      </p>
      <h3>Stablecoin issuer policies on Tempo (TIP-403)</h3>
      <p>
        Every stablecoin on Tempo points at a transfer policy in Tempo&apos;s
        TIP-403 registry: open to all, closed to all, the issuer&apos;s allowlist
        or blocklist, or separate lists for senders and recipients. The token
        checks it on every transfer. Gloam respects it at the only two places
        value moves: a deposit is a transfer from your wallet into the vault, and
        a cash out is a transfer from the vault to a public address.
      </p>
      <ul>
        <li>
          <strong>Deposit:</strong> your wallet must be allowed to send the
          stablecoin, and the vault must be allowed to receive it.
        </li>
        <li>
          <strong>Cash out:</strong> the vault must be allowed to send it, and
          the destination must be allowed to receive it. If the destination&apos;s
          own Tempo receive policy would refuse the vault, Gloam says so instead
          of letting the payment be held.
        </li>
        <li>
          <strong>When:</strong> next to sanctions screening, in the app before
          your wallet signs, at <code>/api/screen</code>, and inside the relay.
          These are read-only calls to the chain. A wallet the issuer does not
          allow sees the same neutral message.
        </li>
        <li>
          <strong>Private sends</strong> move no tokens, so the policy never
          sees them, and nothing private is read.
        </li>
      </ul>
      <p>
        The token enforces its policy on-chain whatever Gloam does. That makes
        this compliant privacy with no operator: the issuer keeps its controls
        at the public edges, nobody sees inside the vault, and there is no
        Gloam operator in between. As of October 2026 on Tempo Moderato, OUSD
        and PathUSD both use policy 1, open to all.
      </p>
      <p>
        <strong>Issuer freeze risk.</strong> An issuer can also pause its
        stablecoin, or set a policy that stops the vault itself from sending it.
        Then no balance in that stablecoin can be cashed out until the issuer
        lifts it, and nobody, the Gloam team included, can move it out another
        way. The app reads the vault&apos;s standing for each stablecoin, shows
        it as &quot;Issuer policy&quot; in the &quot;What the explorer
        shows&quot; card, and warns before you deposit or cash out if the vault
        is blocked.
      </p>
      <h3>No admin withdraw</h3>
      <p>
        Nobody, including the Gloam team, can move pooled funds. The vault has no
        withdraw function for its owner: money leaves only through a cash out
        that carries a valid proof.
      </p>
      <h3>Timelock on rule changes</h3>
      <p>
        After setup, every change to how proofs, rates or prices are checked is
        queued on-chain and can only take effect three days later, in public.
      </p>
      <h3>Relay limits</h3>
      <p>
        The relay submits only the vault&apos;s private send and cash out and the
        payment message board. It dry-runs every payment first, cannot change a
        cash out&apos;s recipient or amount (both are bound in the proof), and
        rate limits each device and each network.
      </p>

      <h2>Before mainnet</h2>
      <p>
        Gloam is testnet only today, and there are honest gaps we will not ship to
        real value without closing:
      </p>
      <ul>
        <li>
          <strong>Dev-ceremony proving keys.</strong> Mainnet needs a real
          multi-party trusted setup and an external audit.
        </li>
        <li>
          <strong>Sealed swaps are disabled</strong> pending the H1 solvency fix.
        </li>
      </ul>
      <p>
        See <Link href="/docs/production">the production gate</Link> for the full
        list. More detail: <Link href="/docs/encryption">How shield works</Link>{" "}
        and the <Link href="/whitepaper">whitepaper</Link>.
      </p>
    </DocsLayout>
  );
}
