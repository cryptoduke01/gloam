"use client";

/**
 * Private-size vault swap (sealed trade).
 * Enabled only when the vault contract supports sealedSwap + a non-zero verifier.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  useAccount,
  useChainId,
  usePublicClient,
  useWaitForTransactionReceipt,
  useWriteContract,
} from "wagmi";
import { formatEther, zeroAddress, type Address } from "viem";
import {
  EXPLORER_TX,
  PRODUCT_CHAIN_ID as CHAIN,
  formatEth,
} from "@/lib/chain";
import { safeParseEther } from "@/lib/amount";
import { useLocalShieldNotes } from "@/hooks/useLocalShieldNotes";
import { useShieldTree } from "@/hooks/useShieldTree";
import {
  HASH_SCHEME,
  NATIVE_ASSET,
  SHIELD_GAS_LIMIT,
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
import { TESTNET_STOCK_TOKENS } from "@/lib/tokens";
import { sealedTradeStatus } from "@/lib/sealedTrade";
import { DevKeysBanner } from "./DevKeysBanner";
import { StatusPill } from "./StatusPill";
import { SuccessModal } from "./SuccessModal";
import { WalletMenu } from "./WalletMenu";

type Support = "checking" | "unsupported" | "ready" | "no_verifier";

export function SealedTradePanel({
  marketId,
  marketSymbol,
  tokenAddress,
  onUseAdapter,
}: {
  marketId?: string;
  marketSymbol: string;
  tokenAddress?: Address;
  onUseAdapter: () => void;
}) {
  const shieldLive = isShieldDeployed();
  const poseidonMode = HASH_SCHEME === "poseidon";
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const onProduct = chainId === CHAIN;
  const publicClient = usePublicClient({ chainId: CHAIN });
  const { open, refresh: refreshNotes } = useLocalShieldNotes(address);
  const {
    matchesChain,
    pathForLeaf,
    leafIndexForCommitment,
    refresh: refreshTree,
  } = useShieldTree();

  const [support, setSupport] = useState<Support>("checking");
  const [noteId, setNoteId] = useState<string | null>(null);
  const [amount, setAmount] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showSuccess, setShowSuccess] = useState(false);
  const [busy, setBusy] = useState(false);

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

  // Detect sealedSwapVerifier on the live pool
  useEffect(() => {
    if (!publicClient || !SHIELD_POOL_ADDRESS || !shieldLive) {
      setSupport("unsupported");
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const v = (await publicClient.readContract({
          address: SHIELD_POOL_ADDRESS,
          abi: shieldPoolAbi,
          functionName: "sealedSwapVerifier",
        })) as Address;
        if (cancelled) return;
        if (!v || v === zeroAddress) setSupport("no_verifier");
        else setSupport("ready");
      } catch {
        // Method missing on older pool bytecode
        if (!cancelled) setSupport("unsupported");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [publicClient, shieldLive]);

  const ethNotes = useMemo(() => {
    return open
      .filter(
        (n) =>
          n.bound &&
          n.secret &&
          n.secret !== "0x" &&
          isNativeAsset(n.asset) &&
          (!poseidonMode || n.scheme === "poseidon" || !n.scheme)
      )
      .map((n) => {
        if (n.leafIndex != null) return n;
        const idx = leafIndexForCommitment(n.commitment);
        return idx != null ? { ...n, leafIndex: idx } : n;
      })
      .filter((n) => n.leafIndex != null);
  }, [open, poseidonMode, leafIndexForCommitment]);

  const selected =
    ethNotes.find((n) => n.id === noteId) ?? ethNotes[0] ?? null;

  useEffect(() => {
    if (selected && selected.id !== noteId) setNoteId(selected.id);
  }, [selected, noteId]);

  // Prefer faucet token registry so private trade works even without a Uniswap pair
  const outToken =
    tokenAddress ??
    TESTNET_STOCK_TOKENS.find((t) => t.id === marketId)?.address ??
    TESTNET_STOCK_TOKENS.find(
      (t) => t.symbol.toLowerCase() === marketSymbol.toLowerCase()
    )?.address;

  useEffect(() => {
    if (!isSuccess || !hash) return;
    if (handledHash.current === hash) return;
    handledHash.current = hash;

    if (spentNoteId.current) {
      updateLocalNote(spentNoteId.current, { status: "recovered" });
      spentNoteId.current = null;
    }
    if (pendingOut.current) {
      saveLocalNote({ ...pendingOut.current, txHash: hash });
      pendingOut.current = null;
    }
    if (pendingChange.current) {
      saveLocalNote({ ...pendingChange.current, txHash: hash });
      pendingChange.current = null;
    }
    refreshNotes();
    void refreshTree();
    setShowSuccess(true);
    setBusy(false);
    setStatus(null);
  }, [isSuccess, hash, refreshNotes, refreshTree]);

  useEffect(() => {
    if (!writeError) return;
    setBusy(false);
    setStatus(null);
    setError(writeError.message.slice(0, 180));
  }, [writeError]);

  async function onSealedSwap() {
    setError(null);
    if (
      !selected ||
      !address ||
      !SHIELD_POOL_ADDRESS ||
      !outToken ||
      !poseidonMode
    ) {
      setError("Pick a vault ETH note and a stock market.");
      return;
    }
    if (support !== "ready") {
      setError("This vault is not ready for private trade yet.");
      return;
    }
    if (matchesChain === false) {
      setError("Vault tree out of sync — refresh and try again.");
      return;
    }

    const amountSwap = safeParseEther(amount);
    if (amountSwap === null || amountSwap <= 0n) {
      setError("Enter a valid amount.");
      return;
    }
    if (amountSwap > BigInt(selected.amountWei)) {
      setError("Amount is larger than this vault note.");
      return;
    }

    setBusy(true);
    reset();
    handledHash.current = null;
    spentNoteId.current = selected.id;

    try {
      const path = await pathForLeaf(selected.leafIndex!);
      if (!path) throw new Error("Could not build vault path — refresh tree.");

      setStatus("Building private trade proof… 10–30s is normal.");
      // 1:1 testnet rate (rateIn = rateOut = 1)
      const w = await buildSealedSwapWitness({
        secretHex: selected.secret,
        amountIn: BigInt(selected.amountWei),
        amountSwap,
        assetIn: NATIVE_ASSET,
        assetOut: outToken,
        amountOutMin: amountSwap, // 1:1, min = swap size
        rateIn: 1n,
        rateOut: 1n,
        path: path as PoseidonMerklePath,
      });
      if (w.blocker) throw new Error(w.blocker);

      const { proofBytes } = await proveSealedSwapInBrowser(w.circomInput);

      pendingOut.current = {
        id: `ss-out-${Date.now()}`,
        chainId: CHAIN,
        pool: SHIELD_POOL_ADDRESS,
        asset: w.outNote.asset,
        amountWei: w.outNote.amountWei,
        commitment: w.outNote.commitment,
        secret: w.outNote.secret,
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
              bound: true,
              scheme: "poseidon",
              from: address,
              createdAt: Date.now(),
              status: "open",
              source: "local",
            }
          : null;

      setStatus("Confirm private trade in your wallet…");
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
          NATIVE_ASSET,
          outToken,
          w.publicInputs.amountOutMin,
          w.publicInputs.rateIn,
          w.publicInputs.rateOut,
        ],
        gas: SHIELD_GAS_LIMIT * 2n,
        chainId: CHAIN,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Private trade failed");
      setBusy(false);
      setStatus(null);
      pendingOut.current = null;
      pendingChange.current = null;
    }
  }

  const working = busy || isPending || confirming;
  const statusLabel = sealedTradeStatus();

  if (!shieldLive || !poseidonMode) {
    return (
      <div className="rounded-xl border border-line bg-panel p-5 text-sm text-mute">
        Private trade needs the live vault.
      </div>
    );
  }

  return (
    <>
      <div className="space-y-4">
        <DevKeysBanner />

        {support === "checking" && (
          <div className="rounded-xl border border-line bg-panel p-5 text-sm text-mute">
            Checking if this vault can settle private trades…
          </div>
        )}

        {(support === "unsupported" || support === "no_verifier") && (
          <div className="rounded-xl border border-line bg-panel p-5 text-sm text-mute">
            <p className="font-display text-2xl text-foreground">
              Private trade
            </p>
            <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.14em] text-lime">
              {statusLabel === "artifacts_ready"
                ? "Proofs ready · vault upgrade needed"
                : "Not ready"}
            </p>
            <p className="mt-3 leading-relaxed">
              {support === "unsupported"
                ? "This vault is an older version. Private trade needs a vault upgrade (redeploy with sealed swap support)."
                : "Vault has the method, but the private-trade checker is not set yet (owner must attach the verifier)."}
            </p>
            <p className="mt-2 text-xs">
              Until then, use the vault path that works today — the swap step is
              still public on the market.
            </p>
            <button
              type="button"
              onClick={onUseAdapter}
              className="mt-4 inline-flex min-h-11 w-full items-center justify-center rounded-xl bg-lime text-sm font-semibold text-black"
            >
              Trade from vault (public swap step)
            </button>
            <p className="mt-3 text-xs">
              <Link href="/docs/sealed-trade" className="text-lime hover:underline">
                How private trade works
              </Link>
              {" · "}
              <Link href="/docs/production" className="text-lime hover:underline">
                Before real money
              </Link>
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
                  ETH → {marketSymbol} · size stays private
                </p>
              </div>
              <StatusPill tone="lime">Vault settle</StatusPill>
            </div>
            <div className="space-y-4 p-5">
              <p className="text-xs text-mute">
                This path does <strong className="text-foreground">not</strong>{" "}
                need a public DEX pool for {marketSymbol}. Test rate is 1:1.
                Size stays private; the open market only sees a vault proof.
              </p>
              {!outToken && (
                <p className="text-xs text-amber-600 dark:text-amber-500">
                  Pick a stock in the list (TSLA, AMZN, …) so we know which
                  vault token to pay out.
                </p>
              )}

              <div>
                <p className="text-sm font-medium text-foreground">
                  From (vault ETH note)
                </p>
                {ethNotes.length === 0 ? (
                  <p className="mt-2 text-sm text-mute">
                    No ETH in the vault.{" "}
                    <Link href="/app/shield" className="text-lime hover:underline">
                      Shield
                    </Link>{" "}
                    first.
                  </p>
                ) : (
                  <ul className="mt-2 divide-y divide-line rounded-xl border border-line">
                    {ethNotes.map((n) => (
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
                            {formatEth(BigInt(n.amountWei))} ETH
                          </span>
                          <span className="text-xs">
                            {assetLabel(n.asset)}
                          </span>
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
                  Amount to trade
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
                    onClick={() =>
                      selected &&
                      setAmount(formatEther(BigInt(selected.amountWei)))
                    }
                  >
                    Max
                  </button>
                </div>
                <p className="mt-1 text-xs text-mute">
                  Leftover ETH stays in your vault as change. You receive{" "}
                  {marketSymbol} in the vault (1:1 test rate).
                </p>
              </div>

              {!isConnected || !onProduct ? (
                <WalletMenu />
              ) : (
                <button
                  type="button"
                  disabled={
                    working ||
                    !selected ||
                    !outToken ||
                    matchesChain === false
                  }
                  onClick={() => void onSealedSwap()}
                  className="inline-flex min-h-12 w-full items-center justify-center rounded-xl bg-lime text-sm font-semibold text-black disabled:opacity-50"
                >
                  {working ? status || "Working…" : `Trade privately → ${marketSymbol}`}
                </button>
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
        title="Private trade submitted"
        body={
          <p>
            Your vault notes updated when the trade settles. Size was not posted
            as a normal market swap.
          </p>
        }
        primaryHref={hash ? EXPLORER_TX(hash) : undefined}
        primaryLabel="View on explorer"
        onClose={() => setShowSuccess(false)}
      />
    </>
  );
}
