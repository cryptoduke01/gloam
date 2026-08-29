"use client";

/**
 * Private trade: vault assetIn → vault assetOut. No DEX.
 * Buy = ETH → stock · Sell = stock → ETH.
 * Size stays private. Rates from display marks (exact circuit product).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  useAccount,
  useChainId,
  useWaitForTransactionReceipt,
  useWriteContract,
} from "wagmi";
import { formatEther, type Address } from "viem";
import {
  EXPLORER_TX,
  PRODUCT_CHAIN_ID as CHAIN,
  ensureRhTestnetWallet,
  formatEth,
  shortAddress,
} from "@/lib/chain";
import { safeParseEther } from "@/lib/amount";
import { useLocalShieldNotes } from "@/hooks/useLocalShieldNotes";
import { useLiveMarkets } from "@/hooks/useLiveMarkets";
import { usePoolDeposited } from "@/hooks/usePoolDeposited";
import { useShieldTree } from "@/hooks/useShieldTree";
import {
  HASH_SCHEME,
  NATIVE_ASSET,
  SEALED_SWAP_GAS_LIMIT,
  SHIELD_POOL_ADDRESS,
  assetLabel,
  isNativeAsset,
  isShieldDeployed,
  saveLocalNote,
  shieldPoolAbi,
  updateLocalNote,
  type LocalNote,
} from "@/lib/shield";
import { buildSealedSwapWitness } from "@/lib/proverSealedSwap";
import { fieldToBytes32, proveSealedSwapInBrowser } from "@/lib/proveClient";
import type { PoseidonMerklePath } from "@/lib/merklePoseidon";
import { formatUsd } from "@/lib/markets";
import {
  estimateSealedOut,
  exactSealedAmounts,
  fallbackOneToOneRates,
  formatSealedAmount,
  marksToSealedRates,
} from "@/lib/sealedRates";
import { TESTNET_STOCK_TOKENS } from "@/lib/tokens";
import {
  coarsenMarkUsd,
  publicAmountOutMin,
  type SizePrivacyMode,
} from "@/lib/privacy";
import { readVaultSealedReadiness } from "@/lib/vaultStatus";
import { DevKeysBanner } from "./DevKeysBanner";
import { StatusPill } from "./StatusPill";
import { SuccessModal } from "./SuccessModal";
import { WalletMenu } from "./WalletMenu";

type Support = "checking" | "ready" | "no_verifier" | "offline";
/** Buy = vault ETH → vault stock · Sell = vault stock → vault ETH */
type TradeDir = "buy" | "sell";

