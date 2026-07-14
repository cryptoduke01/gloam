"use client";

import Link from "next/link";
import { useMemo } from "react";
import {
  useAccount,
  useBalance,
  useChainId,
  useReadContracts,
} from "wagmi";
import { AsciiImage } from "@/components/AsciiImage";
import { PRODUCT_CHAIN_ID, formatEth, shortAddress } from "@/lib/chain";
import { FAUCET_BLURB, FAUCET_URL } from "@/lib/faucet";
import { useLiveMarkets } from "@/hooks/useLiveMarkets";
import { useTradingSettings } from "@/hooks/useTradingSettings";
import {
  formatMark,
  formatTokenAmount,
  formatUsd,
} from "@/lib/markets";
import { TESTNET_STOCK_TOKENS, erc20BalanceOfAbi } from "@/lib/tokens";
import { ActivityFeed } from "./ActivityFeed";
import { ConnectButton } from "./ConnectButton";
import { NetworkPulse } from "./NetworkPulse";
import { ReceiveCard } from "./ReceiveCard";
import { Sparkline } from "./Sparkline";
import { StatusPill } from "./StatusPill";

export function PortfolioView() {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const onProduct = chainId === PRODUCT_CHAIN_ID;
  const { settings } = useTradingSettings();
  const { data: marketData } = useLiveMarkets();
  const ethUsd = marketData?.ethUsd ?? null;
  const markets = marketData?.markets ?? [];

  const { data: bal, isLoading } = useBalance({
    address,
    chainId: PRODUCT_CHAIN_ID,
    query: { enabled: Boolean(address) },
  });

  const tokenContracts = useMemo(
    () =>
      TESTNET_STOCK_TOKENS.map((t) => ({
        address: t.address,
        abi: erc20BalanceOfAbi,
        functionName: "balanceOf" as const,
        args: [address!] as const,
        chainId: PRODUCT_CHAIN_ID,
      })),
    [address]
  );

  const { data: tokenBals } = useReadContracts({
    contracts: tokenContracts,
    query: { enabled: Boolean(address && onProduct) },
  });

  const positions = useMemo(() => {
    return TESTNET_STOCK_TOKENS.map((t, i) => {
      const raw =
        tokenBals?.[i]?.status === "success"
          ? (tokenBals[i].result as bigint)
          : BigInt(0);
      const m = markets.find((x) => x.id === t.id);
      const mark = m?.mark ?? 0;
      const amount = Number(raw) / 10 ** t.decimals;
      const usd = amount * mark;
      return {
        ...t,
        raw,
        amount,
        mark,
        usd,
        change24h: m?.change24h ?? 0,
        spark: m?.spark ?? [],
        live: m?.source === "live",
      };
    }).filter((p) =>
      settings.hideZeroBalances ? p.raw > BigInt(0) : true
    );
  }, [tokenBals, markets, settings.hideZeroBalances]);

  const ethAmt = bal ? Number(bal.value) / 1e18 : 0;
  const ethUsdVal = ethUsd != null ? ethAmt * ethUsd : null;
  const stocksUsd = positions.reduce((s, p) => s + p.usd, 0);
  const totalUsd =
    ethUsdVal != null ? ethUsdVal + stocksUsd : stocksUsd > 0 ? stocksUsd : null;

  return (
    <div className="space-y-8">
      <NetworkPulse />

      <a
        href={FAUCET_URL}
        target="_blank"
        rel="noreferrer"
        className="flex flex-col gap-2 rounded-xl border border-lime/35 bg-panel px-5 py-4 transition-colors hover:border-lime sm:flex-row sm:items-center sm:justify-between"
      >
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-lime">
            Testnet faucet
          </p>
          <p className="mt-1 text-sm text-mute">{FAUCET_BLURB}</p>
        </div>
        <span className="inline-flex min-h-10 shrink-0 items-center rounded-md bg-lime px-4 text-sm font-semibold text-black">
          Open faucet →
        </span>
      </a>

      {/* Net worth */}
      <div className="grid gap-4 lg:grid-cols-12">
        <div className="overflow-hidden rounded-xl border border-line bg-panel lg:col-span-7">
          <div className="relative h-36 border-b border-line sm:h-40">
            <AsciiImage
              src="/ascii/shield.png"
              alt=""
              tone="plate"
              className="h-full w-full"
              sizes="60vw"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-panel via-transparent to-transparent" />
            <div className="absolute bottom-4 left-4 right-4">
              <StatusPill tone="lime">Portfolio</StatusPill>
              <p className="mt-2 font-display text-2xl text-foreground sm:text-3xl">
                {totalUsd != null && settings.showUsd
                  ? formatUsd(totalUsd)
                  : isConnected
                    ? `${formatEth(bal?.value ?? BigInt(0))} ETH`
                    : "—"}
              </p>
              {totalUsd != null && settings.showUsd && isConnected && (
                <p className="mt-1 text-sm text-mute">
                  {formatEth(bal?.value ?? BigInt(0))} ETH
                  {stocksUsd > 0
                    ? ` + ${positions.filter((p) => p.raw > BigInt(0)).length} stocks`
                    : ""}
                </p>
              )}
            </div>
          </div>

          <div className="grid gap-4 p-5 sm:grid-cols-2 sm:p-6">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-mute">
                ETH
              </p>
              {!isConnected ? (
                <p className="mt-2 font-display text-2xl text-mute">—</p>
              ) : isLoading ? (
                <p className="mt-2 font-display text-2xl text-mute">…</p>
              ) : (
                <>
                  <p className="mt-2 font-display text-2xl text-foreground">
                    {formatEth(bal?.value ?? BigInt(0))}
                  </p>
                  {ethUsdVal != null && settings.showUsd && (
                    <p className="mt-0.5 text-sm text-mute">
                      {formatUsd(ethUsdVal)}
                    </p>
                  )}
                </>
              )}
            </div>
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-mute">
                Stocks
              </p>
              <p className="mt-2 font-display text-2xl text-foreground">
                {settings.showUsd && stocksUsd > 0
                  ? formatUsd(stocksUsd)
                  : `${positions.filter((p) => p.raw > BigInt(0)).length} tokens`}
              </p>
              <p className="mt-0.5 text-xs text-mute">
                From faucet · live marks
              </p>
            </div>
          </div>

          {!isConnected && (
            <div className="border-t border-line px-5 py-4 sm:px-6">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm text-mute">Connect to load balances.</p>
                <ConnectButton />
              </div>
            </div>
          )}
          {isConnected && !onProduct && (
            <div className="border-t border-line px-5 py-4 sm:px-6">
              <p className="text-sm text-amber-600 dark:text-amber-500">
                Switch to Robinhood testnet.
              </p>
              <div className="mt-3">
                <ConnectButton />
              </div>
            </div>
          )}
          {isConnected && address && onProduct && (
            <div className="border-t border-line px-5 py-3 font-mono text-[11px] text-mute sm:px-6">
              {shortAddress(address, 6)}
            </div>
          )}
        </div>

        <div className="flex flex-col gap-3 lg:col-span-5">
          <div className="rounded-xl border border-line bg-panel p-5 sm:p-6">
            <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-mute">
              Quick
            </p>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <Link
                href="/app/send"
                className="inline-flex min-h-11 items-center justify-center rounded-md bg-lime text-sm font-semibold text-black hover:opacity-90"
              >
                Send
              </Link>
              <Link
                href="/app/trade"
                className="inline-flex min-h-11 items-center justify-center rounded-md border border-line text-sm font-medium text-foreground hover:border-mute"
              >
                Trade
              </Link>
              <Link
                href="/app/markets"
                className="inline-flex min-h-11 items-center justify-center rounded-md border border-line text-sm font-medium text-foreground hover:border-mute"
              >
                Markets
              </Link>
              <Link
                href="/app/settings"
                className="inline-flex min-h-11 items-center justify-center rounded-md border border-line text-sm font-medium text-foreground hover:border-mute"
              >
                Settings
              </Link>
            </div>
          </div>
          <ReceiveCard />
        </div>
      </div>

      {/* Holdings */}
      <div>
        <div className="mb-3 flex items-center justify-between">
          <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-mute">
            Holdings
          </p>
          <StatusPill tone="lime">Onchain</StatusPill>
        </div>
        <div className="overflow-hidden rounded-xl border border-line bg-panel">
          {!isConnected ? (
            <p className="px-4 py-8 text-center text-sm text-mute">
              Connect to see stock tokens from the faucet.
            </p>
          ) : (
            <ul>
              {positions.map((p) => (
                <li
                  key={p.id}
                  className="flex items-center gap-3 border-b border-line px-4 py-3.5 last:border-0"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-foreground">{p.symbol}</p>
                      {p.live && <StatusPill tone="lime">Live</StatusPill>}
                    </div>
                    <p className="text-xs text-mute">{p.name}</p>
                  </div>
                  <Sparkline
                    points={p.spark}
                    up={p.change24h >= 0}
                    width={72}
                    height={28}
                  />
                  <div className="w-24 text-right">
                    <p className="font-mono text-sm text-foreground">
                      {formatTokenAmount(p.raw)}
                    </p>
                    {settings.showUsd && p.mark > 0 && (
                      <p className="text-xs text-mute">
                        {p.usd > 0 ? formatUsd(p.usd) : `$${formatMark(p.mark)}`}
                      </p>
                    )}
                  </div>
                  <Link
                    href={`/app/trade?market=${p.id}`}
                    className="hidden min-h-9 items-center rounded-md border border-line px-2.5 text-xs text-foreground hover:border-lime/50 sm:inline-flex"
                  >
                    Trade
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <ActivityFeed />
    </div>
  );
}
