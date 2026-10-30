import { headers } from "next/headers";
import { hitRateLimit } from "@/lib/mcpRemote/rateLimit";
import { readBalances, resolveEnsName } from "@/lib/xray/balances";
import { headlineCard, walletCard } from "@/lib/xray/card";
import { parseXrayQuery, shortAddress } from "@/lib/xray/input";

export const alt = "What the public can see about this wallet";
export { size, contentType } from "@/lib/docsCard";
// read per request and never written to Next's cache: that would keep the wallet in a stored path
export const dynamic = "force-dynamic";

/**
 * Previews per IP per minute. Crawlers fetch from a few IPs, so this is high,
 * and a preview past it gets the plain headline, never an error.
 */
const PER_IP_PER_MIN = 120;
/**
 * Crawlers give up on a slow image, so the card takes what it can read in this
 * long. Prices are normally cached (a person just looked at the page), and a
 * cold read of them takes about six seconds.
 */
const BUDGET_MS = 7_000;

export default async function OpenGraphImage({ params }: { params: Promise<{ address: string }> }) {
  const query = parseXrayQuery((await params).address);
  if (query.kind === "invalid") return headlineCard();

  const list = await headers();
  const ip = list.get("x-forwarded-for")?.split(",")[0]?.trim() || list.get("x-real-ip")?.trim() || "local";
  const rate = await hitRateLimit(ip, "xray-card", PER_IP_PER_MIN);
  if (!rate.allowed) return headlineCard();

  const who = query.kind === "address" ? shortAddress(query.address) : query.name;
  const read = async () => {
    const address = query.kind === "address" ? query.address : await resolveEnsName(query.name);
    if (!address) return null;
    const b = await readBalances(address, BUDGET_MS - 500);
    // no prices in time: the total would be short, so the card shows no number
    return b.priced ? b.totalUsd : null;
  };
  const usd = await Promise.race([
    read().catch(() => null),
    new Promise<null>((resolve) => setTimeout(() => resolve(null), BUDGET_MS)),
  ]);
  return walletCard({ usd, who });
}
