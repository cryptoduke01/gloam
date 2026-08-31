import { redirect } from "next/navigation";

// Trade now lives in the Vault hub. Preserve market/path/side params.
export default async function TradePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    if (typeof v === "string") params.set(k, v);
  }
  params.set("tab", "trade");
  redirect(`/app/vault?${params.toString()}`);
}
