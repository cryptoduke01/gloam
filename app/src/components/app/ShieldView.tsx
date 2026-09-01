"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  useAccount,
  useBalance,
  useChainId,
  useReadContract,
  useReadContracts,
  useWaitForTransactionReceipt,
  useWriteContract,
} from "wagmi";
import {
  decodeEventLog,
  formatEther,
  formatUnits,
  maxUint256,
  type Address,
  type Hex,
} from "viem";
import {
  EXPLORER_TX,
  PRODUCT_CHAIN_ID,
  formatEth,
} from "@/lib/chain";
import { safeParseEther, safeParseUnits } from "@/lib/amount";
import { erc20Abi } from "@/lib/dex";
import { useEthPrice, useLiveMarkets } from "@/hooks/useLiveMarkets";
import { useLocalShieldNotes } from "@/hooks/useLocalShieldNotes";
import { formatUsd } from "@/lib/markets";
import { TESTNET_STOCK_TOKENS } from "@/lib/tokens";
import {
  APPROVE_GAS_LIMIT,
  EMERGENCY_GAS_LIMIT,
  HASH_SCHEME,
  NATIVE_ASSET,
  SHIELD_GAS_LIMIT,
  SHIELD_BOUND_GAS_LIMIT,
  SHIELD_POOL_ADDRESS,
  type LocalNote,
  assetLabel,
  isNativeAsset,
  isShieldDeployed,
  makeNoteMaterial,
  markAllNotesRecovered,
  saveLocalNote,
  shieldPoolAbi,
} from "@/lib/shield";
import { makeBoundNotePoseidon } from "@/lib/notePoseidon";
import { WalletMenu } from "./WalletMenu";
import { StatusPill } from "./StatusPill";
import { SuccessModal } from "./SuccessModal";
import { DevKeysBanner } from "./DevKeysBanner";

type TxKind = "shield" | "approve" | "pull" | null;
type AssetChoice = "eth" | string; // eth | token id

