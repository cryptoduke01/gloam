/**
 * $GLOAM token — public page config.
 * Keep status "preparing" until mainnet deploy + clear utility.
 * Flip fields here when the token goes live; the /token page reads this.
 */

export type TokenStatus = "preparing" | "testnet" | "live";

export const gloamToken = {
  ticker: "GLOAM",
  name: "Gloam",
  symbolDisplay: "$GLOAM",
  status: "preparing" as TokenStatus,
  chainLabel: "Robinhood Chain",
  chainId: 4663,
  /** Set when deployed. Leave null while preparing. */
  contractAddress: null as string | null,
  decimals: 18,
  totalSupplyLabel: "TBD",
  /** Short public line for nav / meta */
  tagline: "Coordination asset for private money on Robinhood Chain.",
  statusCopy: {
    preparing: "Not launched · Product first",
    testnet: "Testnet only · No market value",
    live: "Live",
  },
  /** Planned roles — design targets, not live mechanics */
  utilities: [
    {
      id: "alignment",
      title: "Protocol alignment",
      body: "A single asset that ties builders, users, and partners to the same private rails — not a meme bolted on after the fact.",
    },
    {
      id: "fees",
      title: "Fee & access design",
      body: "Reserved for protocol fees, private-relay economics, or access tiers once mainnet volume and costs are real. Specs ship with the launch, not before.",
    },
    {
      id: "governance",
      title: "Parameter voice",
      body: "A path for community input on pool parameters, verifier upgrades, and product priorities — after audits and mainnet, not as a substitute for shipping.",
    },
    {
      id: "ecosystem",
      title: "Ecosystem gravity",
      body: "Partner integrations, Open House–style programs, and RH Chain builders need a clear Gloam surface. $GLOAM is that surface when we are ready.",
    },
  ],
  phases: [
    {
      n: "01",
      title: "Product",
      body: "Shield, private pay, sealed trade on Robinhood Chain. Prove the vault works.",
      state: "active" as const,
    },
    {
      n: "02",
      title: "Trust",
      body: "Audits, threat model, clear public docs. Privacy products earn a token only after they earn trust.",
      state: "next" as const,
    },
    {
      n: "03",
      title: "Utility design",
      body: "Lock fee paths, supply, unlocks, and what $GLOAM actually does. Publish before mint.",
      state: "queued" as const,
    },
    {
      n: "04",
      title: "Launch",
      body: "Deploy when product + utility + distribution are ready — not when every other RH project mints.",
      state: "queued" as const,
    },
  ],
  principles: [
    "No contract until utility and supply are public.",
    "No fake APY, points theater, or stealth mint.",
    "Product and privacy claims stand without a token.",
    "When live, contract + explorer links land on this page first.",
  ],
  faqs: [
    {
      q: "Is $GLOAM live?",
      a: "No. The ticker and page are prepared so the brand is ready. There is no tradable contract address yet.",
    },
    {
      q: "Why prepare a token page before launch?",
      a: "So partners, builders, and users have one canonical place for status, utility intent, and — later — contract details. Preparing is not launching.",
    },
    {
      q: "Is this a fundraising sale?",
      a: "This page is not an offer to sell tokens or securities. Any future distribution will be described clearly on this page and in official channels only.",
    },
    {
      q: "How do I get updates?",
      a: "Follow @gloamtrade on X and check gloam.trade/token. Contract addresses will never be DMed first.",
    },
  ],
  social: {
    x: "https://x.com/gloamtrade",
    site: "https://gloam.trade",
  },
} as const;

export function tokenStatusLabel(status: TokenStatus = gloamToken.status): string {
  return gloamToken.statusCopy[status];
}
