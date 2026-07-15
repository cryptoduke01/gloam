"use client";

/**
 * Vault trade adapter (testnet):
 * unshield vault note → public DEX swap → reshield proceeds.
 * Honest privacy: hold is private; swap size is public on the execution edge.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  useAccount,
  useBalance,
  useChainId,
  usePublicClient,
  useReadContract,
  useWaitForTransactionReceipt,
  useWriteContract,
} from "wagmi";
import { formatEther, formatUnits, type Address, type Hex } from "viem";
import {
  EXPLORER_TX,
  PRODUCT_CHAIN_ID as CHAIN,
  formatEth,
} from "@/lib/chain";
import {
  DEX_ROUTER,
  WETH,
  applySlippage,
  deadlineSeconds,
  erc20Abi,
  routerAbi,
} from "@/lib/dex";
import { useLocalShieldNotes } from "@/hooks/useLocalShieldNotes";
import { useShieldTree } from "@/hooks/useShieldTree";
import {
  APPROVE_GAS_LIMIT,
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
import { makeBoundNotePoseidon } from "@/lib/notePoseidon";
import { buildPoseidonUnshieldWitness } from "@/lib/proverPoseidon";
import { fieldToBytes32, proveUnshieldInBrowser } from "@/lib/proveClient";
import type { PoseidonMerklePath } from "@/lib/merklePoseidon";
import { StatusPill } from "./StatusPill";
import { SuccessModal } from "./SuccessModal";
import { WalletMenu } from "./WalletMenu";
import { DevKeysBanner } from "./DevKeysBanner";

type Side = "buy" | "sell";
type Phase =
  | "idle"
  | "prove"
  | "unshield"
  | "approve"
  | "swap"
  | "reshield"
  | "done";

type Plan = {
  side: Side;
  note: LocalNote;
  token: Address;
  symbol: string;
  /** true when approve is for vault re-shield, not the DEX router */
  reshieldApprove?: boolean;
};

