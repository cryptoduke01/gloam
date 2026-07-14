import type { Metadata } from "next";
import { LegalLayout } from "@/components/LegalLayout";

export const metadata: Metadata = { title: "Disclosures" };

export default function DisclosuresPage() {
  return (
    <LegalLayout title="Disclosures" updated="July 14, 2026">
      <p>
        Please read these disclosures carefully before using Gloam or any related
        interface.
      </p>
      <h2 className="font-display text-2xl text-white">Risk of loss</h2>
      <p>
        Digital assets, including cryptocurrencies and tokenized real-world
        assets such as stock tokens, can lose value rapidly and in full. Past
        performance is not indicative of future results. You may lose some or
        all of the assets you use with the protocol or related smart contracts.
      </p>
      <h2 className="font-display text-2xl text-white">Smart contract & protocol risk</h2>
      <p>
        Smart contracts may contain bugs, economic design flaws, or be exploited.
        Upgrades, admin keys, oracles, bridges, and sequencers introduce
        additional risk. Audits, if any, do not eliminate risk.
      </p>
      <h2 className="font-display text-2xl text-white">Privacy is not absolute</h2>
      <p>
        Shielded balances and private transactions reduce public visibility;
        they do not make activity invisible to all parties in all conditions.
        Timing analysis, amount correlation at the edge of a privacy set, user
        error, malware, and legal process may still expose information.
      </p>
      <h2 className="font-display text-2xl text-white">Regulatory uncertainty</h2>
      <p>
        Tokenized equities and privacy technologies sit in evolving regulatory
        environments. Availability of assets and features may depend on
        jurisdiction. You are responsible for determining whether use is lawful
        for you.
      </p>
      <h2 className="font-display text-2xl text-white">No custody</h2>
      <p>
        Gloam interfaces do not custody user funds. You interact with networks
        and contracts through your own wallet. Support cannot recover lost keys
        or reverse confirmed transactions.
      </p>
      <h2 className="font-display text-2xl text-white">Third-party & chain risk</h2>
      <p>
        Robinhood Chain, Ethereum, bridges, RPCs, and other infrastructure may
        halt, reorg, censor, or fail. We do not control those systems.
      </p>
      <h2 className="font-display text-2xl text-white">Interface only</h2>
      <p>
        Website and app UIs may be one of several ways to interact with
        underlying contracts. The interface can go offline while contracts
        remain reachable by other means.
      </p>
      <h2 className="font-display text-2xl text-white">Forward-looking statements</h2>
      <p>
        Roadmaps, “coming soon” features, and testnet plans are aspirational.
        Nothing obligates us to ship any feature on any timeline.
      </p>
      <h2 className="font-display text-2xl text-white">Related documents</h2>
      <p>
        <a href="/terms" className="text-lime hover:underline">
          Terms of Use
        </a>
        {" · "}
        <a href="/privacy" className="text-lime hover:underline">
          Privacy Policy
        </a>
        {" · "}
        <a href="/cookies" className="text-lime hover:underline">
          Cookie Policy
        </a>
      </p>
    </LegalLayout>
  );
}
