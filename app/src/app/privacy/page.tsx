import type { Metadata } from "next";
import { LegalLayout } from "@/components/LegalLayout";

export const metadata: Metadata = { title: "Privacy Policy" };

export default function PrivacyPage() {
  return (
    <LegalLayout title="Privacy Policy" updated="July 14, 2026">
      <p>
        This Privacy Policy describes how Gloam (“we,” “us”) handles information
        in connection with gloam.trade and related Services. Blockchain
        transactions you broadcast are public by nature unless a privacy
        protocol applies — and even then, guarantees are limited.
      </p>
      <h2 className="font-display text-2xl text-foreground">1. Information we may collect</h2>
      <p>
        <strong className="text-foreground">Wallet data.</strong> Public addresses you
        connect, chain IDs, and transaction hashes you initiate through our
        interfaces.
      </p>
      <p>
        <strong className="text-foreground">Usage data.</strong> Pages viewed, referrers,
        approximate location derived from IP, device/browser type, and
        diagnostics if you enable analytics cookies.
      </p>
      <p>
        <strong className="text-foreground">Communications.</strong> Messages you send
        us via email, social, or forms.
      </p>
      <p>
        We do not ask for seed phrases or private keys. Never share them with
        anyone claiming to represent Gloam.
      </p>
      <h2 className="font-display text-2xl text-foreground">2. On-chain data</h2>
      <p>
        Activity on public blockchains is visible to anyone. Shielded or private
        features may reduce what is visible on explorers, but metadata, timing,
        amounts at shield/unshield boundaries, and third-party infrastructure
        may still reveal information. We do not control base-layer networks.
      </p>
      <h2 className="font-display text-2xl text-foreground">3. How we use information</h2>
      <p>
        To operate and improve the Services, secure systems, debug issues,
        understand aggregate usage, communicate about the product, and comply
        with law. We do not sell your personal information.
      </p>
      <h2 className="font-display text-2xl text-foreground">4. Cookies</h2>
      <p>
        We use essential cookies for site function and consent preferences.
        Optional analytics cookies load only if you accept them. Details:{" "}
        <a href="/cookies" className="text-lime hover:underline">
          Cookie Policy
        </a>
        .
      </p>
      <h2 className="font-display text-2xl text-foreground">5. Sharing</h2>
      <p>
        We may share data with infrastructure providers (hosting, CDN,
        analytics if enabled), professional advisors, or authorities when
        required by law. Wallet addresses you use on-chain are shared with the
        network by design when you transact.
      </p>
      <h2 className="font-display text-2xl text-foreground">6. Retention</h2>
      <p>
        We retain information only as long as needed for the purposes above,
        unless a longer period is required by law. On-chain data persists for
        the life of the network.
      </p>
      <h2 className="font-display text-2xl text-foreground">7. Security</h2>
      <p>
        We use reasonable technical and organizational measures, but no method
        of transmission or storage is fully secure. You are responsible for
        securing your own devices and wallets.
      </p>
      <h2 className="font-display text-2xl text-foreground">8. International transfers</h2>
      <p>
        Services may be hosted in multiple regions. By using them, you
        understand information may be processed outside your country.
      </p>
      <h2 className="font-display text-2xl text-foreground">9. Your choices</h2>
      <p>
        You may disconnect your wallet, clear cookies, and adjust consent.
        Depending on your jurisdiction, you may have rights to access, correct,
        or delete certain personal data we hold off-chain. Contact us to
        exercise those rights.
      </p>
      <h2 className="font-display text-2xl text-foreground">10. Children</h2>
      <p>
        The Services are not directed to children under 18 (or the age of
        majority where you live). We do not knowingly collect their data.
      </p>
      <h2 className="font-display text-2xl text-foreground">11. Changes</h2>
      <p>
        We may update this Policy by posting a new version with a revised date.
      </p>
      <h2 className="font-display text-2xl text-foreground">12. Contact</h2>
      <p>
        Privacy questions:{" "}
        <a className="text-lime hover:underline" href="https://x.com/gloamtrade">
          @gloamtrade
        </a>
        .
      </p>
    </LegalLayout>
  );
}
