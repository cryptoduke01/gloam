"use client";

import Link from "next/link";
import { useMemo } from "react";
import {
  useAccount,
  useBalance,
  useChainId,
  useReadContracts,
} from "wagmi";
import { formatUnits } from "viem";
import { AsciiImage } from "@/components/AsciiImage";
import {
  EXPLORER_TX,
  PRODUCT_CHAIN_ID,
  formatEth,
} from "@/lib/chain";
import { FAUCET_BLURB, FAUCET_URL } from "@/lib/faucet";
import { useLiveMarkets } from "@/hooks/useLiveMarkets";
import { useLocalShieldNotes } from "@/hooks/useLocalShieldNotes";
import { useTradingSettings } from "@/hooks/useTradingSettings";
import {
  formatMark,
  formatTokenAmount,
  formatUsd,
} from "@/lib/markets";
import { TESTNET_STOCK_TOKENS, erc20BalanceOfAbi } from "@/lib/tokens";
import {
  assetLabel,
  isNativeAsset,
  isShieldDeployed,
} from "@/lib/shield";
import { ActivityFeed } from "./ActivityFeed";
import { AddressChip } from "./AddressChip";
import { OnboardingCard } from "./OnboardingCard";
import { WalletMenu } from "./WalletMenu";
import { TURNKEY_ENABLED } from "./TurnkeyEmbeddedProvider";
import { NetworkPulse } from "./NetworkPulse";
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
  const { open: shieldNotes, shieldedWei, byAsset, syncing } =
    useLocalShieldNotes(address);
  const shieldLive = isShieldDeployed();

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

  const shieldRows = useMemo(() => {
    const rows: {
      asset: string;
      label: string;
      amount: bigint;
      usd: number | null;
    }[] = [];
    byAsset.forEach((amount, asset) => {
      if (amount <= BigInt(0)) return;
      const label = assetLabel(asset);
      let usd: number | null = null;
      if (isNativeAsset(asset) && ethUsd != null) {
        usd = (Number(amount) / 1e18) * ethUsd;
      } else {
        const tok = TESTNET_STOCK_TOKENS.find(
          (t) => t.address.toLowerCase() === asset.toLowerCase()
        );
        const m = tok ? markets.find((x) => x.id === tok.id) : null;
        if (m?.mark) usd = (Number(amount) / 1e18) * m.mark;
      }
      rows.push({ asset, label, amount, usd });
    });
    return rows.sort((a, b) => {
      if (isNativeAsset(a.asset)) return -1;
      if (isNativeAsset(b.asset)) return 1;
      return a.label.localeCompare(b.label);
    });
  }, [byAsset, ethUsd, markets]);

  const ethAmt = bal ? Number(bal.value) / 1e18 : 0;
  const shieldEthUsd =
    ethUsd != null && shieldedWei > BigInt(0)
      ? (Number(shieldedWei) / 1e18) * ethUsd
      : 0;
  const shieldStocksUsd = shieldRows
    .filter((r) => !isNativeAsset(r.asset))
    .reduce((s, r) => s + (r.usd ?? 0), 0);
  const ethUsdVal = ethUsd != null ? ethAmt * ethUsd : null;
  const stocksUsd = positions.reduce((s, p) => s + p.usd, 0);
  const totalUsd =
    ethUsdVal != null
      ? ethUsdVal + stocksUsd + shieldEthUsd + shieldStocksUsd
      : stocksUsd + shieldStocksUsd > 0
        ? stocksUsd + shieldEthUsd + shieldStocksUsd
        : null;

  const hasShield = shieldRows.length > 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <NetworkPulse />
        <a
          href={FAUCET_URL}
          target="_blank"
          rel="noreferrer"
          className="text-xs text-mute transition-colors hover:text-lime"
          title={FAUCET_BLURB}
        >
          Get testnet ETH →
        </a>
      </div>

      <div className="grid gap-4 lg:grid-cols-12">
        <div className="overflow-hidden rounded-xl border border-line bg-panel lg:col-span-8">
          <div className="relative h-40 border-b border-line sm:h-44">
            <AsciiImage
              src="/ascii/shield.png"
              alt=""
              tone="plate"
              priority
              className="h-full w-full opacity-40"
              sizes="60vw"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-panel via-panel/90 to-panel/50" />
            <div className="absolute inset-0 bg-panel/30" />
            <div className="absolute bottom-4 left-4 right-4 sm:bottom-5 sm:left-5">
              <StatusPill tone="lime">Portfolio</StatusPill>
              <p className="tnum mt-2 font-display text-3xl tracking-tight text-foreground sm:text-4xl">
                {totalUsd != null && settings.showUsd
                  ? formatUsd(totalUsd)
                  : isConnected
                    ? `${formatEth((bal?.value ?? BigInt(0)) + shieldedWei)} ETH`
                    : "—"}
              </p>
              {isConnected && (
                <p className="mt-1 text-sm text-mute">
                  {formatEth(bal?.value ?? BigInt(0))} wallet
                  {hasShield
                    ? ` · ${shieldRows.map((r) => `${r.label}`).join(", ")} in vault`
                    : ""}
                  {stocksUsd > 0
                    ? ` · ${positions.filter((p) => p.raw > BigInt(0)).length} stocks`
                    : ""}
                  {syncing ? " · syncing…" : ""}
                </p>
              )}
            </div>
          </div>

          <div className="grid gap-4 p-5 sm:grid-cols-3 sm:p-6">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-mute">
                Wallet ETH
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
                Vault
              </p>
              {!isConnected ? (
                <p className="mt-2 font-display text-2xl text-mute">—</p>
              ) : !hasShield ? (
                <>
                  <p className="mt-2 font-display text-2xl text-foreground">0</p>
                  <p className="mt-0.5 text-xs text-mute">
                    {shieldLive ? "Shield to deposit" : "Not live"}
                  </p>
                </>
              ) : (
                <>
                  <p className="mt-2 font-display text-2xl text-foreground">
                    {shieldRows.length === 1
                      ? isNativeAsset(shieldRows[0].asset)
                        ? formatEth(shieldRows[0].amount)
                        : formatUnits(shieldRows[0].amount, 18)
                      : `${shieldRows.length} assets`}
                  </p>
                  <p className="mt-0.5 text-xs text-mute">
                    {shieldRows
                      .map(
                        (r) =>
                          `${
                            isNativeAsset(r.asset)
                              ? formatEth(r.amount)
                              : formatUnits(r.amount, 18)
                          } ${r.label}`
                      )
                      .join(" · ")}
                  </p>
                  {settings.showUsd &&
                    shieldEthUsd + shieldStocksUsd > 0 && (
                      <p className="mt-0.5 text-sm text-mute">
                        {formatUsd(shieldEthUsd + shieldStocksUsd)}
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
              <p className="mt-0.5 text-xs text-mute">Faucet · live marks</p>
            </div>
          </div>

          {isConnected && hasShield && (
            <div className="border-t border-line bg-lime/5 px-5 py-3 sm:px-6">
              <p className="text-sm text-foreground">
                Vault is private until you cash out.{" "}
                <Link
                  href="/app/trade?path=sealed"
                  className="font-semibold text-lime hover:underline"
                >
                  Private trade
                </Link>
                {" · "}
                <Link href="/app/move" className="text-lime hover:underline">
                  Private send
                </Link>
                {" · "}
                <Link href="/app/shield" className="text-lime hover:underline">
                  Shield more
                </Link>
              </p>
            </div>
          )}

          {!isConnected && (
            <div className="border-t border-line px-5 py-4 sm:px-6">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm text-mute">
                  {TURNKEY_ENABLED
                    ? "Sign in to load your balances."
                    : "Connect to load balances."}
                </p>
                <WalletMenu />
              </div>
            </div>
          )}
          {isConnected && !onProduct && (
            <div className="border-t border-line px-5 py-4 sm:px-6">
              <p className="text-sm text-amber-600 dark:text-amber-500">
                Switch to Robinhood testnet.
              </p>
              <div className="mt-3">
                <WalletMenu />
              </div>
            </div>
          )}
          {isConnected && address && (
            <div className="space-y-3 border-t border-line px-5 py-4 sm:px-6">
              <AddressChip address={address} />
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <Link
                  href="/app/send"
                  className="inline-flex min-h-11 items-center justify-center rounded-xl bg-lime px-3 text-sm font-semibold text-black hover:opacity-90 active:scale-[0.98]"
                >
                  Send
                </Link>
                {shieldLive ? (
                  <Link
                    href="/app/shield"
                    className="inline-flex min-h-11 items-center justify-center rounded-xl border border-lime/40 px-3 text-sm font-medium text-lime hover:bg-lime/10 active:scale-[0.98]"
                  >
                    Shield
                  </Link>
                ) : (
                  <span className="inline-flex min-h-11 items-center justify-center rounded-xl border border-line px-3 text-sm text-mute opacity-50">
                    Shield
                  </span>
                )}
                {shieldLive ? (
                  <Link
                    href="/app/trade?path=sealed"
                    className="inline-flex min-h-11 items-center justify-center rounded-xl border border-lime/40 px-3 text-sm font-medium text-lime hover:bg-lime/10 active:scale-[0.98]"
                  >
                    Private trade
                  </Link>
                ) : (
                  <span className="inline-flex min-h-11 items-center justify-center rounded-xl border border-line px-3 text-sm text-mute opacity-50">
                    Private trade
                  </span>
                )}
                {shieldLive ? (
                  <Link
                    href="/app/move"
                    className="inline-flex min-h-11 items-center justify-center rounded-xl border border-line px-3 text-sm font-medium text-foreground hover:border-mute active:scale-[0.98]"
                  >
                    Move
                  </Link>
                ) : (
                  <span className="inline-flex min-h-11 items-center justify-center rounded-xl border border-line px-3 text-sm text-mute opacity-50">
                    Move
                  </span>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="space-y-4 lg:col-span-4">
          <OnboardingCard />
          <ActivityFeed />
        </div>
      </div>

      {shieldNotes.length > 0 && (
        <div>
          <div className="mb-3 flex items-center justify-between">
            <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-mute">
              In the vault
            </p>
            <StatusPill tone="lime">Private</StatusPill>
          </div>
          <div className="overflow-hidden rounded-xl border border-line bg-panel">
            <ul>
              {shieldNotes.slice(0, 8).map((n) => (
                <li
                  key={n.id}
                  className="flex items-center justify-between gap-3 border-b border-line px-4 py-3.5 last:border-0"
                >
                  <div className="min-w-0">
                    <p className="font-medium text-foreground">
                      {isNativeAsset(n.asset)
                        ? formatEth(BigInt(n.amountWei))
                        : formatUnits(BigInt(n.amountWei), 18)}{" "}
                      {assetLabel(n.asset)}
                    </p>
                    <p className="mt-0.5 text-xs text-mute">
                      {n.leafIndex != null
                        ? "Ready to private trade, send, or cash out"
                        : "Linking to vault…"}
                      {n.source === "local" && n.id.startsWith("imp-")
                        ? " · received"
                        : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {n.txHash && (
                      <a
                        href={EXPLORER_TX(n.txHash)}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs text-lime hover:underline"
                      >
                        Tx
                      </a>
                    )}
                    <Link
                      href={
                        isNativeAsset(n.asset)
                          ? "/app/trade?path=sealed"
                          : `/app/trade?path=sealed&side=sell&market=${
                              TESTNET_STOCK_TOKENS.find(
                                (t) =>
                                  t.address.toLowerCase() ===
                                  n.asset.toLowerCase()
                              )?.id ?? "tsla"
                            }`
                      }
                      className="inline-flex min-h-9 items-center rounded-md border border-lime/30 px-2.5 text-xs text-lime hover:border-lime/50"
                    >
                      Trade
                    </Link>
                    <Link
                      href="/app/move"
                      className="inline-flex min-h-9 items-center rounded-md border border-line px-2.5 text-xs text-foreground hover:border-mute"
                    >
                      Move
                    </Link>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

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
                      {p.live && (
                        <StatusPill tone="lime" dot>
                          Live
                        </StatusPill>
                      )}
                    </div>
                    <p className="text-xs text-mute">{p.name}</p>
                  </div>
                  <Sparkline
                    points={
                      p.spark.length >= 2
                        ? p.spark
                        : p.mark > 0
                          ? [p.mark * 0.98, p.mark * 1.01, p.mark]
                          : []
                    }
                    up={p.change24h >= 0}
                    width={72}
                    height={28}
                  />
                  <div className="w-24 text-right">
                    <p className="tnum font-mono text-sm text-foreground">
                      {formatTokenAmount(p.raw)}
                    </p>
                    {settings.showUsd && p.mark > 0 && (
                      <p className="text-xs text-mute">
                        {p.usd > 0 ? formatUsd(p.usd) : `$${formatMark(p.mark)}`}
                      </p>
                    )}
                  </div>
                  <div className="hidden gap-1 sm:flex">
                    {shieldLive && (
                      <Link
                        href="/app/shield"
                        className="inline-flex min-h-9 items-center rounded-md border border-lime/30 px-2.5 text-xs text-lime hover:border-lime/50"
                      >
                        Shield
                      </Link>
                    )}
                    <Link
                      href={`/app/trade?market=${p.id}`}
                      className="inline-flex min-h-9 items-center rounded-md border border-line px-2.5 text-xs text-foreground hover:border-lime/50"
                    >
                      Trade
                    </Link>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