export function SealedTradePanel({
  marketId,
  marketSymbol,
  tokenAddress,
  initialDir = "buy",
}: {
  marketId?: string;
  marketSymbol: string;
  tokenAddress?: Address;
  /** buy = ETH→stock · sell = stock→ETH */
  initialDir?: TradeDir;
  /** kept for TradeView API compat; unused */
  onUseAdapter?: () => void;
}) {
  const shieldLive = isShieldDeployed();
  const poseidonMode = HASH_SCHEME === "poseidon";
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const onProduct = chainId === CHAIN;
  const { open, refresh: refreshNotes } = useLocalShieldNotes(address);
  const {
    pathForLeaf,
    leafIndexForCommitment,
    refresh: refreshTree,
    loading: treeLoading,
    error: treeError,
    leafCount,
  } = useShieldTree();
  // leafIndexForCommitment used after sealedSwap success to bind new notes
  const { data: marketsData } = useLiveMarkets();

  const [support, setSupport] = useState<Support>("checking");
  const [dir, setDir] = useState<TradeDir>(initialDir);

  useEffect(() => {
    setDir(initialDir);
  }, [initialDir]);
  const [noteId, setNoteId] = useState<string | null>(null);
  const [amount, setAmount] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showSuccess, setShowSuccess] = useState(false);
  const [busy, setBusy] = useState(false);
  /** max = amountOutMin = 1 on-chain (size privacy). Default on — our moat. */
  const [sizePrivacy, setSizePrivacy] = useState<SizePrivacyMode>("max");

  const spentNoteId = useRef<string | null>(null);
  const pendingOut = useRef<LocalNote | null>(null);
  const pendingChange = useRef<LocalNote | null>(null);
  const handledHash = useRef<string | null>(null);

  const {
    writeContract,
    data: hash,
    isPending,
    error: writeError,
    reset,
  } = useWriteContract();

  const { isLoading: confirming, isSuccess } = useWaitForTransactionReceipt({
    hash,
    chainId: CHAIN,
  });

  // Dedicated RH RPC — works with wallet off or on another chain
  const checkVault = useCallback(async () => {
    if (!shieldLive || !poseidonMode) {
      setSupport("offline");
      return;
    }
    setSupport("checking");
    const r = await readVaultSealedReadiness();
    if (r.status === "ready") setSupport("ready");
    else if (r.status === "no_verifier") setSupport("no_verifier");
    else setSupport("offline");
  }, [shieldLive, poseidonMode]);

  useEffect(() => {
    void checkVault();
  }, [checkVault]);

  const stockToken =
    tokenAddress ??
    TESTNET_STOCK_TOKENS.find((t) => t.id === marketId)?.address ??
    TESTNET_STOCK_TOKENS.find(
      (t) => t.symbol.toLowerCase() === marketSymbol.toLowerCase()
    )?.address;

  /** Circuit assetIn / assetOut for current direction */
  const assetIn: Address =
    dir === "buy" ? NATIVE_ASSET : (stockToken ?? NATIVE_ASSET);
  const assetOut: Address =
    dir === "buy" ? (stockToken ?? NATIVE_ASSET) : NATIVE_ASSET;
  const inSymbol = dir === "buy" ? "ETH" : marketSymbol;
  const outSymbol = dir === "buy" ? marketSymbol : "ETH";

  const spendNotes = useMemo(() => {
    return open
      .filter((n) => {
        if (!n.bound || !n.secret || n.secret === "0x") return false;
        if (poseidonMode && n.scheme && n.scheme !== "poseidon") return false;
        if (dir === "buy") return isNativeAsset(n.asset);
        if (!stockToken) return false;
        return n.asset.toLowerCase() === stockToken.toLowerCase();
      })
      .map((n) => {
        if (n.leafIndex != null) return n;
        const idx = leafIndexForCommitment(n.commitment);
        return idx != null ? { ...n, leafIndex: idx } : n;
      })
      .filter((n) => n.leafIndex != null);
  }, [open, poseidonMode, leafIndexForCommitment, dir, stockToken]);

  const notesMissingIndex = useMemo(() => {
    return open.filter((n) => {
      if (!n.bound || !n.secret || n.secret === "0x") return false;
      if (poseidonMode && n.scheme && n.scheme !== "poseidon") return false;
      const assetOk =
        dir === "buy"
          ? isNativeAsset(n.asset)
          : Boolean(
              stockToken &&
                n.asset.toLowerCase() === stockToken.toLowerCase()
            );
      if (!assetOk) return false;
      return (
        n.leafIndex == null && leafIndexForCommitment(n.commitment) == null
      );
    }).length;
  }, [open, poseidonMode, leafIndexForCommitment, dir, stockToken]);

  useEffect(() => {
    if (support === "ready") void refreshTree();
  }, [support, refreshTree]);

  // Reset note + amount when flipping buy/sell
  useEffect(() => {
    setNoteId(null);
    setAmount("");
    setError(null);
  }, [dir]);

  const selected =
    spendNotes.find((n) => n.id === noteId) ?? spendNotes[0] ?? null;

  useEffect(() => {
    if (selected && selected.id !== noteId) setNoteId(selected.id);
  }, [selected, noteId]);

  const rateQuote = useMemo(() => {
    const markets = marketsData?.markets ?? [];
    const ethM =
      markets.find((m) => m.id === "eth") ??
      markets.find((m) => m.symbol === "ETH");
    const outM =
      markets.find((m) => m.id === marketId) ??
      markets.find(
        (m) => m.symbol.toLowerCase() === marketSymbol.toLowerCase()
      );
    const ethUsdRaw = marketsData?.ethUsd ?? ethM?.mark ?? null;
    const outUsdRaw = outM?.mark ?? null;
    const bothLive =
      ethM?.source === "live" && outM?.source === "live" && ethUsdRaw != null;
    let base =
      ethUsdRaw != null && outUsdRaw != null && ethUsdRaw > 0 && outUsdRaw > 0
        ? marksToSealedRates(
            coarsenMarkUsd(ethUsdRaw),
            coarsenMarkUsd(outUsdRaw),
            bothLive ? "live" : "static"
          )
        : null;
    if (!base) base = fallbackOneToOneRates();
    // Buy ETH→stock: rateIn=ETH, rateOut=stock. Sell stock→ETH: swap.
    if (dir === "sell") {
      return {
        ...base,
        rateIn: base.rateOut,
        rateOut: base.rateIn,
      };
    }
    return base;
  }, [marketsData, marketId, marketSymbol, dir]);

  const amountSwapPreview = safeParseEther(amount);
  const amountEntered =
    amountSwapPreview != null && amountSwapPreview > 0n;

  // Floor estimate always (instant UI). Exact fit for the circuit proof.
  const roughOut =
    amountEntered
      ? estimateSealedOut(
          amountSwapPreview!,
          rateQuote.rateIn,
          rateQuote.rateOut
        )
      : 0n;
  const exactPreview = amountEntered
    ? exactSealedAmounts(
        amountSwapPreview!,
        rateQuote.rateIn,
        rateQuote.rateOut
      )
    : null;
  const expectedOut = exactPreview?.amountOut ?? roughOut;
  const amountSwapExact = exactPreview?.amountSwap ?? 0n;
  const quoteReady = Boolean(exactPreview && exactPreview.amountOut > 0n);

  const {
    deposited: poolOutDeposited,
    isLoading: invLoading,
    refetch: refetchInv,
  } = usePoolDeposited(assetOut);
  // Inventory for the out asset (stock on buy, ETH on sell) — cash-out solvency later
  const inventoryShort =
    expectedOut > 0n &&
    poolOutDeposited != null &&
    poolOutDeposited < expectedOut;

  useEffect(() => {
    if (!isSuccess || !hash) return;
    if (handledHash.current === hash) return;
    handledHash.current = hash;

    if (spentNoteId.current) {
      updateLocalNote(spentNoteId.current, { status: "recovered" });
      spentNoteId.current = null;
    }
    void (async () => {
      await refreshTree();
      // Attach leaf indices so Move/Private trade can spend new notes immediately
      const out = pendingOut.current;
      const chg = pendingChange.current;
      if (out) {
        const idx = leafIndexForCommitment(out.commitment);
        saveLocalNote({
          ...out,
          txHash: hash,
          leafIndex: idx ?? out.leafIndex,
        });
        pendingOut.current = null;
      }
      if (chg) {
        const idx = leafIndexForCommitment(chg.commitment);
        saveLocalNote({
          ...chg,
          txHash: hash,
          leafIndex: idx ?? chg.leafIndex,
        });
        pendingChange.current = null;
      }
      refreshNotes();
      setShowSuccess(true);
      setBusy(false);
      setStatus(null);
      void import("@/lib/track").then(({ track }) => {
        track("sealed_swap_success", { asset: marketSymbol.slice(0, 12) });
      });
      void import("@/lib/onboarding").then(({ markOnboardingStep }) => {
        markOnboardingStep("private-trade");
        markOnboardingStep("shield");
      });
    })();
  }, [
    isSuccess,
    hash,
    refreshNotes,
    refreshTree,
    marketSymbol,
    leafIndexForCommitment,
  ]);

  useEffect(() => {
    if (!writeError) return;
    const msg = writeError.message.slice(0, 180);
    queueMicrotask(() => {
      setBusy(false);
      setStatus(null);
      setError(msg);
    });
  }, [writeError]);

  async function onSealedSwap() {
    setError(null);
    if (
      !selected ||
      !address ||
      !SHIELD_POOL_ADDRESS ||
      !stockToken ||
      !poseidonMode
    ) {
      setError(
        dir === "buy"
          ? "Shield some ETH first, then pick a stock on the left."
          : `Shield some ${marketSymbol} first, or buy it privately.`
      );
      return;
    }
    if (support !== "ready") {
      setError("Vault not ready yet. Wait a second and try again.");
      return;
    }

    const amountWanted = safeParseEther(amount);
    if (amountWanted === null || amountWanted <= 0n) {
      setError("Enter an amount.");
      return;
    }
    if (amountWanted > BigInt(selected.amountWei)) {
      setError(`That is more ${inSymbol} than this vault note holds.`);
      return;
    }

    const exact = exactSealedAmounts(
      amountWanted,
      rateQuote.rateIn,
      rateQuote.rateOut
    );
    if (!exact) {
      setError("Try Max, or a slightly smaller amount.");
      return;
    }

    setBusy(true);
    reset();
    handledHash.current = null;
    spentNoteId.current = selected.id;

    try {
      setStatus("Syncing vault…");
      await refreshTree();

      let leafIdx = selected.leafIndex;
      if (leafIdx == null) {
        leafIdx = leafIndexForCommitment(selected.commitment) ?? undefined;
      }
      if (leafIdx == null) {
        throw new Error(
          "This vault note is not linked yet. Open Shield, wait for confirm, then come back."
        );
      }

      const path = await pathForLeaf(leafIdx);
      if (!path) throw new Error("Vault sync failed. Tap Refresh and retry.");

      setStatus("Building private proof… 10–40 seconds is normal.");
      const { rateIn, rateOut } = rateQuote;
      // Do NOT publish exact amountOut as amountOutMin — that was the size leak.
      const amountOutMin = publicAmountOutMin(exact.amountOut, sizePrivacy);
      const w = await buildSealedSwapWitness({
        secretHex: selected.secret,
        amountIn: BigInt(selected.amountWei),
        amountSwap: exact.amountSwap,
        assetIn,
        assetOut,
        amountOutMin,
        rateIn,
        rateOut,
        path: path as PoseidonMerklePath,
      });
      if (w.blocker) throw new Error(w.blocker);

      let proofBytes: `0x${string}`;
      try {
        ({ proofBytes } = await proveSealedSwapInBrowser(w.circomInput));
      } catch (pe) {
        const msg = pe instanceof Error ? pe.message : String(pe);
        throw new Error(
          msg.includes("Assert") || msg.includes("Error in template")
            ? "Proof failed. Tap Refresh, then Max, and try again."
            : `Proof failed: ${msg.slice(0, 140)}`
        );
      }

      pendingOut.current = {
        id: `ss-out-${Date.now()}`,
        chainId: CHAIN,
        pool: SHIELD_POOL_ADDRESS,
        asset: w.outNote.asset,
        amountWei: w.outNote.amountWei,
        commitment: w.outNote.commitment,
        secret: w.outNote.secret,
        nullifier: w.outNote.nullifier,
        bound: true,
        scheme: "poseidon",
        from: address,
        createdAt: Date.now(),
        status: "open",
        source: "local",
      };
      pendingChange.current =
        BigInt(w.changeNote.amountWei) > 0n
          ? {
              id: `ss-chg-${Date.now()}`,
              chainId: CHAIN,
              pool: SHIELD_POOL_ADDRESS,
              asset: w.changeNote.asset,
              amountWei: w.changeNote.amountWei,
              commitment: w.changeNote.commitment,
              secret: w.changeNote.secret,
              nullifier: w.changeNote.nullifier,
              bound: true,
              scheme: "poseidon",
              from: address,
              createdAt: Date.now(),
              status: "open",
              source: "local",
            }
          : null;

      setStatus("Confirm in your wallet…");
      writeContract({
        address: SHIELD_POOL_ADDRESS,
        abi: shieldPoolAbi,
        functionName: "sealedSwap",
        args: [
          proofBytes,
          fieldToBytes32(w.publicInputs.root),
          fieldToBytes32(w.publicInputs.nullifier),
          fieldToBytes32(w.publicInputs.newCommitmentOut),
          fieldToBytes32(w.publicInputs.newCommitmentChange),
          assetIn,
          assetOut,
          w.publicInputs.amountOutMin,
          w.publicInputs.rateIn,
          w.publicInputs.rateOut,
        ],
        gas: SEALED_SWAP_GAS_LIMIT,
        chainId: CHAIN,
      });
      void import("@/lib/track").then(({ track }) => {
        // No amounts — privacy stack
        track("sealed_swap_submit", {
          asset: marketSymbol.slice(0, 12),
          dir,
        });
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Private trade failed");
      setBusy(false);
      setStatus(null);
      pendingOut.current = null;
      pendingChange.current = null;
      spentNoteId.current = null;
    }
  }

  const working = busy || isPending || confirming;

  if (!shieldLive || !poseidonMode) {
    return (
      <div className="rounded-xl border border-line bg-panel p-5 text-sm text-mute">
        Private trade is not configured on this build.
      </div>
    );
  }

  return (
    <>
      <div className="space-y-4">
        <DevKeysBanner compact />

        {support === "checking" && (
          <div className="rounded-xl border border-line bg-panel p-5 text-sm text-mute">
            Connecting to the vault…
          </div>
        )}

        {support === "offline" && (
          <div className="rounded-xl border border-line bg-panel p-5 text-sm text-mute">
            <p className="font-display text-2xl text-foreground">
              Can&apos;t reach the vault
            </p>
            <p className="mt-2 leading-relaxed">
              The app talks to Robinhood testnet RPC directly (wallet network
              does not matter for this check). Retry, or wait a few seconds if
              the RPC is flaky.
            </p>
            {SHIELD_POOL_ADDRESS && (
              <p className="mt-2 text-[10px] text-mute">
                vault {shortAddress(SHIELD_POOL_ADDRESS, 6)}
              </p>
            )}
            <button
              type="button"
              onClick={() => void checkVault()}
              className="mt-4 inline-flex min-h-11 w-full items-center justify-center rounded-xl bg-lime text-sm font-semibold text-black"
            >
              Retry
            </button>
          </div>
        )}

        {support === "no_verifier" && (
          <div className="rounded-xl border border-line bg-panel p-5 text-sm text-mute">
            <p className="font-display text-2xl text-foreground">
              Private trade offline
            </p>
            <p className="mt-2 leading-relaxed">
              The vault is up, but the private-trade checker is not set. We need
              to flip that on-chain. Use Shield / Move until then.
            </p>
          </div>
        )}

        {support === "ready" && (
          <div className="overflow-hidden rounded-xl border border-line bg-panel">
            <div className="flex items-center justify-between border-b border-line px-5 py-4">
              <div>
                <p className="font-display text-2xl text-foreground">
                  Private trade
                </p>
                <p className="text-sm text-mute">
                  Vault {inSymbol} → vault {outSymbol}. Size stays private. No
                  public market needed.
                </p>
              </div>
              <StatusPill tone="lime" dot>
                Ready
              </StatusPill>
            </div>
            <div className="space-y-4 p-5">
              <div
                className="flex gap-1 rounded-lg border border-line p-1"
                role="group"
                aria-label="Trade direction"
              >
                <button
                  type="button"
                  disabled={working}
                  onClick={() => setDir("buy")}
                  className={`min-h-10 flex-1 rounded-md text-sm font-medium ${
                    dir === "buy"
                      ? "bg-lime text-black"
                      : "text-mute hover:text-foreground"
                  }`}
                >
                  Buy {marketSymbol}
                </button>
                <button
                  type="button"
                  disabled={working}
                  onClick={() => setDir("sell")}
                  className={`min-h-10 flex-1 rounded-md text-sm font-medium ${
                    dir === "sell"
                      ? "bg-lime text-black"
                      : "text-mute hover:text-foreground"
                  }`}
                >
                  Sell {marketSymbol}
                </button>
              </div>

              <div className="rounded-xl border border-lime/25 bg-lime/5 px-4 py-3 text-xs leading-relaxed text-mute">
                <p className="font-medium text-foreground">
                  Size privacy {sizePrivacy === "max" ? "on" : "relaxed"}
                </p>
                <p className="mt-1">
                  {sizePrivacy === "max"
                    ? "On-chain min-out is a floor (1 wei), not your real size. Explorer sees the vault proof and pair — not how much you traded."
                    : "Min-out uses loose slippage. Tighter floors can leak size magnitude on-chain."}
                </p>
                <label className="mt-2 flex cursor-pointer items-center gap-2 text-foreground">
                  <input
                    type="checkbox"
                    checked={sizePrivacy === "max"}
                    onChange={(e) =>
                      setSizePrivacy(e.target.checked ? "max" : "slippage")
                    }
                    className="accent-[var(--lime,#c8ff00)]"
                  />
                  Max size privacy (recommended)
                </label>
              </div>

              <ol className="list-decimal space-y-1 pl-5 text-xs text-mute">
                <li>
                  <Link href="/app/shield" className="text-lime hover:underline">
                    Shield {inSymbol}
                  </Link>{" "}
                  into the vault
                </li>
                <li>
                  Pick how much {inSymbol} to {dir === "buy" ? "spend" : "sell"}
                </li>
                <li>Wait for the proof, confirm in your wallet</li>
              </ol>

              <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-mute">
                <span>
                  {treeLoading
                    ? "Syncing vault…"
                    : treeError
                      ? "Vault sync error"
                      : `Vault ok · ${leafCount} notes on chain`}
                  {SHIELD_POOL_ADDRESS
                    ? ` · ${shortAddress(SHIELD_POOL_ADDRESS, 4)}`
                    : ""}
                </span>
                <button
                  type="button"
                  onClick={() => void refreshTree()}
                  disabled={treeLoading || working}
                  className="text-lime hover:underline disabled:opacity-50"
                >
                  Refresh
                </button>
              </div>

              <div>
                <p className="text-sm font-medium text-foreground">
                  Your vault {inSymbol}
                </p>
                {spendNotes.length === 0 ? (
                  <div className="mt-2 rounded-xl border border-line bg-background/60 px-4 py-3 text-sm text-mute">
                    <p>
                      No vault {inSymbol} yet. This side spends{" "}
                      <strong className="text-foreground">
                        {inSymbol} in the vault
                      </strong>
                      .
                    </p>
                    <Link
                      href="/app/shield"
                      className="mt-3 inline-flex min-h-11 w-full items-center justify-center rounded-xl bg-lime text-sm font-semibold text-black"
                    >
                      Shield {inSymbol}
                    </Link>
                    {dir === "sell" && (
                      <button
                        type="button"
                        className="mt-2 w-full text-center text-xs text-lime hover:underline"
                        onClick={() => setDir("buy")}
                      >
                        Or buy {marketSymbol} privately first
                      </button>
                    )}
                    {notesMissingIndex > 0 && (
                      <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">
                        Found notes that are not linked yet. Tap Refresh above.
                      </p>
                    )}
                  </div>
                ) : (
                  <ul className="mt-2 divide-y divide-line rounded-xl border border-line">
                    {spendNotes.map((n) => (
                      <li key={n.id}>
                        <button
                          type="button"
                          disabled={working}
                          onClick={() => setNoteId(n.id)}
                          className={`flex w-full items-center justify-between px-4 py-3 text-left text-sm ${
                            selected?.id === n.id
                              ? "bg-lime/10 text-foreground"
                              : "text-mute hover:text-foreground"
                          }`}
                        >
                          <span className="font-medium text-foreground">
                            {formatEth(BigInt(n.amountWei))} {inSymbol}
                          </span>
                          <span className="text-xs">{assetLabel(n.asset)}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div>
                <label
                  htmlFor="ss-amt"
                  className="text-sm font-medium text-foreground"
                >
                  {inSymbol} to {dir === "buy" ? "spend" : "sell"}
                </label>
                <div className="mt-2 flex overflow-hidden rounded-md border border-line focus-within:border-lime">
                  <input
                    id="ss-amt"
                    inputMode="decimal"
                    value={amount}
                    onChange={(e) =>
                      setAmount(e.target.value.replace(/[^0-9.]/g, ""))
                    }
                    placeholder="0.0"
                    className="min-h-12 flex-1 bg-transparent px-4 text-lg outline-none"
                  />
                  <button
                    type="button"
                    className="border-l border-line px-3 text-xs text-lime"
                    aria-label="Use full note amount"
                    onClick={() =>
                      selected &&
                      setAmount(formatEther(BigInt(selected.amountWei)))
                    }
                  >
                    Max
                  </button>
                </div>
              </div>

              <div className="rounded-xl border border-line bg-background/60 px-4 py-3 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-mute">You get (est.)</span>
                  <span
                    key={`${dir}-${amount}-${expectedOut.toString()}`}
                    className="font-medium text-foreground tabular-nums"
                  >
                    {expectedOut > 0n
                      ? `${formatSealedAmount(expectedOut)} ${outSymbol}`
                      : amountEntered
                        ? `Can't price — try Max`
                        : `— ${outSymbol}`}
                  </span>
                </div>
                <div className="mt-2 flex items-center justify-between gap-3 text-xs text-mute">
                  <span>
                    {rateQuote.source === "fallback_1_1"
                      ? "1:1 test rate"
                      : `${formatUsd(rateQuote.ethUsd)} ETH · ${formatUsd(rateQuote.outUsd)} ${marketSymbol}`}
                  </span>
                  <StatusPill
                    tone={rateQuote.source === "live" ? "lime" : "mute"}
                  >
                    {rateQuote.source === "live" ? "Live marks" : "Marks"}
                  </StatusPill>
                </div>
                {quoteReady &&
                  amountSwapExact > 0n &&
                  amountSwapPreview != null &&
                  amountSwapExact !== amountSwapPreview && (
                    <p className="mt-1 text-[11px] text-mute">
                      Exact size {formatSealedAmount(amountSwapExact)}{" "}
                      {inSymbol} for the proof.
                    </p>
                  )}
                <div className="mt-2 flex items-center justify-between gap-3 text-xs text-mute">
                  <span>Vault inventory ({outSymbol})</span>
                  <span className="flex items-center gap-2 font-medium text-foreground">
                    {invLoading
                      ? "…"
                      : poolOutDeposited != null
                        ? formatSealedAmount(poolOutDeposited)
                        : "—"}
                    <button
                      type="button"
                      onClick={() => void refetchInv()}
                      className="text-lime hover:underline"
                    >
                      Refresh
                    </button>
                  </span>
                </div>
              </div>

              {inventoryShort && (
                <p className="text-xs text-amber-600 dark:text-amber-400">
                  Vault holds less {outSymbol} than this trade. Private trade can
                  still settle, but cashing out {outSymbol} later may fail until
                  inventory is topped up.{" "}
                  <Link href="/app/shield" className="underline">
                    Shield more
                  </Link>
                </p>
              )}

              {!isConnected ? (
                <div className="space-y-2">
                  <p className="text-xs text-mute">
                    Connect a wallet to sign the trade. Vault reads work without
                    it.
                  </p>
                  <WalletMenu />
                </div>
              ) : !onProduct ? (
                <div className="space-y-2">
                  <p className="text-xs text-mute">
                    Wallet is on the wrong network. Switch to Robinhood testnet
                    (46630) to sign.
                  </p>
                  <button
                    type="button"
                    onClick={() => void ensureRhTestnetWallet()}
                    className="inline-flex min-h-12 w-full items-center justify-center rounded-xl bg-lime text-sm font-semibold text-black"
                  >
                    Switch to Robinhood testnet
                  </button>
                </div>
              ) : (
                <>
                  <button
                    type="button"
                    disabled={
                      working ||
                      !selected ||
                      !stockToken ||
                      !amountEntered ||
                      !quoteReady ||
                      treeLoading
                    }
                    onClick={() => void onSealedSwap()}
                    className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-lime text-sm font-semibold text-black disabled:opacity-50"
                  >
                    {working ? (
                      <>
                        <span
                          className="h-4 w-4 animate-spin rounded-full border-2 border-black/20 border-t-black"
                          aria-hidden
                        />
                        {status || "Working…"}
                      </>
                    ) : dir === "buy" ? (
                      `Buy ${marketSymbol} privately`
                    ) : (
                      `Sell ${marketSymbol} privately`
                    )}
                  </button>
                  {!working && selected && amountEntered && !quoteReady && (
                    <p className="text-center text-xs text-amber-600 dark:text-amber-400">
                      Could not lock a proof size for that amount. Tap Max and
                      try again.
                    </p>
                  )}
                  {!working && !selected && (
                    <p className="text-center text-xs text-mute">
                      Select a vault ETH note above.
                    </p>
                  )}
                  {!working && selected && !amountEntered && (
                    <p className="text-center text-xs text-mute">
                      Enter how much ETH to sell (or Max).
                    </p>
                  )}
                </>
              )}

              {error && (
                <p role="alert" className="text-sm text-red-500">
                  {error}
                </p>
              )}
              {status && !error && (
                <p className="text-sm text-mute">{status}</p>
              )}
              {hash && !isSuccess && (
                <p className="text-sm text-mute">
                  Submitted…{" "}
                  <a
                    href={EXPLORER_TX(hash)}
                    target="_blank"
                    rel="noreferrer"
                    className="text-lime hover:underline"
                  >
                    View
                  </a>
                </p>
              )}
            </div>
          </div>
        )}
      </div>

      <SuccessModal
        open={showSuccess}
        title="Private trade done"
        body={
          <p>
            You received vault {outSymbol}. Size stays out of the public min-out.
            Explorer shows a vault proof, not a market fill. Cash out later will
            publish amount by design — stay in vault to stay private.
            {hash ? (
              <>
                {" "}
                <a
                  href={EXPLORER_TX(hash)}
                  target="_blank"
                  rel="noreferrer"
                  className="text-lime hover:underline"
                >
                  View tx
                </a>
              </>
            ) : null}
          </p>
        }
        primaryHref="/app"
        primaryLabel="See portfolio"
        onClose={() => setShowSuccess(false)}
      />
    </>
  );
}
