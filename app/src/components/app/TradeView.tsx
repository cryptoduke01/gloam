"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  useAccount,
  useBalance,
  useChainId,
  useReadContract,
  useWriteContract,
  useWaitForTransactionReceipt,
} from "wagmi";
import { formatUnits, isAddress } from "viem";
import {
  PRODUCT_CHAIN_ID,
  EXPLORER_TX,
  formatEth,
  shortAddress,
} from "@/lib/chain";
import { safeParseEther, safeParseUnits } from "@/lib/amount";
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
import { WalletMenu } from "./WalletMenu";
import { NetworkPulse } from "./NetworkPulse";
import { PriceChart } from "./PriceChart";
import { Sparkline } from "./Sparkline";
import { StatusPill } from "./StatusPill";
import { SuccessModal } from "./SuccessModal";

type Side = "buy" | "sell";
type InputMode = "token" | "usd";
type TxKind = "transfer" | "approve" | "buy" | "sell" | null;

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

  const searchMarket = search.get("market");
  const [side, setSide] = useState<Side>(settings.defaultSide);
  const [marketId, setMarketId] = useState(searchMarket ?? "tsla");
  const [amount, setAmount] = useState("");
  const [inputMode, setInputMode] = useState<InputMode>("token");
  const [filter, setFilter] = useState<"all" | "onchain" | "stocks">("onchain");
  const [to, setTo] = useState("");
  const [mode, setMode] = useState<"swap" | "transfer">("transfer");
  const [error, setError] = useState<string | null>(null);
  const [successOpen, setSuccessOpen] = useState(false);
  const [successTitle, setSuccessTitle] = useState("Done");
  const [lastHash, setLastHash] = useState<`0x${string}` | undefined>();
  const [pendingKind, setPendingKind] = useState<TxKind>(null);
  const handledHash = useRef<string | null>(null);

  // Sync market from URL
  useEffect(() => {
    if (searchMarket && markets.some((m) => m.id === searchMarket)) {
      setMarketId(searchMarket);
    }
  }, [searchMarket, markets]);

  const resolvedId = markets.some((m) => m.id === marketId)
    ? marketId
    : markets.find((m) => m.address)?.id ?? markets[0]?.id ?? "tsla";

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
    Boolean(pair) && pair !== ZERO_ADDRESS && pair !== undefined;

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
    query: { enabled: Boolean(address && token && hasPool) },
  });

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

  const buyEthIn = useMemo(() => {
    if (side !== "buy") return 0n;
    if (!ethUsd || ethUsd <= 0 || usdAmt <= 0) return 0n;
    const eth = usdAmt / ethUsd;
    if (!Number.isFinite(eth) || eth <= 0) return 0n;
    return safeParseEther(eth.toFixed(8)) ?? 0n;
  }, [side, ethUsd, usdAmt]);

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

  const sellAmountIn = useMemo(
    () => (tokenAmt > 0 ? safeParseUnits(tokenAmt.toFixed(8), 18) : null),
    [tokenAmt]
  );

  const { data: sellQuote } = useReadContract({
    address: DEX_ROUTER,
    abi: routerAbi,
    functionName: "getAmountsOut",
    args:
      hasPool &&
      token &&
      sellAmountIn &&
      sellAmountIn > 0n &&
      side === "sell" &&
      mode === "swap"
        ? [sellAmountIn, [token, WETH]]
        : undefined,
    chainId: PRODUCT_CHAIN_ID,
    query: {
      enabled:
        hasPool &&
        Boolean(token) &&
        Boolean(sellAmountIn && sellAmountIn > 0n) &&
        side === "sell",
    },
  });

  const quoteOut = side === "buy" ? buyQuote?.[1] : sellQuote?.[1];

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

  // After approve, auto-submit sell once allowance is enough
  useEffect(() => {
    if (!isSuccess || !txHash || !pendingKind) return;
    if (handledHash.current === txHash) return;
    handledHash.current = txHash;

    void refetchEth();
    void refetchTok();
    void refetchAllow();

    if (pendingKind === "approve") {
      setPendingKind(null);
      setError(null);
      // will re-enable sell on next click with fresh allowance — auto sell:
      // wait for allowance refetch via short delay then sell
      return;
    }

    setLastHash(txHash);
    setSuccessTitle(
      pendingKind === "transfer"
        ? "Tokens sent"
        : pendingKind === "buy"
          ? "Bought"
          : "Sold"
    );
    setSuccessOpen(true);
    setPendingKind(null);
  }, [
    isSuccess,
    txHash,
    pendingKind,
    refetchEth,
    refetchTok,
    refetchAllow,
  ]);

  // Auto-continue sell after approve when allowance updates
  const autoSellAfterApprove = useRef(false);
  useEffect(() => {
    if (!autoSellAfterApprove.current) return;
    if (!token || !address || !sellAmountIn) return;
    if (allowance === undefined || allowance < sellAmountIn) return;
    autoSellAfterApprove.current = false;
    if (!quoteOut || quoteOut <= 0n) {
      setError("No quote — try again.");
      return;
    }
    setPendingKind("sell");
    handledHash.current = null;
    writeContract({
      address: DEX_ROUTER,
      abi: routerAbi,
      functionName: "swapExactTokensForETH",
      args: [
        sellAmountIn,
        applySlippage(quoteOut),
        [token, WETH],
        address,
        deadlineSeconds(),
      ],
      chainId: PRODUCT_CHAIN_ID,
    });
  }, [allowance, sellAmountIn, quoteOut, token, address, writeContract]);

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    resetWrite();
    handledHash.current = null;

    if (!isConnected || !onProduct || !address) {
      setError("Connect on Robinhood testnet.");
      return;
    }
    if (!market) return;

    // Transfer (default path for faucet stocks without pools)
    if (mode === "transfer" || (!hasPool && hasToken)) {
      if (!token) {
        setError("No onchain token for this market.");
        return;
      }
      if (!isAddress(to)) {
        setError("Enter a recipient address.");
        return;
      }
      const value = safeParseUnits(
        inputMode === "usd" && mark > 0
          ? (Number(amount) / mark).toFixed(8)
          : amount,
        18
      );
      if (value === null || value <= 0n) {
        setError("Enter a valid amount.");
        return;
      }
      if (tokenBal !== undefined && value > tokenBal) {
        setError("Not enough tokens.");
        return;
      }
      setPendingKind("transfer");
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
      setError("No swap pool for this stock on testnet. Use Send for transfers.");
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
      if (!quoteOut || quoteOut <= 0n) {
        setError("No pool quote. Liquidity may be empty.");
        return;
      }
      setPendingKind("buy");
      writeContract({
        address: DEX_ROUTER,
        abi: routerAbi,
        functionName: "swapExactETHForTokens",
        args: [
          applySlippage(quoteOut),
          [WETH, token],
          address,
          deadlineSeconds(),
        ],
        value: buyEthIn,
        chainId: PRODUCT_CHAIN_ID,
      });
      return;
    }

    // sell
    if (!sellAmountIn || sellAmountIn <= 0n) {
      setError("Enter an amount.");
      return;
    }
    if (tokenBal !== undefined && sellAmountIn > tokenBal) {
      setError("Not enough tokens.");
      return;
    }
    if (allowance === undefined || allowance < sellAmountIn) {
      setPendingKind("approve");
      autoSellAfterApprove.current = true;
      writeContract({
        address: token,
        abi: erc20Abi,
        functionName: "approve",
        args: [DEX_ROUTER, sellAmountIn * 2n],
        chainId: PRODUCT_CHAIN_ID,
      });
      return;
    }
    if (!quoteOut || quoteOut <= 0n) {
      setError("No pool quote. Liquidity may be empty.");
      return;
    }
    setPendingKind("sell");
    writeContract({
      address: DEX_ROUTER,
      abi: routerAbi,
      functionName: "swapExactTokensForETH",
      args: [
        sellAmountIn,
        applySlippage(quoteOut),
        [token, WETH],
        address,
        deadlineSeconds(),
      ],
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

  const busy = isPending || confirming;
  const showTransferFields = mode === "transfer" || (!hasPool && hasToken);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <NetworkPulse />
        <span className="text-xs text-mute">
          {isError ? (
            <button
              type="button"
              onClick={() => void refetch()}
              className="text-lime hover:underline"
            >
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

      <div className="rounded-xl border border-line bg-panel px-4 py-3 text-sm text-mute">
        <strong className="text-foreground">Public trade today.</strong> Swaps
        and transfers show on the explorer. Sealed-size private trade is next —
        vault path is Shield → Move for now.
      </div>

      <div className="grid gap-4 lg:grid-cols-12">
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
                    m.id === resolvedId
                      ? "bg-background"
                      : "hover:bg-background/60"
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
                    points={
                      m.spark && m.spark.length >= 2
                        ? m.spark
                        : m.mark > 0
                          ? [m.mark * 0.98, m.mark, m.mark * 1.01]
                          : []
                    }
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
              <Sparkline
                points={spark}
                up={market.change24h >= 0}
                width={120}
                height={40}
              />
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
                <StatusPill tone="lime">Pool</StatusPill>
              ) : hasToken ? (
                <StatusPill tone="lime">Transfer</StatusPill>
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
                      if (hasPool) {
                        setMode("swap");
                        setSide("buy");
                      }
                    }}
                    disabled={!hasPool}
                    className={`min-h-10 rounded-lg text-sm font-semibold disabled:opacity-40 ${
                      mode === "swap" && side === "buy"
                        ? "bg-lime text-black"
                        : "border border-line text-mute"
                    }`}
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
                      (mode === "swap" && side === "sell") ||
                      mode === "transfer"
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
                  No testnet pool for {market.symbol}. You can still send
                  faucet tokens to any address.
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
                  <label
                    htmlFor="trade-amt"
                    className="text-sm font-medium text-foreground"
                  >
                    {inputMode === "usd"
                      ? "Amount (USD)"
                      : `Amount (${market.symbol})`}
                  </label>
                  {isConnected && hasToken && (
                    <button
                      type="button"
                      className="text-xs text-lime hover:underline"
                      onClick={() => {
                        if (tokenBal && tokenBal > 0n) {
                          setInputMode("token");
                          setAmount(formatUnits(tokenBal, 18));
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
                      ≈{" "}
                      {tokenAmt > 0
                        ? tokenAmt.toLocaleString(undefined, {
                            maximumFractionDigits: 4,
                          })
                        : "—"}{" "}
                      {market.symbol}
                    </span>
                  ) : (
                    <span>≈ {usdAmt > 0 ? formatUsd(usdAmt) : "—"}</span>
                  )}
                  {side === "buy" && buyEthIn > 0n && (
                    <span>≈ {formatEth(buyEthIn, 5)} ETH</span>
                  )}
                  {quoteOut !== undefined && mode === "swap" && quoteOut > 0n && (
                    <span className="text-lime">
                      Quote:{" "}
                      {side === "buy"
                        ? `${Number(formatUnits(quoteOut, 18)).toLocaleString(undefined, { maximumFractionDigits: 4 })} ${market.symbol}`
                        : `${formatEth(quoteOut, 5)} ETH`}
                    </span>
                  )}
                </div>
              </div>

              {showTransferFields && (
                <div>
                  <label
                    htmlFor="xfer-to"
                    className="text-sm font-medium text-foreground"
                  >
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
                      {tokenBal !== undefined
                        ? Number(tokenBalFmt).toLocaleString(undefined, {
                            maximumFractionDigits: 4,
                          })
                        : "—"}{" "}
                      {market.symbol}
                    </span>
                  </>
                )}
              </div>

              {!isConnected || !onProduct ? (
                <WalletMenu />
              ) : (
                <button
                  type="submit"
                  disabled={busy || !hasToken}
                  className="inline-flex min-h-12 w-full items-center justify-center rounded-xl bg-lime text-sm font-semibold text-black hover:opacity-90 disabled:opacity-50"
                >
                  {busy
                    ? pendingKind === "approve"
                      ? "Approve in wallet…"
                      : "Confirm in wallet…"
                    : showTransferFields
                      ? `Send ${market.symbol}`
                      : side === "buy"
                        ? `Buy ${market.symbol}`
                        : sellAmountIn &&
                            allowance !== undefined &&
                            allowance < sellAmountIn
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
              {market.change24h}%
            </p>
            <dl className="mt-4 space-y-2 text-xs">
              <div className="flex justify-between">
                <dt className="text-mute">Network</dt>
                <dd className="text-foreground">Testnet</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-mute">Pool</dt>
                <dd className={hasPool ? "text-lime" : "text-mute"}>
                  {hasPool ? "Yes" : "None"}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-mute">Action</dt>
                <dd className="text-foreground">
                  {hasPool ? "Swap" : hasToken ? "Transfer" : "Watch"}
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
            {market.symbol} · testnet
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
