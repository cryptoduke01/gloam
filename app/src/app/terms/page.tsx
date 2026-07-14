import type { Metadata } from "next";
import { LegalLayout } from "@/components/LegalLayout";

export const metadata: Metadata = { title: "Terms of Use" };

export default function TermsPage() {
  return (
    <LegalLayout title="Terms of Use" updated="July 14, 2026">
      <p>
        These Terms of Use (“Terms”) govern access to and use of the websites,
        applications, documentation, and interfaces operated under gloam.trade
        (collectively, the “Services”) by Gloam (“Gloam,” “we,” “us”). By using
        the Services, you agree to these Terms.
      </p>
      <h2 className="font-display text-2xl text-white">1. Experimental software</h2>
      <p>
        Gloam is early-stage, experimental software for interacting with
        blockchain networks, including Robinhood Chain. Features such as
        shielded balances, private transfers, and private trading may be
        incomplete, unavailable, or change without notice. There is no guarantee
        of uptime, correctness, or fitness for any purpose.
      </p>
      <h2 className="font-display text-2xl text-white">2. Eligibility</h2>
      <p>
        You must be able to form a binding contract under applicable law and
        must not use the Services if you are a person or entity prohibited from
        doing so under the laws of your jurisdiction or under sanctions
        administered by relevant authorities. You are solely responsible for
        compliance with local law.
      </p>
      <h2 className="font-display text-2xl text-white">3. Not financial advice</h2>
      <p>
        Nothing on the Services is an offer, solicitation, or recommendation to
        buy, sell, or hold any asset, security, or derivative. Tokenized equities
        and other digital assets involve substantial risk of loss. We do not
        provide investment, legal, accounting, or tax advice.
      </p>
      <h2 className="font-display text-2xl text-white">4. Wallets and keys</h2>
      <p>
        You are solely responsible for your wallets, private keys, seed phrases,
        devices, and authentication methods. We never custody your keys. Loss of
        keys may result in irreversible loss of assets. Transactions you sign
        are final when confirmed on-chain.
      </p>
      <h2 className="font-display text-2xl text-white">5. Privacy features</h2>
      <p>
        Privacy-enhancing features do not guarantee anonymity, unlinkability, or
        immunity from investigation. Unshielded activity, bridges, third-party
        services, and implementation bugs may reveal information. You use
        privacy features at your own risk and are responsible for understanding
        their limitations.
      </p>
      <h2 className="font-display text-2xl text-white">6. Prohibited use</h2>
      <p>
        You may not use the Services to violate law, evade sanctions, commit
        fraud, launder funds, exploit vulnerabilities, attack infrastructure, or
        interfere with other users. We may restrict access where we believe
        misuse is occurring, to the extent we control the interface.
      </p>
      <h2 className="font-display text-2xl text-white">7. Third-party services</h2>
      <p>
        The Services may link to or depend on third parties (RPCs, wallets,
        bridges, indexers, DEXs, analytics). We do not control those services and
        are not liable for their acts, failures, or terms.
      </p>
      <h2 className="font-display text-2xl text-white">8. Intellectual property</h2>
      <p>
        Gloam branding, site design, and original content are owned by us or our
        licensors. You may not copy or reverse engineer the Services except as
        permitted by law. Open-source components are governed by their licenses.
      </p>
      <h2 className="font-display text-2xl text-white">9. Disclaimers</h2>
      <p>
        THE SERVICES ARE PROVIDED “AS IS” AND “AS AVAILABLE” WITHOUT WARRANTIES
        OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING MERCHANTABILITY, FITNESS FOR A
        PARTICULAR PURPOSE, AND NON-INFRINGEMENT. WE DO NOT WARRANT THAT THE
        SERVICES WILL BE SECURE, ERROR-FREE, OR UNINTERRUPTED.
      </p>
      <h2 className="font-display text-2xl text-white">10. Limitation of liability</h2>
      <p>
        TO THE MAXIMUM EXTENT PERMITTED BY LAW, GLOAM AND ITS CONTRIBUTORS SHALL
        NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR
        PUNITIVE DAMAGES, OR ANY LOSS OF PROFITS, DATA, OR ASSETS, ARISING FROM
        YOUR USE OF THE SERVICES OR BLOCKCHAIN NETWORKS, EVEN IF ADVISED OF THE
        POSSIBILITY.
      </p>
      <h2 className="font-display text-2xl text-white">11. Indemnity</h2>
      <p>
        You agree to indemnify and hold harmless Gloam and its contributors from
        claims arising out of your use of the Services, your violation of these
        Terms, or your violation of any rights of another.
      </p>
      <h2 className="font-display text-2xl text-white">12. Changes</h2>
      <p>
        We may update these Terms by posting a revised version with a new “Last
        updated” date. Continued use after changes constitutes acceptance.
      </p>
      <h2 className="font-display text-2xl text-white">13. Contact</h2>
      <p>
        Questions: contact via the channels listed on gloam.trade or{" "}
        <a className="text-lime hover:underline" href="https://x.com/gloamtrade">
          @gloamtrade
        </a>
        .
      </p>
    </LegalLayout>
  );
}
