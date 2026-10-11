import { apiOk, newRequestId, API_VERSION } from "@/lib/partnersApi";

export const dynamic = "force-dynamic";

/** The Gloam API index. Needs no key; every other v1 endpoint does. */
export async function GET() {
  return apiOk(
    {
      name: "Gloam API",
      version: API_VERSION,
      docs: "https://gloam.trade/docs/partners",
      auth: "Authorization: Bearer gloam_test_... (keys from https://gloam.trade/partners)",
      testnet: true,
      charged: false,
      endpoints: [
        { method: "GET", path: "/api/v1/me", what: "The partner and key behind your key" },
        { method: "GET", path: "/api/v1/relay", what: "Relay readiness per network" },
        { method: "POST", path: "/api/v1/relay", what: "Submit a proven private payment, cash out or payment message, attributed to you" },
        { method: "POST", path: "/api/v1/deposits", what: "Attribute a deposit your app made, by transaction hash" },
        { method: "GET", path: "/api/v1/activity", what: "Your attributed volume and would-be commissions" },
        { method: "GET", path: "/api/v1/vaults", what: "Vault status on every network" },
        { method: "GET", path: "/api/v1/vaults/{network}", what: "Vault status on one network" },
        { method: "GET", path: "/api/v1/vaults/{network}/leaves", what: "The vault's public leaf list, to rebuild the tree" },
        { method: "POST", path: "/api/v1/proofs/verify", what: "Check a gloamfunds1, gloampay1, gloamroll1 or gloambal1 proof (gloamdisc1 is never ok)" },
        { method: "POST", path: "/api/v1/payment-requests", what: "Make a payment request link" },
        { method: "GET", path: "/api/v1/stats", what: "Public vault figures, as on /transparency" },
      ],
    },
    { requestId: newRequestId() }
  );
}
