"use client";

import { AppLink } from "@/components/AppLink";
import { useStocksNoticeClosed } from "@/components/app/StocksLiveNotice";

/**
 * The private-stocks line. On the site it always shows. In the app it shows
 * only on Robinhood Chain mainnet, where the swap actually lists the stocks,
 * and it waits while the app's own notice (StocksLiveNotice) says the same
 * thing, except where that notice stands aside (`alone`, the Swap itself).
 * The position stays private. The token and the amount of a swap stay public,
 * so the vault line says that and the home line does not claim otherwise.
 */
export function StocksLiveNote({
  chainId,
  where,
  alone = false,
}: {
  chainId?: number;
  where: "home" | "vault";
  alone?: boolean;
}) {
  const noticeClosed = useStocksNoticeClosed();
  if (chainId !== undefined && chainId !== 4663) return null;
  if (chainId !== undefined && !alone && !noticeClosed) return null;
  return (
    <p className="flex items-start gap-2.5 text-[14.5px] leading-snug text-soft">
      <span aria-hidden className="mt-[0.45em] h-1.5 w-1.5 shrink-0 rounded-full bg-sealed" />
      <span>
        {where === "home" ? (
          <>
            Private stocks are live on Robinhood Chain. Your position stays in your private balance.{" "}
            <AppLink href="/app/vault?tab=swap" className="text-foreground underline underline-offset-4">
              Swap
            </AppLink>
          </>
        ) : (
          <>Private stocks are live. Your position stays in your private balance. The token and the amount of a swap stay public.</>
        )}
      </span>
    </p>
  );
}