export function VaultTradePanel({
  marketSymbol,
  tokenAddress,
  hasPool,
}: {
  marketId?: string;
  marketSymbol: string;
  tokenAddress?: Address;
  hasPool: boolean;
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

  const [side, setSide] = useState<Side>("buy");
  const [noteId, setNoteId] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [showSuccess, setShowSuccess] = useState(false);
  const [lastHash, setLastHash] = useState<`0x${string}` | undefined>();
  /** True after cash-out landed — show recovery links if later steps fail */
  const [needsRecovery, setNeedsRecovery] = useState(false);

  const planRef = useRef<Plan | null>(null);
  /** Pipeline phase in a ref so receipt handlers never see a stale React state */
  const phaseRef = useRef<Phase>("idle");
  const spentNoteId = useRef<string | null>(null);
  const handledHash = useRef<string | null>(null);
  const preTokenBal = useRef<bigint>(0n);
  const preEthBal = useRef<bigint>(0n);
  const unshieldDone = useRef(false);
  const pendingReshield = useRef<{
    amount: bigint;
    asset: Address;
    note: LocalNote;
  } | null>(null);

  function setPipeline(p: Phase) {
    phaseRef.current = p;
    setPhase(p);
  }

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

  const { data: ethBal, refetch: refetchEth } = useBalance({
    address,
    chainId: CHAIN,
    query: { enabled: Boolean(address) },
  });

  const { data: tokenBal, refetch: refetchTok } = useReadContract({
    address: tokenAddress,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    chainId: CHAIN,
    query: { enabled: Boolean(address && tokenAddress) },
  });

  const notes = useMemo(() => {
    return open
      .filter(
        (n) =>
          n.bound &&
          n.secret &&
          n.secret !== "0x" &&
          (!poseidonMode || n.scheme === "poseidon" || !n.scheme)
      )
      .map((n) => {
        if (n.leafIndex != null) return n;
        const idx = leafIndexForCommitment(n.commitment);
        return idx != null ? { ...n, leafIndex: idx } : n;
      })
      .filter((n) => n.leafIndex != null);
  }, [open, poseidonMode, leafIndexForCommitment]);

  const ethNotes = useMemo(
    () => notes.filter((n) => isNativeAsset(n.asset)),
    [notes]
  );

  const tokenNotes = useMemo(() => {
    if (!tokenAddress) return [];
    return notes.filter(
      (n) => n.asset.toLowerCase() === tokenAddress.toLowerCase()
    );
  }, [notes, tokenAddress]);

  const eligible = side === "buy" ? ethNotes : tokenNotes;
  const selected =
    eligible.find((n) => n.id === noteId) ?? eligible[0] ?? null;

  useEffect(() => {
    if (selected && selected.id !== noteId) setNoteId(selected.id);
  }, [selected, noteId]);

  const amountIn = selected ? BigInt(selected.amountWei) : 0n;

  const { data: quote } = useReadContract({
    address: DEX_ROUTER,
    abi: routerAbi,
    functionName: "getAmountsOut",
    args:
      hasPool &&
      tokenAddress &&
      amountIn > 0n &&
      selected
        ? side === "buy"
          ? [amountIn, [WETH, tokenAddress]]
          : [amountIn, [tokenAddress, WETH]]
        : undefined,
    chainId: CHAIN,
    query: {
      enabled:
        hasPool &&
        Boolean(tokenAddress) &&
        amountIn > 0n &&
        Boolean(selected),
    },
  });

  const quoteOut = quote?.[1];

  async function runSwap(plan: Plan) {
    if (!address) return;
    setPipeline("swap");
    setStatus(
      plan.side === "buy"
        ? `Swapping vault ETH → ${plan.symbol}…`
        : `Swapping vault ${plan.symbol} → ETH…`
    );
    handledHash.current = null;

    if (plan.side === "buy") {
      if (!quoteOut || quoteOut <= 0n) {
        throw new Error("No pool quote. Try again in a moment.");
      }
      writeContract({
        address: DEX_ROUTER,
        abi: routerAbi,
        functionName: "swapExactETHForTokens",
        args: [
          applySlippage(quoteOut),
          [WETH, plan.token],
          address,
          deadlineSeconds(),
        ],
        value: BigInt(plan.note.amountWei),
        chainId: CHAIN,
      });
      return;
    }

    // sell
    if (!quoteOut || quoteOut <= 0n) {
      throw new Error("No pool quote. Try again in a moment.");
    }
    writeContract({
      address: DEX_ROUTER,
      abi: routerAbi,
      functionName: "swapExactTokensForETH",
      args: [
        BigInt(plan.note.amountWei),
        applySlippage(quoteOut),
        [plan.token, WETH],
        address,
        deadlineSeconds(),
      ],
      chainId: CHAIN,
    });
  }

  async function runApproveThenSwap(plan: Plan) {
    if (!address) return;
    setPipeline("approve");
    setStatus(`Approve ${plan.symbol} for the router…`);
    handledHash.current = null;
    writeContract({
      address: plan.token,
      abi: erc20Abi,
      functionName: "approve",
      args: [DEX_ROUTER, BigInt(plan.note.amountWei)],
      gas: APPROVE_GAS_LIMIT,
      chainId: CHAIN,
    });
  }

  async function measureProceeds(plan: Plan): Promise<{
    amount: bigint;
    asset: Address;
  }> {
    if (!address || !publicClient) {
      throw new Error("Wallet not ready.");
    }
    if (plan.side === "buy") {
      const bal = (await publicClient.readContract({
        address: plan.token,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [address],
      })) as bigint;
      const delta = bal > preTokenBal.current ? bal - preTokenBal.current : bal;
      return { amount: delta, asset: plan.token };
    }
    const bal = await publicClient.getBalance({ address });
    const leave = 80_000_000_000_000n; // 0.00008 ETH for gas
    const afterGas = bal > leave ? bal - leave : 0n;
    const delta = bal > preEthBal.current ? bal - preEthBal.current : afterGas;
    let amount = delta > afterGas ? afterGas : delta;
    if (amount <= 0n && afterGas > 0n) amount = afterGas;
    return { amount, asset: NATIVE_ASSET };
  }

  async function submitShield(
    amount: bigint,
    asset: Address,
    commitment: Hex
  ) {
    if (!SHIELD_POOL_ADDRESS) return;
    setPipeline("reshield");
    setStatus("Shielding proceeds back into the vault…");
    handledHash.current = null;
    writeContract({
      address: SHIELD_POOL_ADDRESS,
      abi: shieldPoolAbi,
      functionName: "shield",
      args: [asset, amount, commitment],
      value: isNativeAsset(asset) ? amount : 0n,
      gas: SHIELD_GAS_LIMIT,
      chainId: CHAIN,
    });
  }

  async function runReshield(plan: Plan) {
    if (!address || !SHIELD_POOL_ADDRESS || !publicClient) return;

    const { amount, asset } = await measureProceeds(plan);
    if (amount <= 0n) {
      throw new Error(
        "Could not measure swap proceeds. Funds may be in your open wallet — use Shield manually."
      );
    }

    const n = await makeBoundNotePoseidon(amount, asset);
    const note: LocalNote = {
      id: `vt-${Date.now()}`,
      chainId: CHAIN,
      pool: SHIELD_POOL_ADDRESS,
      asset,
      amountWei: amount.toString(),
      commitment: n.commitment,
      secret: n.secret,
      nullifier: n.nullifier,
      bound: true,
      scheme: "poseidon",
      from: address,
      createdAt: Date.now(),
      status: "open",
      source: "local",
    };
    // Hold in memory until shield confirms — avoids ghost notes on fail
    pendingReshield.current = { amount, asset, note };

    // ERC-20 shield needs pool allowance first
    if (!isNativeAsset(asset)) {
      const allowance = (await publicClient.readContract({
        address: asset,
        abi: erc20Abi,
        functionName: "allowance",
        args: [address, SHIELD_POOL_ADDRESS],
      })) as bigint;
      if (allowance < amount) {
        setPipeline("approve");
        setStatus(`Approve ${plan.symbol} for the vault…`);
        handledHash.current = null;
        planRef.current = { ...plan, reshieldApprove: true };
        writeContract({
          address: asset,
          abi: erc20Abi,
          functionName: "approve",
          args: [SHIELD_POOL_ADDRESS, amount],
          gas: APPROVE_GAS_LIMIT,
          chainId: CHAIN,
        });
        return;
      }
    }

    await submitShield(amount, asset, n.commitment);
  }

  // Advance pipeline after each confirmed tx (phaseRef avoids stale React state)
  useEffect(() => {
    if (!isSuccess || !hash) return;
    if (handledHash.current === hash) return;
    handledHash.current = hash;
    setLastHash(hash);

    const plan = planRef.current;
    if (!plan) return;
    const p = phaseRef.current;

    void (async () => {
      try {
        if (p === "unshield") {
          unshieldDone.current = true;
          setNeedsRecovery(true);
          if (spentNoteId.current) {
            updateLocalNote(spentNoteId.current, { status: "recovered" });
            spentNoteId.current = null;
          }
          refreshNotes();
          void refreshTree();
          void refetchEth();
          void refetchTok();

          if (plan.side === "sell") {
            if (!publicClient || !address) return;
            const allowance = (await publicClient.readContract({
              address: plan.token,
              abi: erc20Abi,
              functionName: "allowance",
              args: [address, DEX_ROUTER],
            })) as bigint;
            const need = BigInt(plan.note.amountWei);
            if (allowance < need) {
              await runApproveThenSwap(plan);
              return;
            }
          }
          await runSwap(plan);
          return;
        }

        if (p === "approve") {
          if (plan.reshieldApprove) {
            const pending = pendingReshield.current;
            if (!pending) throw new Error("Missing re-shield note.");
            plan.reshieldApprove = false;
            if (planRef.current) planRef.current.reshieldApprove = false;
            await submitShield(
              pending.amount,
              pending.asset,
              pending.note.commitment
            );
            return;
          }
          await runSwap(plan);
          return;
        }

        if (p === "swap") {
          void refetchEth();
          void refetchTok();
          await new Promise((r) => setTimeout(r, 800));
          await runReshield(plan);
          return;
        }

        if (p === "reshield") {
          const pending = pendingReshield.current;
          if (pending) {
            saveLocalNote({
              ...pending.note,
              txHash: hash,
              status: "open",
            });
            pendingReshield.current = null;
          }
          refreshNotes();
          void refreshTree();
          setPipeline("done");
          setStatus(null);
          setShowSuccess(true);
          planRef.current = null;
          unshieldDone.current = false;
          setNeedsRecovery(false);
        }
      } catch (e) {
        const msg =
          e instanceof Error ? e.message : "Vault trade step failed";
        setError(
          unshieldDone.current
            ? `${msg} Funds may already be in your open wallet — finish swap/Shield manually.`
            : msg
        );
        setPipeline("idle");
        setStatus(null);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- receipt-driven pipeline
  }, [isSuccess, hash]);

  useEffect(() => {
    if (!writeError) return;
    setError(
      unshieldDone.current
        ? `${writeError.message.slice(0, 120)} — if cash-out already landed, finish swap/Shield from wallet balances.`
        : writeError.message.slice(0, 160)
    );
    setPipeline("idle");
    setStatus(null);
  }, [writeError]);

  async function onStart() {
    setError(null);
    setShowSuccess(false);
    reset();
    handledHash.current = null;

    if (!selected || !address || !tokenAddress || !SHIELD_POOL_ADDRESS) {
      setError("Connect wallet and pick a vault note.");
      return;
    }
    if (!hasPool) {
      setError(`No swap pool for ${marketSymbol} on testnet.`);
      return;
    }
    if (!poseidonMode || !shieldLive) {
      setError("Vault trade needs the live Poseidon pool.");
      return;
    }
    if (!onProduct) {
      setError("Switch to Robinhood testnet.");
      return;
    }
    if (matchesChain === false) {
      setError("Vault tree out of sync — open Move and refresh, then retry.");
      return;
    }
    if (selected.leafIndex == null) {
      setError("Note not linked to the vault tree yet.");
      return;
    }
    // need gas in wallet for proofs + txs
    if (ethBal && ethBal.value < 50_000_000_000_000n) {
      setError("Keep a little ETH in your open wallet for gas.");
      return;
    }

    const plan: Plan = {
      side,
      note: selected,
      token: tokenAddress,
      symbol: marketSymbol,
    };
    planRef.current = plan;
    spentNoteId.current = selected.id;
    preTokenBal.current = (tokenBal as bigint | undefined) ?? 0n;
    preEthBal.current = ethBal?.value ?? 0n;
    unshieldDone.current = false;
    setNeedsRecovery(false);
    pendingReshield.current = null;

    setPipeline("prove");
    setStatus("Building cash-out proof… 10–30s is normal.");

    try {
      const path = await pathForLeaf(selected.leafIndex);
      if (!path) throw new Error("Could not build the vault path. Refresh and try again.");

      const w = await buildPoseidonUnshieldWitness({
        secretHex: selected.secret,
        amount: BigInt(selected.amountWei),
        asset: selected.asset,
        to: address,
        path: path as PoseidonMerklePath,
      });
      if (!w.checks.commitmentMatches) {
        throw new Error(w.blocker ?? "Note does not match the vault leaf.");
      }
      const { proofBytes } = await proveUnshieldInBrowser(w.circomInput);

      setPipeline("unshield");
      setStatus("Confirm cash out in your wallet…");
      writeContract({
        address: SHIELD_POOL_ADDRESS,
        abi: shieldPoolAbi,
        functionName: "unshield",
        args: [
          proofBytes,
          fieldToBytes32(w.publicInputs.root),
          fieldToBytes32(w.publicInputs.nullifier),
          selected.asset,
          address,
          BigInt(selected.amountWei),
        ],
        gas: SHIELD_GAS_LIMIT,
        chainId: CHAIN,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not start vault trade");
      setPipeline("idle");
      setStatus(null);
      planRef.current = null;
    }
  }

  const working =
    phase !== "idle" &&
    phase !== "done" &&
    (phase === "prove" || isPending || confirming);

  const stepLabel =
    phase === "prove"
      ? "Proving…"
      : phase === "unshield"
        ? "Cashing out…"
        : phase === "approve"
          ? "Approving…"
          : phase === "swap"
            ? "Swapping…"
            : phase === "reshield"
              ? "Re-shielding…"
              : null;

  if (!shieldLive || !poseidonMode) {
    return (
      <div className="rounded-xl border border-line bg-panel p-5 text-sm text-mute">
        Vault trade needs the Poseidon pool. Shield is not configured.
      </div>
    );
  }

  return (
    <>
      <div className="space-y-4">
        <DevKeysBanner />
        <div className="rounded-xl border border-lime/25 bg-lime/5 px-4 py-3 text-sm text-mute">
          <p className="font-medium text-foreground">Vault trade adapter</p>
          <p className="mt-1">
            Holds stay in the vault; the <strong className="text-foreground">swap itself is public</strong>{" "}
            (size shows on the explorer). Proceeds re-shield automatically.
            Full sealed-size private trade comes later.
          </p>
        </div>

        {!hasPool && (
          <p className="rounded-xl border border-line bg-panel px-4 py-3 text-sm text-mute">
            No on-chain pool for {marketSymbol}. Pick an onchain market, or{" "}
            <Link href="/app/move" className="text-lime hover:underline">
              Move
            </Link>{" "}
            without trading.
          </p>
        )}

        <div className="overflow-hidden rounded-xl border border-line bg-panel">
          <div className="flex items-center justify-between border-b border-line px-5 py-4">
            <div>
              <p className="font-display text-2xl text-foreground">
                {marketSymbol}
              </p>
              <p className="text-sm text-mute">Trade from vault note</p>
            </div>
            <StatusPill tone="lime">Adapter</StatusPill>
          </div>

          <div className="space-y-4 p-5">
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setSide("buy")}
                disabled={working}
                className={`min-h-10 rounded-lg text-sm font-semibold disabled:opacity-50 ${
                  side === "buy"
                    ? "bg-lime text-black"
                    : "border border-line text-mute"
                }`}
              >
                Buy with vault ETH
              </button>
              <button
                type="button"
                onClick={() => setSide("sell")}
                disabled={working}
                className={`min-h-10 rounded-lg text-sm font-semibold disabled:opacity-50 ${
                  side === "sell"
                    ? "bg-foreground text-background"
                    : "border border-line text-mute"
                }`}
              >
                Sell vault {marketSymbol}
              </button>
            </div>

            <div>
              <p className="text-sm font-medium text-foreground">
                {side === "buy" ? "ETH vault note" : `${marketSymbol} vault note`}
              </p>
              {eligible.length === 0 ? (
                <p className="mt-2 text-sm text-mute">
                  No matching notes.{" "}
                  <Link href="/app/shield" className="text-lime hover:underline">
                    Shield
                  </Link>{" "}
                  {side === "buy" ? "ETH" : marketSymbol} first.
                </p>
              ) : (
                <ul className="mt-2 divide-y divide-line rounded-xl border border-line">
                  {eligible.map((n) => (
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
                          {isNativeAsset(n.asset)
                            ? formatEth(BigInt(n.amountWei))
                            : formatUnits(BigInt(n.amountWei), 18)}{" "}
                          {assetLabel(n.asset)}
                        </span>
                        <span className="text-xs">
                          {n.leafIndex != null ? "Ready" : "…"}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {selected && quoteOut != null && quoteOut > 0n && (
              <p className="text-sm text-mute">
                Est. out ≈{" "}
                <strong className="text-foreground">
                  {side === "buy"
                    ? `${formatUnits(quoteOut, 18)} ${marketSymbol}`
                    : `${formatEther(quoteOut)} ETH`}
                </strong>{" "}
                (before slippage). Entire note is used.
              </p>
            )}

            <ol className="space-y-1 text-xs text-mute">
              <li className={phase === "unshield" || phase === "prove" ? "text-lime" : ""}>
                1. Cash out note (public edge)
              </li>
              <li className={phase === "approve" || phase === "swap" ? "text-lime" : ""}>
                2. Swap on public DEX
              </li>
              <li className={phase === "reshield" ? "text-lime" : ""}>
                3. Re-shield proceeds into vault
              </li>
            </ol>

            {!isConnected || !onProduct ? (
              <WalletMenu />
            ) : (
              <button
                type="button"
                disabled={
                  working ||
                  !selected ||
                  !hasPool ||
                  matchesChain === false
                }
                onClick={() => void onStart()}
                className="inline-flex min-h-12 w-full items-center justify-center rounded-xl bg-lime text-sm font-semibold text-black disabled:opacity-50"
              >
                {working
                  ? status || stepLabel || "Working…"
                  : side === "buy"
                    ? `Buy ${marketSymbol} from vault`
                    : `Sell ${marketSymbol} from vault`}
              </button>
            )}

            {error && (
              <div role="alert" className="space-y-2 text-sm text-red-500">
                <p>{error}</p>
                {needsRecovery && (
                  <p className="text-mute">
                    Recovery:{" "}
                    <button
                      type="button"
                      className="text-lime hover:underline"
                      onClick={() => {
                        // parent TradeView pathMode — deep-link query
                        window.location.href = "/app/trade?path=public";
                      }}
                    >
                      swap from open wallet
                    </button>
                    {" · "}
                    <Link
                      href="/app/shield"
                      className="text-lime hover:underline"
                    >
                      re-shield leftover
                    </Link>
                    {" · "}
                    <Link href="/app/move" className="text-lime hover:underline">
                      cash out other notes
                    </Link>
                  </p>
                )}
              </div>
            )}
            {status && !error && (
              <p className="text-sm text-mute">{status}</p>
            )}
            {hash && phase !== "done" && (
              <p className="text-sm text-mute">
                Tx{" "}
                <a
                  href={EXPLORER_TX(hash)}
                  target="_blank"
                  rel="noreferrer"
                  className="text-lime hover:underline"
                >
                  view
                </a>
              </p>
            )}
          </div>
        </div>
      </div>

      <SuccessModal
        open={showSuccess}
        title="Vault trade complete"
        body={
          <p>
            {marketSymbol} vault trade finished. Proceeds were re-shielded when
            measurable.{" "}
            {lastHash && (
              <a
                href={EXPLORER_TX(lastHash)}
                target="_blank"
                rel="noreferrer"
                className="text-lime hover:underline"
              >
                Last tx
              </a>
            )}
          </p>
        }
        primaryHref="/app"
        primaryLabel="Portfolio"
        onClose={() => {
          setShowSuccess(false);
          setPipeline("idle");
        }}
      />
    </>
  );
}
