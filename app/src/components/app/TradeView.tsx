"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  useAccount,
  useBalance,
  useChainId,
  useReadContract,
  useWriteContract,
  useWaitForTransactionReceipt,
} from "wagmi";
import { formatUnits, isAddress, parseEther, parseUnits } from "viem";
import { PRODUCT_CHAIN_ID, EXPLORER_TX, formatEth, shortAddress } from "@/lib/chain";
import {
  DEX_FACTORY,
  DEX_ROUTER,
  WETH,
  ZERO_ADDRESS,
  applySlippage,
  deadlineSeconds,
  erc20Abi,
  factoryAbi,
  routerAbi,
} from "@/lib/dex";
import { useLiveMarkets } from "@/hooks/useLiveMarkets";
import { useTradingSettings } from "@/hooks/useTradingSettings";
import { formatMark, formatUsd } from "@/lib/markets";
import { ConnectButton } from "./ConnectButton";
import { NetworkPulse } from "./NetworkPulse";
import { PriceChart } from "./PriceChart";
import { Sparkline } from "./Sparkline";
import { StatusPill } from "./StatusPill";
import { SuccessModal } from "./SuccessModal";

type Side = "buy" | "sell";
type InputMode = "token" | "usd";

export function TradeView() {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const onProduct = chainId === PRODUCT_CHAIN_ID;
  const search = useSearchParams();
  const { settings } = useTradingSettings();
  const { data, isFetching, isError, refetch, isFetched } = useLiveMarkets();
  const markets = data?.markets ?? [];
  const ethUsd = data?.ethUsd ?? null;
  const liveCount = data?.meta?.liveCount ?? 0;

  const initial =
    markets.find((m) => m.id === search.get("market"))?.id ??
    markets.find((m) => m.address)?.id ??
    markets[0]?.id ??
    "tsla";

  const [side, setSide] = useState<Side>(settings.defaultSide);
  const [marketId, setMarketId] = useState(initial);
  const [amount, setAmount] = useState("");
  const [inputMode, setInputMode] = useState<InputMode>("token");
  const [filter, setFilter] = useState<"all" | "onchain" | "stocks">(
    settings.marketFilter === "onchain" || settings.marketFilter === "stocks"
      ? settings.marketFilter
      : "onchain"
  );
  const [to, setTo] = useState("");
  const [mode, setMode] = useState<"swap" | "transfer">("swap");
  const [error, setError] = useState<string | null>(null);
  const [successOpen, setSuccessOpen] = useState(false);
  const [successTitle, setSuccessTitle] = useState("Done");
  const [lastHash, setLastHash] = useState<`0x${string}` | undefined>();

  const resolvedId = markets.some((m) => m.id === marketId)
    ? marketId
    : markets[0]?.id ?? "tsla";

  const market = useMemo(
    () => markets.find((m) => m.id === resolvedId) ?? markets[0],
    [markets, resolvedId]
  );

  const list = useMemo(() => {
    if (filter === "all") return markets;
    if (filter === "onchain") return markets.filter((m) => Boolean(m.address));
    return markets.filter((m) => m.kind === "stock");
  }, [filter, markets]);

  const token = market?.address as `0x${string}` | undefined;
  const hasToken = Boolean(token);

  const { data: pair } = useReadContract({
    address: DEX_FACTORY,
    abi: factoryAbi,
    functionName: "getPair",
    args: token ? [token, WETH] : undefined,
    chainId: PRODUCT_CHAIN_ID,
    query: { enabled: Boolean(token) },
  });

  const hasPool =
    Boolean(pair) &&
    pair !== ZERO_ADDRESS &&
    pair !== undefined;

  const { data: ethBal, refetch: refetchEth } = useBalance({
    address,
    chainId: PRODUCT_CHAIN_ID,
    query: { enabled: Boolean(address) },
  });

  const { data: tokenBal, refetch: refetchTok } = useReadContract({
    address: token,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    chainId: PRODUCT_CHAIN_ID,
    query: { enabled: Boolean(address && token) },
  });

  const { data: allowance, refetch: refetchAllow } = useReadContract({
    address: token,
    abi: erc20Abi,
    functionName: "allowance",
    args: address ? [address, DEX_ROUTER] : undefined,
    chainId: PRODUCT_CHAIN_ID,
    query: { enabled: Boolean(address && token && side === "sell" && hasPool) },
  });

  // Auto mode: pool → swap, else transfer for sell/send of stocks
  useEffect(() => {
    if (hasPool) setMode("swap");
    else if (hasToken) setMode("transfer");
  }, [hasPool, hasToken, resolvedId]);

  const mark = market?.mark ?? 0;
  const tokenAmt = useMemo(() => {
    const n = Number(amount);
    if (!Number.isFinite(n) || n <= 0) return 0;
    if (inputMode === "usd") return mark > 0 ? n / mark : 0;
    return n;
  }, [amount, inputMode, mark]);

  const usdAmt = useMemo(() => {
    const n = Number(amount);
    if (!Number.isFinite(n) || n <= 0) return 0;
    if (inputMode === "usd") return n;
    return n * mark;
  }, [amount, inputMode, mark]);

  const ethFromUsd = ethUsd && ethUsd > 0 ? usdAmt / ethUsd : 0;

  const buyEthIn = useMemo(() => {
    if (side !== "buy") return 0n;
    if (inputMode === "usd" && ethUsd && ethUsd > 0) {
      return parseEther((usdAmt / ethUsd).toFixed(8));
    }
    // token amount → USD → ETH
    if (mark > 0 && ethUsd && ethUsd > 0) {
      return parseEther(((tokenAmt * mark) / ethUsd).toFixed(8));
    }
    return 0n;
  }, [side, inputMode, ethUsd, usdAmt, mark, tokenAmt]);

  const { data: buyQuote } = useReadContract({
    address: DEX_ROUTER,
    abi: routerAbi,
    functionName: "getAmountsOut",
    args:
      hasPool && token && buyEthIn > 0n && side === "buy" && mode === "swap"
        ? [buyEthIn, [WETH, token]]
        : undefined,
    chainId: PRODUCT_CHAIN_ID,
    query: {
      enabled: hasPool && Boolean(token) && buyEthIn > 0n && side === "buy",
    },
  });

  const { data: sellQuote } = useReadContract({
    address: DEX_ROUTER,
    abi: routerAbi,
    functionName: "getAmountsOut",
    args:
      hasPool && token && tokenAmt > 0 && side === "sell" && mode === "swap"
        ? [parseUnits(tokenAmt.toFixed(8), 18), [token, WETH]]
        : undefined,
    chainId: PRODUCT_CHAIN_ID,
    query: {
      enabled: hasPool && Boolean(token) && tokenAmt > 0 && side === "sell",
    },
  });

  const quoteOut = side === "buy" ? buyQuote?.[1] : sellQuote?.[1];
  const quoteIn = side === "buy" ? buyEthIn : parseUnits(tokenAmt > 0 ? tokenAmt.toFixed(8) : "0", 18);

  const {
    writeContract,
    data: txHash,
    isPending,
    error: writeError,
    reset: resetWrite,
  } = useWriteContract();

  const { isLoading: confirming, isSuccess } = useWaitForTransactionReceipt({
    hash: txHash,
    chainId: PRODUCT_CHAIN_ID,
  });

  useEffect(() => {
    if (isSuccess && txHash) {
      setLastHash(txHash);
      setSuccessOpen(true);
      void refetchEth();
      void refetchTok();
      void refetchAllow();
    }
  }, [isSuccess, txHash, refetchEth, refetchTok, refetchAllow]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    resetWrite();
    if (!isConnected || !onProduct || !address) {
      setError("Connect on Robinhood testnet.");
      return;
    }
    if (!market) return;

    // Transfer stock tokens (always works for faucet tokens)
    if (mode === "transfer" || (!hasPool && side === "sell")) {
      if (!token) {
        setError("No onchain token for this market.");
        return;
      }
      if (!isAddress(to)) {
        setError("Enter a recipient address.");
        return;
      }
      if (tokenAmt <= 0) {
        setError("Enter an amount.");
        return;
      }
      const value = parseUnits(tokenAmt.toFixed(8), 18);
      if (tokenBal !== undefined && value > tokenBal) {
        setError("Not enough tokens.");
        return;
      }
      setSuccessTitle("Tokens sent");
      writeContract({
        address: token,
        abi: erc20Abi,
        functionName: "transfer",
        args: [to as `0x${string}`, value],
        chainId: PRODUCT_CHAIN_ID,
      });
      return;
    }

    if (!hasPool || !token) {
      setError(
        "No swap pool for this stock yet. Transfer tokens, or use the faucet."
      );
      return;
    }

    if (side === "buy") {
      if (buyEthIn <= 0n) {
        setError("Enter a size.");
        return;
      }
      if (ethBal && buyEthIn > ethBal.value) {
        setError("Not enough ETH.");
        return;
      }
      const minOut = quoteOut ? applySlippage(quoteOut) : 0n;
      setSuccessTitle("Bought");
      writeContract({
        address: DEX_ROUTER,
        abi: routerAbi,
        functionName: "swapExactETHForTokens",
        args: [minOut, [WETH, token], address, deadlineSeconds()],
        value: buyEthIn,
        chainId: PRODUCT_CHAIN_ID,
      });
      return;
    }

    // sell via pool
    const amountIn = parseUnits(tokenAmt.toFixed(8), 18);
    if (amountIn <= 0n) {
      setError("Enter an amount.");
      return;
    }
    if (tokenBal !== undefined && amountIn > tokenBal) {
      setError("Not enough tokens.");
      return;
    }
    const needApprove =
      allowance === undefined || allowance < amountIn;
    if (needApprove) {
      setSuccessTitle("Approved");
      writeContract({
        address: token,
        abi: erc20Abi,
        functionName: "approve",
        args: [DEX_ROUTER, amountIn * 2n],
        chainId: PRODUCT_CHAIN_ID,
      });
      return;
    }
    const minOut = quoteOut ? applySlippage(quoteOut) : 0n;
    setSuccessTitle("Sold");
    writeContract({
      address: DEX_ROUTER,
      abi: routerAbi,
      functionName: "swapExactTokensForETH",
      args: [amountIn, minOut, [token, WETH], address, deadlineSeconds()],
      chainId: PRODUCT_CHAIN_ID,
    });
  }

  const tokenBalFmt =
    tokenBal !== undefined ? formatUnits(tokenBal, 18) : "—";
  const ethBalFmt = ethBal ? formatEth(ethBal.value) : "—";

  if (!isFetched && markets.length === 0) {
    return (
      <div className="rounded-xl border border-line bg-panel p-8 text-sm text-mute">
        Loading markets…
      </div>
    );
  }

  if (!market) {
    return (
      <div className="rounded-xl border border-line bg-panel p-8 text-sm text-mute">
        No markets available.
      </div>
    );
  }

  const spark =
    market.spark && market.spark.length >= 2
      ? market.spark
      : market.mark > 0
        ? [
            market.mark * 0.97,
            market.mark * 0.99,
            market.mark * 0.98,
            market.mark * 1.01,
            market.mark,
          ]
        : [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <NetworkPulse />
        <span className="text-xs text-mute">
          {isError ? (
            <button type="button" onClick={() => void refetch()} className="text-lime hover:underline">
              Retry prices
            </button>
          ) : isFetching ? (
            "Updating…"
          ) : liveCount > 0 ? (
            "Live prices"
          ) : (
            "Prices offline"
          )}
        </span>
      </div>

      <div className="grid gap-4 lg:grid-cols-12">
        {/* List */}
        <div className="rounded-xl border border-line bg-panel lg:col-span-4">
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-mute">
              Markets
            </p>
            <div className="flex flex-wrap gap-1">
              {(
                [
                  ["all", "All"],
                  ["onchain", "Onchain"],
                  ["stocks", "Stocks"],
                ] as const
              ).map(([f, label]) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setFilter(f)}
                  className={`rounded-md px-2 py-1 text-[11px] ${
                    filter === f
                      ? "bg-lime text-black"
                      : "text-mute hover:text-foreground"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <ul className="max-h-[32rem] overflow-y-auto">
            {list.map((m) => (
              <li key={m.id}>
                <button
                  type="button"
                  onClick={() => setMarketId(m.id)}
                  className={`flex w-full items-center gap-3 border-b border-line px-4 py-3 text-left last:border-0 ${
                    m.id === resolvedId ? "bg-background" : "hover:bg-background/60"
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-foreground">{m.symbol}</p>
                    <p className="truncate text-xs text-mute">
                      {m.name}
                      {m.address ? " · onchain" : ""}
                    </p>
                  </div>
                  <Sparkline
                    points={m.spark ?? []}
                    up={m.change24h >= 0}
                    width={64}
                    height={28}
                  />
                  <div className="w-20 text-right">
                    <p className="font-mono text-sm text-foreground">
                      {settings.showUsd
                        ? formatUsd(m.mark)
                        : `$${formatMark(m.mark)}`}
                    </p>
                    <p
                      className={`text-xs ${
                        m.change24h >= 0
                          ? "text-[var(--chart-up)]"
                          : "text-[var(--chart-down)]"
                      }`}
                    >
                      {m.change24h >= 0 ? "+" : ""}
                      {m.change24h}%
                    </p>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </div>

        {/* Ticket + chart */}
        <div className="space-y-4 lg:col-span-5">
          {!settings.compactCharts && (
            <PriceChart
              points={spark}
              mark={market.mark}
              change24h={market.change24h}
            />
          )}
          {settings.compactCharts && spark.length >= 2 && (
            <div className="flex items-center justify-between rounded-xl border border-line bg-panel px-4 py-3">
              <div>
                <p className="font-display text-2xl text-foreground">
                  {formatUsd(market.mark)}
                </p>
                <p className="text-xs text-mute">{market.symbol}</p>
              </div>
              <Sparkline points={spark} up={market.change24h >= 0} width={120} height={40} />
            </div>
          )}

          <div className="overflow-hidden rounded-xl border border-line bg-panel">
            <div className="flex items-center justify-between border-b border-line px-5 py-4">
              <div>
                <p className="font-display text-2xl text-foreground">
                  {market.symbol}
                </p>
                <p className="text-sm text-mute">{market.name}</p>
              </div>
              {hasPool ? (
                <StatusPill tone="lime">Pool live</StatusPill>
              ) : hasToken ? (
                <StatusPill tone="warn">Transfer</StatusPill>
              ) : (
                <StatusPill>Watch</StatusPill>
              )}
            </div>

            <form onSubmit={onSubmit} className="space-y-4 p-5">
              {hasToken && (
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setMode(hasPool ? "swap" : "transfer");
                      setSide("buy");
                    }}
                    className={`min-h-10 rounded-lg text-sm font-semibold ${
                      mode === "swap" && side === "buy"
                        ? "bg-lime text-black"
                        : "border border-line text-mute"
                    }`}
                    disabled={!hasPool}
                    title={!hasPool ? "No pool yet" : undefined}
                  >
                    Buy
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (hasPool) {
                        setMode("swap");
                        setSide("sell");
                      } else {
                        setMode("transfer");
                        setSide("sell");
                      }
                    }}
                    className={`min-h-10 rounded-lg text-sm font-semibold ${
                      (mode === "swap" && side === "sell") || mode === "transfer"
                        ? "bg-foreground text-background"
                        : "border border-line text-mute"
                    }`}
                  >
                    {hasPool ? "Sell" : "Send"}
                  </button>
                </div>
              )}

              {!hasPool && hasToken && (
                <p className="rounded-lg border border-line bg-background px-3 py-2 text-xs text-mute">
                  No DEX pool for {market.symbol} yet. You can still{" "}
                  <strong className="text-foreground">send tokens</strong> onchain
                  (faucet balances work).
                </p>
              )}

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setInputMode("token")}
                  className={`rounded-md px-2.5 py-1 text-[11px] ${
                    inputMode === "token"
                      ? "bg-panel text-foreground ring-1 ring-line"
                      : "text-mute"
                  }`}
                >
                  {market.symbol}
                </button>
                <button
                  type="button"
                  onClick={() => setInputMode("usd")}
                  className={`rounded-md px-2.5 py-1 text-[11px] ${
                    inputMode === "usd"
                      ? "bg-panel text-foreground ring-1 ring-line"
                      : "text-mute"
                  }`}
                >
                  USD
                </button>
              </div>

              <div>
                <div className="flex items-center justify-between">
                  <label htmlFor="trade-amt" className="text-sm font-medium text-foreground">
                    {inputMode === "usd" ? "Amount (USD)" : `Amount (${market.symbol})`}
                  </label>
                  {isConnected && (
                    <button
                      type="button"
                      className="text-xs text-lime hover:underline"
                      onClick={() => {
                        if (mode === "transfer" || side === "sell") {
                          const bal = tokenBal ? Number(formatUnits(tokenBal, 18)) : 0;
                          setInputMode("token");
                          setAmount(bal > 0 ? bal.toFixed(4) : "");
                        } else if (ethBal) {
                          const e = Number(ethBal.value) / 1e18;
                          if (inputMode === "usd" && ethUsd) {
                            setAmount((e * ethUsd).toFixed(2));
                          } else if (mark > 0 && ethUsd) {
                            setInputMode("token");
                            setAmount(((e * ethUsd) / mark).toFixed(4));
                          }
                        }
                      }}
                    >
                      Max
                    </button>
                  )}
                </div>
                <div className="mt-2 flex overflow-hidden rounded-lg border border-line focus-within:border-lime">
                  <input
                    id="trade-amt"
                    inputMode="decimal"
                    placeholder="0.0"
                    value={amount}
                    onChange={(e) =>
                      setAmount(e.target.value.replace(/[^0-9.]/g, ""))
                    }
                    className="min-h-12 flex-1 bg-transparent px-4 text-lg text-foreground outline-none placeholder:text-mute"
                  />
                  <span className="flex items-center border-l border-line px-4 font-mono text-sm text-mute">
                    {inputMode === "usd" ? "USD" : market.symbol}
                  </span>
                </div>
                <div className="mt-1.5 flex flex-wrap gap-x-3 text-xs text-mute">
                  {inputMode === "usd" ? (
                    <span>
                      ≈ {tokenAmt > 0 ? tokenAmt.toLocaleString(undefined, { maximumFractionDigits: 4 }) : "—"}{" "}
                      {market.symbol}
                    </span>
                  ) : (
                    <span>≈ {usdAmt > 0 ? formatUsd(usdAmt) : "—"}</span>
                  )}
                  {side === "buy" && ethFromUsd > 0 && (
                    <span>≈ {ethFromUsd.toFixed(5)} ETH</span>
                  )}
                  {quoteOut !== undefined && mode === "swap" && (
                    <span className="text-lime">
                      Quote:{" "}
                      {side === "buy"
                        ? `${Number(formatUnits(quoteOut, 18)).toLocaleString(undefined, { maximumFractionDigits: 4 })} ${market.symbol}`
                        : `${Number(formatUnits(quoteOut, 18)).toFixed(5)} ETH`}
                    </span>
                  )}
                </div>
              </div>

              {(mode === "transfer" || (!hasPool && hasToken)) && (
                <div>
                  <label htmlFor="xfer-to" className="text-sm font-medium text-foreground">
                    Recipient
                  </label>
                  <input
                    id="xfer-to"
                    value={to}
                    onChange={(e) => setTo(e.target.value.trim())}
                    placeholder="0x…"
                    className="mt-2 min-h-11 w-full rounded-lg border border-line bg-transparent px-4 font-mono text-sm text-foreground outline-none placeholder:text-mute focus:border-lime"
                  />
                </div>
              )}

              <div className="rounded-lg border border-line bg-background px-3 py-2 text-xs text-mute">
                Balances:{" "}
                <span className="text-foreground">{ethBalFmt} ETH</span>
                {hasToken && (
                  <>
                    {" · "}
                    <span className="text-foreground">
                      {Number(tokenBalFmt).toLocaleString(undefined, {
                        maximumFractionDigits: 4,
                      })}{" "}
                      {market.symbol}
                    </span>
                  </>
                )}
              </div>

              {!isConnected || !onProduct ? (
                <ConnectButton />
              ) : (
                <button
                  type="submit"
                  disabled={isPending || confirming || !hasToken}
                  className="inline-flex min-h-12 w-full items-center justify-center rounded-xl bg-lime text-sm font-semibold text-black hover:opacity-90 disabled:opacity-50"
                >
                  {isPending || confirming
                    ? "Confirm in wallet…"
                    : mode === "transfer" || !hasPool
                      ? `Send ${market.symbol}`
                      : side === "buy"
                        ? `Buy ${market.symbol}`
                        : allowance !== undefined &&
                            quoteIn > 0n &&
                            allowance < quoteIn
                          ? `Approve ${market.symbol}`
                          : `Sell ${market.symbol}`}
                </button>
              )}

              {(error || writeError) && (
                <p role="alert" className="text-sm text-red-500">
                  {error || writeError?.message.slice(0, 160)}
                </p>
              )}
            </form>
          </div>
        </div>

        <aside className="space-y-4 lg:col-span-3">
          <div className="rounded-xl border border-line bg-panel p-4">
            <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-mute">
              Mark
            </p>
            <p className="mt-2 font-display text-2xl text-foreground">
              {formatUsd(market.mark)}
            </p>
            <p
              className={`mt-1 text-sm ${
                market.change24h >= 0
                  ? "text-[var(--chart-up)]"
                  : "text-[var(--chart-down)]"
              }`}
            >
              {market.change24h >= 0 ? "+" : ""}
              {market.change24h}% today
            </p>
            <dl className="mt-4 space-y-2 text-xs">
              <div className="flex justify-between">
                <dt className="text-mute">Pool</dt>
                <dd className={hasPool ? "text-lime" : "text-mute"}>
                  {hasPool ? "Yes" : "None yet"}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-mute">Onchain</dt>
                <dd className="text-foreground">
                  {hasToken ? "Faucet token" : "Watch only"}
                </dd>
              </div>
            </dl>
          </div>
        </aside>
      </div>

      <SuccessModal
        open={successOpen && Boolean(lastHash)}
        title={successTitle}
        body={
          <p>
            {market.symbol} settled on testnet.
            {lastHash && (
              <>
                {" "}
                <span className="font-mono text-foreground">
                  {shortAddress(lastHash, 4)}
                </span>
              </>
            )}
          </p>
        }
        primaryHref={lastHash ? EXPLORER_TX(lastHash) : undefined}
        primaryLabel="View on explorer"
        secondaryLabel="Done"
        onClose={() => {
          setSuccessOpen(false);
          setAmount("");
        }}
      />
    </div>
  );
}
