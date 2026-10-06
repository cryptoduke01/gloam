import { jsonBody, withApiKey } from "@/lib/partnersApi";
import { verifyProofText } from "../../_lib/verify";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Check a Gloam proof on the server: { proof: "gloamfunds1:..." | "gloampay1:..." |
 * "gloamroll1:..." | "gloamdisc1:..." }. Returns ok plus every check the
 * /verify page shows, in order. ok is false for an expired proof.
 */
export async function POST(req: Request) {
  return withApiKey(req, async () => {
    const body = await jsonBody(req);
    return { data: await verifyProofText(body.proof) };
  });
}
