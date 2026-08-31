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

/* — small marks that carry the public / sealed duality — */
function EyeIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      className={className}
      width="11"
      height="11"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
    >
      <path
        d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z"
        stroke="currentColor"
        strokeWidth="2"
      />
      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

function LockIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      className={className}
      width="11"
      height="11"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
    >
      <rect x="4" y="10.5" width="16" height="10" rx="2.2" fill="currentColor" />
      <path d="M8 10.5V7a4 4 0 0 1 8 0v3.5" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

function KindBadge({ sealed }: { sealed: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[9px] font-medium uppercase tracking-[0.12em] ${
        sealed
          ? "border-lime/40 text-lime"
          : "border-line text-mute"
      }`}
    >
      {sealed ? <LockIcon /> : <EyeIcon />}
      {sealed ? "Sealed" : "Public"}
    </span>
  );
}

function AccountCard({
  label,
  sealed,
  value,
  sub,
  loading,
}: {
  label: string;
  sealed: boolean;
  value: string;
  sub?: string;
  loading?: boolean;
}) {
  return (
    <div
      className={`rounded-2xl border border-line p-5 ${
        sealed
          ? "bg-[color-mix(in_srgb,var(--lime)_5%,var(--panel))]"
          : "bg-panel"
      }`}
    >
      <div className="flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-[0.16em] text-mute">
          {label}
        </span>
        <KindBadge sealed={sealed} />
      </div>
      <p className="tnum mt-3 font-display text-2xl tracking-tight text-foreground">
        {loading ? "…" : value}
      </p>
      {sub && <p className="mt-1 text-xs text-mute">{sub}</p>}
    </div>
  );
}

function QuickAction({
  href,
  label,
  primary = false,
  disabled = false,
}: {
  href: string;
  label: string;
  primary?: boolean;
  disabled?: boolean;
}) {
  if (disabled) {
    return (
      <span className="inline-flex min-h-11 items-center justify-center rounded-xl border border-line px-4 text-sm text-mute opacity-50">
        {label}
      </span>
    );
  }
  return (
    <Link
      href={href}
      className={`inline-flex min-h-11 items-center justify-center rounded-xl px-4 text-sm font-semibold transition-all active:scale-[0.98] ${
        primary
          ? "bg-lime text-background hover:opacity-90"
          : "border border-line text-foreground hover:border-mute"
      }`}
    >
      {label}
    </Link>
  );
}

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
  const stockCount = positions.filter((p) => p.raw > BigInt(0)).length;

  // Public (wallet + onchain stocks) vs sealed (vault) split — the whole point.
  const publicUsd = (ethUsdVal ?? 0) + stocksUsd;
  const sealedUsd = shieldEthUsd + shieldStocksUsd;
  const totalKnown = publicUsd + sealedUsd;
  const sealedPct =
    totalKnown > 0 ? Math.round((sealedUsd / totalKnown) * 100) : null;

  const totalDisplay =
    totalUsd != null && settings.showUsd
      ? formatUsd(totalUsd)
      : isConnected
        ? `${formatEth((bal?.value ?? BigInt(0)) + shieldedWei)} ETH`
        : "—";

  const walletValue = !isConnected
    ? "—"
    : `${formatEth(bal?.value ?? BigInt(0))} ETH`;
  const walletSub =
    ethUsdVal != null && settings.showUsd ? formatUsd(ethUsdVal) : "Open wallet";

  const vaultValue = !isConnected
    ? "—"
    : !hasShield
      ? "0"
      : shieldRows.length === 1
        ? `${
            isNativeAsset(shieldRows[0].asset)
              ? formatEth(shieldRows[0].amount)
              : formatUnits(shieldRows[0].amount, 18)
          } ${shieldRows[0].label}`
        : `${shieldRows.length} assets`;
  const vaultSub = !hasShield
    ? shieldLive
      ? "Shield to deposit"
      : "Not live"
    : settings.showUsd && sealedUsd > 0
      ? formatUsd(sealedUsd)
      : "Size hidden onchain";

  const stocksValue = !isConnected
    ? "—"
    : settings.showUsd && stocksUsd > 0
      ? formatUsd(stocksUsd)
      : `${stockCount} ${stockCount === 1 ? "token" : "tokens"}`;

  return (
    <div className="space-y-5">
      {/* — Balance strip: total + public/sealed allocation + quick actions — */}
      <div className="overflow-hidden rounded-2xl border border-line bg-panel">
        <div className="flex gap-6 p-6 max-lg:flex-col lg:items-center lg:justify-between lg:gap-10">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-3">
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
            <p className="mt-5 text-[10px] uppercase tracking-[0.18em] text-mute">
              Total value
            </p>
            <p className="tnum mt-1 font-display text-4xl tracking-tight text-foreground sm:text-5xl">
              {totalDisplay}
            </p>

            {/* allocation bar */}
            <div className="mt-5 max-w-sm">
              <div
                className="flex h-2 w-full overflow-hidden rounded-full bg-background"
                aria-hidden
              >
                {sealedPct != null ? (
                  <>
                    <span
                      className="h-full bg-foreground"
                      style={{ width: `${100 - sealedPct}%` }}
                    />
                    <span
                      className="h-full bg-lime"
                      style={{ width: `${sealedPct}%` }}
                    />
                  </>
                ) : (
                  <span className="h-full w-full bg-line" />
                )}
              </div>
              <div className="mt-2 flex items-center gap-4 text-[11px] text-mute">
                <span className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-foreground" />
                  Public{sealedPct != null ? ` ${100 - sealedPct}%` : ""}
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-lime" />
                  Sealed{sealedPct != null ? ` ${sealedPct}%` : ""}
                </span>
              </div>
            </div>
          </div>

          {/* quick actions */}
          <div className="grid shrink-0 grid-cols-2 gap-2.5 max-lg:w-full lg:w-[300px]">
            <QuickAction
              href="/app/shield"
              label="Shield"
              primary
              disabled={!shieldLive}
            />
            <QuickAction href="/app/send" label="Send" />
            <QuickAction
              href="/app/trade?path=sealed"
              label="Private trade"
              disabled={!shieldLive}
            />
            <QuickAction href="/app/move" label="Move" disabled={!shieldLive} />
          </div>
        </div>

        {/* connect / network banners live inside the strip footer */}
        {!isConnected && (
          <div className="flex flex-col gap-3 border-t border-line px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-mute">
              {TURNKEY_ENABLED
                ? "Sign in to load your balances."
                : "Connect a wallet to load your balances."}
            </p>
            <WalletMenu />
          </div>
        )}
        {isConnected && !onProduct && (
          <div className="flex flex-col gap-3 border-t border-line px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-[#c0432f]">
              Switch to Robinhood testnet to see balances.
            </p>
            <WalletMenu />
          </div>
        )}
        {isConnected && onProduct && address && (
          <div className="border-t border-line px-6 py-3">
            <AddressChip address={address} />
          </div>
        )}
      </div>

      {/* — Account cards: public wallet + sealed vault + public stocks — */}
      <div className="grid gap-4 sm:grid-cols-3">
        <AccountCard
          label="Wallet"
          sealed={false}
          value={walletValue}
          sub={walletSub}
          loading={isConnected && isLoading}
        />
        <AccountCard
          label="Vault"
          sealed
          value={vaultValue}
          sub={syncing ? "Syncing…" : vaultSub}
        />
        <AccountCard
          label="Stocks"
          sealed={false}
          value={stocksValue}
          sub="Faucet · live marks"
        />
      </div>

      {/* — Main split: holdings + sealed notes / rail — */}
      <div className="grid gap-4 lg:grid-cols-12">
        <div className="space-y-4 lg:col-span-8">
          {shieldNotes.length > 0 && (
            <section className="overflow-hidden rounded-2xl border border-line bg-[color-mix(in_srgb,var(--lime)_4%,var(--panel))]">
              <header className="flex items-center justify-between border-b border-line px-5 py-3.5">
                <p className="text-[10px] uppercase tracking-[0.16em] text-mute">
                  In the vault
                </p>
                <KindBadge sealed />
              </header>
              <ul>
                {shieldNotes.slice(0, 6).map((n) => (
                  <li
                    key={n.id}
                    className="flex items-center justify-between gap-3 border-b border-line px-5 py-3.5 last:border-0"
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
            </section>
          )}

          {/* Holdings table */}
          <section className="overflow-hidden rounded-2xl border border-line bg-panel">
            <header className="flex items-center justify-between border-b border-line px-5 py-3.5">
              <p className="text-[10px] uppercase tracking-[0.16em] text-mute">
                Holdings
              </p>
              <StatusPill tone="lime">Onchain</StatusPill>
            </header>
            {!isConnected ? (
              <p className="px-5 py-10 text-center text-sm text-mute">
                Connect to see stock tokens from the faucet.
              </p>
            ) : positions.length === 0 ? (
              <p className="px-5 py-10 text-center text-sm text-mute">
                No stock tokens yet.{" "}
                <a
                  href={FAUCET_URL}
                  target="_blank"
                  rel="noreferrer"
                  className="text-lime hover:underline"
                >
                  Claim from the faucet →
                </a>
              </p>
            ) : (
              <ul>
                {positions.map((p) => (
                  <li
                    key={p.id}
                    className="flex items-center gap-3 border-b border-line px-5 py-3.5 last:border-0"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-foreground">
                          {p.symbol}
                        </p>
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
                      <p className="tnum text-sm text-foreground">
                        {formatTokenAmount(p.raw)}
                      </p>
                      {settings.showUsd && p.mark > 0 && (
                        <p className="text-xs text-mute">
                          {p.usd > 0
                            ? formatUsd(p.usd)
                            : `$${formatMark(p.mark)}`}
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
          </section>
        </div>

        <div className="space-y-4 lg:col-span-4">
          <OnboardingCard />
          <ActivityFeed />
        </div>
      </div>
    </div>
  );
}
