import type { NextRequest } from "next/server";
import { isAdminAuthenticated } from "@/lib/adminAuth";
import { ApiError, jsonBody, portal } from "@/lib/partnersApi";
import { sameSiteJson } from "@/lib/partnersAuth";
import { getPartner, partnerView, readPartnerStats, PartnerError } from "@/lib/partners";
import { issueLinkCode, linkCodeView, listLinkCodes, revokeLinkCode } from "@/lib/partnerLinks";
import {
  addressChains,
  countAddresses,
  getPartnerAddresses,
  parseAddressList,
  setPartnerAddresses,
  type ParsedAddresses,
} from "@/lib/partnerAddresses";
import { PRIVATE_PAYMENTS_NOT_MATCHED, SWAPS_NOT_MATCHED } from "@/lib/partnerBackfill";
import { networkName } from "@/lib/networks";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function admin() {
  if (!(await isAdminAuthenticated())) throw new ApiError(401, "unauthorized", "Admin session required.");
}

function chainsView() {
  return addressChains().map((n) => ({ chainId: n.chainId, key: n.key, name: networkName(n) }));
}

/** Admin only, GET ?id=: one partner's breakdown (30 days), link codes and receiving addresses. */
export async function GET(req: NextRequest) {
  return portal(async () => {
    await admin();
    const id = new URL(req.url).searchParams.get("id") ?? "";
    const partner = await getPartner(id);
    if (!partner) throw new ApiError(404, "not_found", "No partner with that id.");
    const now = Date.now();
    const [stats, codes, addresses] = await Promise.all([readPartnerStats(partner.id, { recent: 50, days: 30 }), listLinkCodes(partner.id), getPartnerAddresses(partner.id)]);
    return {
      data: {
        partner: partnerView(partner),
        stats,
        codes: codes.map((c) => linkCodeView(c, now)),
        addresses,
        addressCount: countAddresses(addresses),
        chains: chainsView(),
        notMatched: { privatePayments: PRIVATE_PAYMENTS_NOT_MATCHED, swaps: SWAPS_NOT_MATCHED },
      },
    };
  });
}

/**
 * Admin only:
 *   { id, action: "issueCode", label?, expiresInDays? }
 *   { id, action: "revokeCode", code }
 *   { id, action: "setAddresses", text, chainId?, mode: "replace" | "add" }
 *     text: pasted lines or a CSV (`address` or `chain,address`); a line with no
 *     chain is for chainId. Only the partner's own addresses go in.
 */
export async function POST(req: NextRequest) {
  return portal(async () => {
    if (!sameSiteJson(req)) throw new ApiError(403, "bad_origin", "Change partners from the Gloam site.");
    await admin();
    const body = await jsonBody(req, 400_000);
    const id = typeof body.id === "string" ? body.id : "";
    const partner = await getPartner(id);
    if (!partner) throw new ApiError(404, "not_found", "No partner with that id.");
    switch (body.action) {
      case "issueCode": {
        const code = await issueLinkCode({ partnerId: partner.id, label: body.label, expiresInDays: body.expiresInDays, by: "admin" });
        return { data: { code: linkCodeView(code) }, status: 201 };
      }
      case "revokeCode": {
        const revoked = await revokeLinkCode({ code: String(body.code ?? ""), partnerId: partner.id });
        if (!revoked) throw new ApiError(404, "not_found", "This partner has no link code like that.");
        return { data: { code: linkCodeView(revoked) } };
      }
      case "setAddresses": {
        if (typeof body.text !== "string") throw new ApiError(400, "bad_request", "Send the addresses as text.");
        const chainId = body.chainId == null || body.chainId === "" ? null : Number(body.chainId);
        if (chainId != null && !addressChains().some((n) => n.chainId === chainId)) {
          throw new PartnerError("Pick a mainnet Gloam runs on.", 400, "bad_chain");
        }
        if (body.mode !== "replace" && body.mode !== "add") throw new ApiError(400, "bad_request", 'mode must be "replace" or "add".');
        const parsed = parseAddressList(body.text, chainId);
        let entries: ParsedAddresses["entries"] = parsed.entries;
        if (body.mode === "add") {
          const prev = await getPartnerAddresses(partner.id);
          const had = Object.entries(prev).flatMap(([chain, list]) => list.map((address) => ({ chainId: Number(chain), address })));
          entries = [...had, ...parsed.entries];
        }
        const addresses = await setPartnerAddresses(partner.id, entries);
        return {
          data: { addresses, addressCount: countAddresses(addresses), read: parsed.entries.length, rejected: parsed.rejected.slice(0, 50), rejectedCount: parsed.rejected.length },
        };
      }
      default:
        throw new ApiError(400, "bad_request", 'action must be "issueCode", "revokeCode" or "setAddresses".');
    }
  });
}
