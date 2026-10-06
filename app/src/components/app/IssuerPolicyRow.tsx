"use client";

import { policyLabel } from "@/lib/tip403";
import { useTip403Policy } from "@/lib/tip403Client";

/**
 * One row for a "what the explorer shows" card on Tempo: the stablecoin's
 * TIP-403 issuer policy, which is public on-chain and checked before the wallet
 * signs. Renders nothing on other chains or for other assets.
 */
export function IssuerPolicyRow({
  chainId,
  asset,
  flow,
}: {
  chainId: number;
  asset: string | null | undefined;
  flow: "deposit" | "cashout";
}) {
  const view = useTip403Policy(chainId, asset);
  if (!view) return null;
  const notice = view.notices[flow];
  return (
    <div className="flex h-11 items-center justify-between gap-3">
      <dt className="text-mute">Issuer policy (TIP-403)</dt>
      <dd
        className={`truncate ${notice ? "text-danger" : "text-foreground"}`}
        title={notice ?? `Policy ${view.status.policyId}, checked before you sign`}
      >
        {notice ? (view.status.paused ? "Paused by issuer" : "Blocks the vault") : policyLabel(view.status)}
      </dd>
    </div>
  );
}
