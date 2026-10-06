import { withApiKey } from "@/lib/partnersApi";
import { vaultStatuses } from "../_lib/vaults";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Vault status on every network: pool, assets, relay readiness, tree size and root. */
export async function GET(req: Request) {
  return withApiKey(req, async () => ({ data: { vaults: await vaultStatuses() } }));
}