export function ShieldView() {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const onProduct = chainId === PRODUCT_CHAIN_ID;
  const { ethUsd } = useEthPrice();
  const { data: marketData } = useLiveMarkets();
  const deployed = isShieldDeployed() && Boolean(SHIELD_POOL_ADDRESS);
  const {
    open: openNotes,
    shieldedWei,
    byAsset,
    syncing,
    refresh: refreshNotes,
  } = useLocalShieldNotes(address);

  const [assetChoice, setAssetChoice] = useState<AssetChoice>("eth");
  const selectedToken =
    assetChoice === "eth"
      ? null
      : TESTNET_STOCK_TOKENS.find((t) => t.id === assetChoice) ?? null;
  const assetAddress: Address = selectedToken
    ? selectedToken.address
    : NATIVE_ASSET;

  const { data: ethBal, refetch: refetchEth } = useBalance({
    address,
    chainId: PRODUCT_CHAIN_ID,
    query: { enabled: Boolean(address) },
  });

  const { data: tokenBal, refetch: refetchTok } = useReadContract({
    address: selectedToken?.address,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    chainId: PRODUCT_CHAIN_ID,
    query: { enabled: Boolean(address && selectedToken && onProduct) },
  });

  const { data: allowance, refetch: refetchAllow } = useReadContract({
    address: selectedToken?.address,
    abi: erc20Abi,
    functionName: "allowance",
    args:
      address && SHIELD_POOL_ADDRESS
        ? [address, SHIELD_POOL_ADDRESS]
        : undefined,
    chainId: PRODUCT_CHAIN_ID,
    query: { enabled: Boolean(address && selectedToken && onProduct) },
  });

  const { data: poolData, refetch: refetchPool } = useReadContracts({
    contracts: deployed
      ? [
          {
            address: SHIELD_POOL_ADDRESS!,
            abi: shieldPoolAbi,
            functionName: "nextIndex",
            chainId: PRODUCT_CHAIN_ID,
          },
          {
            address: SHIELD_POOL_ADDRESS!,
            abi: shieldPoolAbi,
            functionName: "deposited",
            args: [NATIVE_ASSET],
            chainId: PRODUCT_CHAIN_ID,
          },
          {
            address: SHIELD_POOL_ADDRESS!,
            abi: shieldPoolAbi,
            functionName: "currentRoot",
            chainId: PRODUCT_CHAIN_ID,
          },
          {
            address: SHIELD_POOL_ADDRESS!,
            abi: shieldPoolAbi,
            functionName: "verifier",
            chainId: PRODUCT_CHAIN_ID,
          },
          {
            address: SHIELD_POOL_ADDRESS!,
            abi: shieldPoolAbi,
            functionName: "owner",
            chainId: PRODUCT_CHAIN_ID,
          },
          {
            address: SHIELD_POOL_ADDRESS!,
            abi: shieldPoolAbi,
            functionName: "deposited",
            args: [assetAddress],
            chainId: PRODUCT_CHAIN_ID,
          },
          {
            address: SHIELD_POOL_ADDRESS!,
            abi: shieldPoolAbi,
            functionName: "shieldVerifier",
            chainId: PRODUCT_CHAIN_ID,
          },
        ]
      : [],
    query: { enabled: deployed, refetchInterval: 12_000 },
  });

  const nextIndex =
    poolData?.[0]?.status === "success"
      ? (poolData[0].result as bigint)
      : null;
  const poolEth =
    poolData?.[1]?.status === "success"
      ? (poolData[1].result as bigint)
      : null;
  const currentRoot =
    poolData?.[2]?.status === "success"
      ? (poolData[2].result as Hex)
      : null;
  const verifier =
    poolData?.[3]?.status === "success"
      ? (poolData[3].result as string)
      : null;
  const owner =
    poolData?.[4]?.status === "success"
      ? (poolData[4].result as string)
      : null;
  const poolSelected =
    poolData?.[5]?.status === "success"
      ? (poolData[5].result as bigint)
      : null;
  const shieldVerifierAddr =
    poolData?.[6]?.status === "success"
      ? (poolData[6].result as string)
      : null;
  // C1: when the pool enforces bound shields, plain shield() reverts and we must
  // prove commitment == Poseidon(secret, amount, asset) via shieldBound().
  const shieldVerifierLive =
    Boolean(shieldVerifierAddr) &&
    shieldVerifierAddr !== "0x0000000000000000000000000000000000000000";

  const verifierLive =
    Boolean(verifier) &&
    verifier !== "0x0000000000000000000000000000000000000000";
  const isOwner =
    Boolean(address && owner) &&
    address!.toLowerCase() === owner!.toLowerCase();

  const [amount, setAmount] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [showSuccess, setShowSuccess] = useState(false);
  const [successTitle, setSuccessTitle] = useState("Shielded");
  const [successBody, setSuccessBody] = useState<React.ReactNode>(null);
  const [pendingNote, setPendingNote] = useState<LocalNote | null>(null);
  const [pendingKind, setPendingKind] = useState<TxKind>(null);
  const [sentLabel, setSentLabel] = useState("");
  const autoShieldAfterApprove = useRef(false);
  const pendingShieldArgs = useRef<{
    value: bigint;
    commitment: Hex;
    note: LocalNote;
  } | null>(null);

  const {
    writeContract,
    data: hash,
    isPending,
    error: writeError,
    reset,
  } = useWriteContract();

  const {
    isLoading: confirming,
    isSuccess,
    data: receipt,
  } = useWaitForTransactionReceipt({
    hash,
    chainId: PRODUCT_CHAIN_ID,
  });

  const handledHash = useRef<string | null>(null);

  const walletBalance = selectedToken
    ? (tokenBal as bigint | undefined)
    : ethBal?.value;
  const symbol = selectedToken?.symbol ?? "ETH";
  const decimals = selectedToken?.decimals ?? 18;

  const mark =
    selectedToken && marketData?.markets
      ? (marketData.markets.find((m) => m.id === selectedToken.id)?.mark ?? 0)
      : ethUsd ?? 0;

  useEffect(() => {
    if (!isSuccess || !hash || !receipt) return;
    if (handledHash.current === hash) return;
    handledHash.current = hash;

    if (pendingKind === "pull") {
      markAllNotesRecovered(address, assetAddress);
      refreshNotes();
      void refetchEth();
      void refetchTok();
      void refetchPool();
      setSuccessTitle("Pulled back");
      setSuccessBody(
        <>
          <p>
            {assetLabel(assetAddress)} left the vault → owner wallet.
          </p>
          <p className="mt-2">Testnet recovery only.</p>
        </>
      );
      setShowSuccess(true);
      setPendingKind(null);
      return;
    }

    if (pendingKind === "approve") {
      void refetchAllow();
      setPendingKind(null);
      // auto continue shield
      const pending = pendingShieldArgs.current;
      if (pending && SHIELD_POOL_ADDRESS && autoShieldAfterApprove.current) {
        autoShieldAfterApprove.current = false;
        handledHash.current = null;
        // Route through executeShield so the shieldBound (C1) branch applies
        // after an ERC20 approval too.
        void executeShield(pending.value, pending.note, pending.commitment);
      }
      return;
    }

    let leafIndex: number | undefined;
    for (const log of receipt.logs) {
      try {
        const decoded = decodeEventLog({
          abi: shieldPoolAbi,
          data: log.data,
          topics: log.topics,
        });
        if (decoded.eventName === "Shielded") {
          leafIndex = Number(decoded.args.leafIndex);
          break;
        }
      } catch {
        /* not ours */
      }
    }

    if (pendingNote) {
      // Persist only after on-chain success (avoids ghost notes on reject)
      saveLocalNote({
        ...pendingNote,
        txHash: hash,
        leafIndex,
        status: "open",
      });
    }
    setPendingNote(null);
    setPendingKind(null);
    pendingShieldArgs.current = null;
    refreshNotes();
    void refetchEth();
    void refetchTok();
    void refetchAllow();
    void refetchPool();
    void import("@/lib/track").then(({ track }) => {
      track("shield_success", {
        asset: sentLabel.replace(/[\d.]+/g, "").trim().slice(0, 16) || "asset",
      });
    });
    setSuccessTitle("Shielded");
    setSuccessBody(
      <>
        <p>
          <span className="font-medium text-foreground">{sentLabel}</span> is in
          the vault.
        </p>
        <p className="mt-2">
          <strong className="text-foreground">Move</strong> to private-send or
          cash out. For size-private stock trades, shield{" "}
          <strong className="text-foreground">ETH</strong>, then{" "}
          <a
            href="/app/trade?market=tsla&path=sealed"
            className="text-lime hover:underline"
          >
            Trade → Private trade
          </a>
          .
        </p>
      </>
    );
    setShowSuccess(true);
    void import("@/lib/onboarding").then(({ markOnboardingStep }) => {
      markOnboardingStep("shield");
      markOnboardingStep("faucet");
    });
  }, [
    isSuccess,
    hash,
    receipt,
    pendingNote,
    pendingKind,
    address,
    assetAddress,
    sentLabel,
    refreshNotes,
    refetchEth,
    refetchTok,
    refetchAllow,
    refetchPool,
    writeContract,
  ]);

  function parseAmount(): bigint | null {
    if (selectedToken) {
      return safeParseUnits(amount || "0", decimals);
    }
    return safeParseEther(amount || "0");
  }

  function validate(): string | null {
    if (!deployed) return "Pool not configured.";
    if (!isConnected || !onProduct) return "Connect and switch to testnet.";
    const value = parseAmount();
    if (value === null) return "Invalid amount.";
    if (value <= BigInt(0)) return "Amount must be greater than zero.";
    if (walletBalance !== undefined && value > walletBalance) {
      return `Not enough ${symbol}.`;
    }
    if (!selectedToken && ethBal) {
      if (
        value > ethBal.value - 50_000_000_000_000n &&
        ethBal.value > value
      ) {
        return "Leave a little ETH for gas.";
      }
    }
    return null;
  }

  async function executeShield(value: bigint, note: LocalNote, commitment: Hex) {
    if (!SHIELD_POOL_ADDRESS) return;
    const asset = selectedToken ? selectedToken.address : NATIVE_ASSET;
    setPendingNote(note);
    setPendingKind("shield");
    // Do not saveLocalNote until shield confirms, see receipt handler

    // C1 (audit): a hardened pool requires a proof that commitment ==
    // Poseidon(secret, amount, asset), submitted via shieldBound(). On legacy
    // pools (shieldVerifier unset) plain shield() still works, unchanged.
    if (shieldVerifierLive) {
      try {
        const { proveShieldInBrowser } = await import("@/lib/proveClient");
        const { proofBytes } = await proveShieldInBrowser({
          commitment: BigInt(commitment).toString(),
          amount: value.toString(),
          asset: BigInt(asset).toString(),
          secret: BigInt(note.secret).toString(),
        });
        writeContract({
          address: SHIELD_POOL_ADDRESS,
          abi: shieldPoolAbi,
          functionName: "shieldBound",
          args: [asset, value, commitment, proofBytes],
          value: selectedToken ? undefined : value,
          gas: SHIELD_BOUND_GAS_LIMIT,
          chainId: PRODUCT_CHAIN_ID,
        });
      } catch (err) {
        setFormError(
          err instanceof Error ? err.message : "Could not build shield proof."
        );
        setPendingKind(null);
        setPendingNote(null);
      }
      return;
    }

    if (selectedToken) {
      writeContract({
        address: SHIELD_POOL_ADDRESS,
        abi: shieldPoolAbi,
        functionName: "shield",
        args: [selectedToken.address, value, commitment],
        gas: SHIELD_GAS_LIMIT,
        chainId: PRODUCT_CHAIN_ID,
      });
    } else {
      writeContract({
        address: SHIELD_POOL_ADDRESS,
        abi: shieldPoolAbi,
        functionName: "shield",
        args: [NATIVE_ASSET, value, commitment],
        value,
        gas: SHIELD_GAS_LIMIT,
        chainId: PRODUCT_CHAIN_ID,
      });
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const err = validate();
    if (err) {
      setFormError(err);
      return;
    }
    if (!SHIELD_POOL_ADDRESS || !address) return;

    const value = parseAmount();
    if (value === null) {
      setFormError("Invalid amount.");
      return;
    }

    let secret: `0x${string}`;
    let commitment: `0x${string}`;
    let nullifier: `0x${string}`;
    if (HASH_SCHEME === "poseidon") {
      const n = await makeBoundNotePoseidon(value, assetAddress);
      secret = n.secret;
      commitment = n.commitment;
      nullifier = n.nullifier;
    } else {
      const n = makeNoteMaterial(value, assetAddress);
      secret = n.secret;
      commitment = n.commitment;
      nullifier = n.nullifier;
    }
    const note: LocalNote = {
      id: `${Date.now()}-${commitment.slice(0, 10)}`,
      chainId: PRODUCT_CHAIN_ID,
      pool: SHIELD_POOL_ADDRESS,
      asset: assetAddress,
      amountWei: value.toString(),
      commitment,
      secret,
      nullifier,
      bound: true,
      scheme: HASH_SCHEME,
      from: address,
      createdAt: Date.now(),
      status: "open",
      source: "local",
    };

    setFormError(null);
    reset();
    setShowSuccess(false);
    handledHash.current = null;
    setSentLabel(`${amount} ${symbol}`);
    pendingShieldArgs.current = { value, commitment, note };

    // ERC20: approve first if needed
    if (selectedToken) {
      if (allowance === undefined || allowance < value) {
        autoShieldAfterApprove.current = true;
        setPendingKind("approve");
        setPendingNote(note);
        writeContract({
          address: selectedToken.address,
          abi: erc20Abi,
          functionName: "approve",
          args: [SHIELD_POOL_ADDRESS, maxUint256],
          gas: APPROVE_GAS_LIMIT,
          chainId: PRODUCT_CHAIN_ID,
        });
        return;
      }
    }

    await executeShield(value, note, commitment);
  }

  // Clear in-memory pending on wallet reject / failed write
  useEffect(() => {
    if (!writeError) return;
    if (pendingKind === "shield" || pendingKind === "approve") {
      setPendingNote(null);
      setPendingKind(null);
      pendingShieldArgs.current = null;
      autoShieldAfterApprove.current = false;
    }
  }, [writeError, pendingKind]);

  function onOwnerPull() {
    if (!SHIELD_POOL_ADDRESS || !address || !isOwner) return;
    const amt = poolSelected ?? BigInt(0);
    if (amt <= BigInt(0)) {
      setFormError(`Pool has no ${symbol} to pull.`);
      return;
    }
    setFormError(null);
    reset();
    setShowSuccess(false);
    handledHash.current = null;
    setPendingKind("pull");
    setPendingNote(null);

    writeContract({
      address: SHIELD_POOL_ADDRESS,
      abi: shieldPoolAbi,
      functionName: "emergencyWithdraw",
      args: [assetAddress, address, amt],
      gas: EMERGENCY_GAS_LIMIT,
      chainId: PRODUCT_CHAIN_ID,
    });
  }

  const maxLabel =
    walletBalance !== undefined
      ? selectedToken
        ? formatUnits(walletBalance, decimals)
        : formatEth(walletBalance, 6)
      : "0";

  const amtNum = Number(amount);
  const usdHint =
    mark > 0 && Number.isFinite(amtNum) && amtNum > 0
      ? formatUsd(amtNum * mark)
      : null;

  const myShieldUsd =
    ethUsd != null && shieldedWei > BigInt(0)
      ? formatUsd((Number(shieldedWei) / 1e18) * ethUsd)
      : null;

  const assetRows = useMemo(() => {
    const rows: { asset: string; label: string; amount: bigint }[] = [];
    byAsset.forEach((amount, asset) => {
      if (amount > BigInt(0)) {
        rows.push({ asset, label: assetLabel(asset), amount });
      }
    });
    return rows.sort((a, b) => {
      if (isNativeAsset(a.asset)) return -1;
      if (isNativeAsset(b.asset)) return 1;
      return a.label.localeCompare(b.label);
    });
  }, [byAsset]);

  if (!deployed) {
    return (
      <div className="rounded-xl border border-line bg-panel p-6">
        <StatusPill tone="warn">Not configured</StatusPill>
        <p className="mt-3 text-sm text-mute">
          Privacy vault address missing.
        </p>
      </div>
    );
  }

  const busy = isPending || confirming;

  const hasActiveShield = openNotes.length > 0;

  return (
    <>
      <div className="mx-auto max-w-xl space-y-4">
        <form
          onSubmit={onSubmit}
          className="space-y-5 rounded-2xl border border-line bg-panel p-6"
        >
          <DevKeysBanner compact />

          <div>
            <div className="flex items-center justify-between">
              <span className="text-[11px] uppercase tracking-[0.16em] text-mute">
                You&apos;re shielding
              </span>
              <span className="flex items-center gap-1.5 text-[11px] font-medium text-lime">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" aria-hidden>
                  <rect x="4" y="10.5" width="16" height="10" rx="2.2" fill="currentColor" />
                  <path d="M8 10.5V7a4 4 0 0 1 8 0v3.5" stroke="currentColor" strokeWidth="2" />
                </svg>
                Size sealed
              </span>
            </div>
            <div className="mt-3 flex items-end gap-3">
              <input
                id="shield-amount"
                inputMode="decimal"
                autoComplete="off"
                placeholder="0"
                value={amount}
                onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))}
                className="min-w-0 flex-1 bg-transparent text-4xl font-semibold tracking-tight text-foreground outline-none placeholder:text-mute/40"
                aria-label="Amount to shield"
              />
              <div className="relative shrink-0">
                <select
                  value={assetChoice}
                  onChange={(e) => {
                    setAssetChoice(e.target.value);
                    setAmount("");
                  }}
                  className="min-h-11 cursor-pointer appearance-none rounded-xl border border-line bg-background px-4 pr-9 text-sm font-semibold text-foreground outline-none focus:border-lime"
                  aria-label="Asset to shield"
                >
                  <option value="eth">ETH</option>
                  {TESTNET_STOCK_TOKENS.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.symbol}
                    </option>
                  ))}
                </select>
                <span className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-mute">
                  &#9662;
                </span>
              </div>
            </div>
            <div className="mt-2.5 flex items-center justify-between text-xs">
              <span className="text-mute">{usdHint ? `≈ ${usdHint}` : ""}</span>
              <button
                type="button"
                disabled={!isConnected}
                onClick={() => {
                  if (walletBalance === undefined) return;
                  if (selectedToken) {
                    setAmount(formatUnits(walletBalance, decimals).slice(0, 18));
                  } else {
                    const leave = 50_000_000_000_000n;
                    const v =
                      walletBalance > leave ? walletBalance - leave : BigInt(0);
                    setAmount(v === BigInt(0) ? "0" : formatEther(v).slice(0, 12));
                  }
                }}
                className="text-mute transition-colors hover:text-foreground disabled:opacity-40"
              >
                Balance: {isConnected ? maxLabel : "0"} {symbol} ·{" "}
                <span className="font-medium text-lime">Max</span>
              </button>
            </div>
          </div>

          <div className="flex items-center justify-between rounded-xl border border-line bg-background/40 px-4 py-3 text-sm">
            <span className="text-mute">Shielding fee</span>
            <span className="font-medium text-foreground">No fee</span>
          </div>

          {!isConnected || !onProduct ? (
            <WalletMenu />
          ) : (
            <button
              type="submit"
              disabled={busy}
              className="inline-flex min-h-12 w-full items-center justify-center rounded-xl bg-lime text-sm font-semibold text-background hover:opacity-90 disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lime"
            >
              {isPending && pendingKind === "approve"
                ? "Approve in wallet…"
                : confirming && pendingKind === "approve"
                  ? "Approving…"
                  : isPending && pendingKind === "shield"
                    ? "Confirm shield…"
                    : confirming && pendingKind === "shield"
                      ? "Shielding…"
                      : selectedToken &&
                          allowance !== undefined &&
                          parseAmount() !== null &&
                          (allowance as bigint) < (parseAmount() as bigint)
                        ? `Approve & shield ${symbol}`
                        : `Shield ${symbol}`}
            </button>
          )}

          {(formError || writeError) && (
            <p role="alert" className="text-sm text-[#c0432f]">
              {formError || writeError?.message.slice(0, 180)}
            </p>
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
                View tx
              </a>
            </p>
          )}

          <p className="text-center text-xs leading-relaxed text-mute">
            Your open wallet balance drops. Only you can see what is inside the
            vault.
          </p>
        </form>

        {hasActiveShield && (
          <div className="rounded-2xl border border-line bg-[color-mix(in_srgb,var(--lime)_4%,var(--panel))] p-5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] uppercase tracking-[0.16em] text-mute">
                In your vault
              </span>
              {syncing && <span className="text-[10px] text-mute">Syncing…</span>}
            </div>
            <ul className="mt-3 space-y-1.5">
              {assetRows.map((r) => (
                <li
                  key={r.asset}
                  className="tnum text-lg font-medium text-foreground"
                >
                  {isNativeAsset(r.asset)
                    ? formatEth(r.amount)
                    : formatUnits(r.amount, 18)}{" "}
                  <span className="text-sm text-mute">{r.label}</span>
                </li>
              ))}
            </ul>
            <div className="mt-3 flex gap-4 text-xs">
              <Link href="/app/vault?tab=send" className="text-lime hover:underline">
                Send &#8594;
              </Link>
              <Link href="/app/vault?tab=move" className="text-lime hover:underline">
                Cash out &#8594;
              </Link>
            </div>
          </div>
        )}

        {isOwner && (
          <div className="rounded-2xl border border-line bg-panel p-5">
            <StatusPill tone="warn">Owner &middot; testnet</StatusPill>
            <p className="mt-3 text-sm text-foreground">
              Emergency pull of pool{" "}
              <strong>
                {poolSelected != null
                  ? isNativeAsset(assetAddress)
                    ? formatEth(poolSelected)
                    : formatUnits(poolSelected, 18)
                  : "…"}{" "}
                {symbol}
              </strong>
              .
            </p>
            <button
              type="button"
              disabled={busy || !poolSelected || poolSelected <= BigInt(0)}
              onClick={onOwnerPull}
              className="mt-3 inline-flex min-h-11 items-center justify-center rounded-xl border border-line px-4 text-sm font-medium text-foreground hover:border-mute disabled:opacity-50"
            >
              {isPending && pendingKind === "pull"
                ? "Confirm in wallet…"
                : confirming && pendingKind === "pull"
                  ? "Pulling…"
                  : `Pull pool ${symbol}`}
            </button>
          </div>
        )}
      </div>

      <SuccessModal
        open={showSuccess && Boolean(hash)}
        title={successTitle}
        body={successBody}
        primaryHref={hash ? EXPLORER_TX(hash) : undefined}
        primaryLabel="View on explorer"
        secondaryLabel="Done"
        onClose={() => {
          setShowSuccess(false);
          setAmount("");
        }}
      />
    </>
  );
}
