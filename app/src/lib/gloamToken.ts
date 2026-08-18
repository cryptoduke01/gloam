/**
 * $GLOAM token, public page config.
 * Status ladder: preparing → coming-soon → live.
 * Flip fields here when the token goes live; the /token page reads this.
 * Keep it honest: no contract address, supply, or splits until they are real.
 */

export type TokenStatus = "preparing" | "coming-soon" | "testnet" | "live";

export const gloamToken = {
  ticker: "GLOAM",
  name: "Gloam",
  symbolDisplay: "$GLOAM",
  status: "coming-soon" as TokenStatus,
  chainLabel: "Robinhood Chain",
  chainId: 4663,
  /** Set when deployed. Leave null until the contract is live. */
  contractAddress: null as string | null,
  decimals: 18,
  totalSupplyLabel: "Revealed at launch",
  /** Short public line for nav / meta */
  tagline: "Coordination asset for private money on Robinhood Chain.",
  statusCopy: {
    preparing: "Not launched · Product first",
    "coming-soon": "Coming soon · Launching on Robinhood Chain",
    testnet: "Testnet only · No market value",
    live: "Live",
  },
  /** Hero copy for the coming-soon window */
  launch: {
    kicker: "Coming soon",
    headline: "$GLOAM is almost here",
    sub: "The private vault is live on testnet. The coordination asset that ties the rails together launches on Robinhood Chain. Contract details land on this page first, nowhere else.",
  },
  /** Planned roles, design targets, not live mechanics */
  utilities: [
    {
      id: "alignment",
      title: "Protocol alignment",
      body: "One asset that ties builders, users, and partners to the same private rails, not a meme bolted on after the fact.",
    },
    {
      id: "fees",
      title: "Fee & access",
      body: "Routes protocol fees and private-relay economics, and gates access tiers as mainnet volume grows. Specs ship with the launch, not before.",
    },
    {
      id: "governance",
      title: "Parameter voice",
      body: "A path for community input on pool parameters, verifier upgrades, and product priorities, after audits and mainnet, not instead of shipping.",
    },
    {
      id: "ecosystem",
      title: "Ecosystem gravity",
      body: "Partner integrations, Open House-style programs, and RH Chain builders need a clear Gloam surface. $GLOAM is that surface.",
    },
  ],
  /** Distribution intent, qualitative and honest. Exact numbers publish at launch. */
  distribution: [
    {
      label: "Community & users",
      body: "The largest share goes to the people who actually use the private rails, not insiders.",
    },
    {
      label: "Liquidity",
      body: "A meaningful allocation seeds deep, honest on-chain liquidity from day one.",
    },
    {
      label: "Ecosystem & partners",
      body: "Reserved for RH Chain builders, integrations, and partner programs.",
    },
    {
      label: "Team & treasury",
      body: "On a public vesting schedule with a cliff. No stealth unlocks, no silent mint.",
    },
  ],
  phases: [
    {
      n: "01",
      title: "Product",
      body: "Shield, private pay, and sealed trade live on Robinhood Chain testnet. The vault works.",
      state: "active" as const,
    },
    {
      n: "02",
      title: "Security",
      body: "Threat model, internal audit, and hardening in progress. Privacy earns a token only after it earns trust.",
      state: "active" as const,
    },
    {
      n: "03",
      title: "Token launch",
      body: "Deploy $GLOAM on Robinhood Chain, seed liquidity, and publish contract + supply here.",
      state: "next" as const,
    },
    {
      n: "04",
      title: "Utility online",
      body: "Fee routing, access tiers, and parameter voice switch on as mainnet volume grows.",
      state: "queued" as const,
    },
  ],
  principles: [
    "Contract address and supply go public the moment they exist, on this page first.",
    "No fake APY, points theater, or stealth mint.",
    "The product and privacy claims stand on their own, with or without a token.",
    "Team and treasury vest in public. No silent unlocks.",
  ],
  faqs: [
    {
      q: "Is $GLOAM live yet?",
      a: "Not yet. It is coming soon. The page is ready so the contract, supply, and links have one canonical home the moment it launches.",
    },
    {
      q: "Where will the real contract address be?",
      a: "Here, on gloam.trade/token, and on verified Gloam channels first. A contract address will never be DMed to you before it appears here.",
    },
    {
      q: "Is this a token sale?",
      a: "This page is not an offer to sell tokens or securities. Any distribution will be described clearly on this page and in official channels only.",
    },
    {
      q: "How do I get launch updates?",
      a: "Follow @gloamtrade on X and watch this page. Treat any other source claiming to sell $GLOAM as a scam.",
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
