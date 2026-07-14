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
import { AsciiImage } from "@/components/AsciiImage";
import {
  EXPLORER_ADDRESS,
  EXPLORER_TX,
  PRODUCT_CHAIN_ID,
  formatEth,
} from "@/lib/chain";
import { safeParseEther, safeParseUnits } from "@/lib/amount";
import { FAUCET_URL } from "@/lib/faucet";
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
  SHIELD_POOL_ADDRESS,
  type LocalNote,
  assetLabel,
  isNativeAsset,
  isShieldDeployed,
  makeNoteMaterial,
  markAllNotesRecovered,
  saveLocalNote,
  shieldPoolAbi,
  updateLocalNote,
} from "@/lib/shield";
import { makeBoundNotePoseidon } from "@/lib/notePoseidon";
import { WalletMenu } from "./WalletMenu";
import { StatusPill } from "./StatusPill";
import { SuccessModal } from "./SuccessModal";

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
            {assetLabel(assetAddress)} left the pool → owner wallet.
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
        setPendingNote(pending.note);
        setPendingKind("shield");
        handledHash.current = null;
        writeContract({
          address: SHIELD_POOL_ADDRESS,
          abi: shieldPoolAbi,
          functionName: "shield",
          args: [assetAddress, pending.value, pending.commitment],
          gas: SHIELD_GAS_LIMIT,
          chainId: PRODUCT_CHAIN_ID,
        });
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
      updateLocalNote(pendingNote.id, { txHash: hash, leafIndex });
    }
    setPendingNote(null);
    setPendingKind(null);
    pendingShieldArgs.current = null;
    refreshNotes();
    void refetchEth();
    void refetchTok();
    void refetchAllow();
    void refetchPool();
    setSuccessTitle("Shielded");
    setSuccessBody(
      <>
        <p>
          <span className="font-medium text-foreground">{sentLabel}</span> is in
          the pool.
        </p>
        <p className="mt-2">
          Check Portfolio → Shielded. Private exit is not open yet.
        </p>
      </>
    );
    setShowSuccess(true);
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

  function executeShield(value: bigint, note: LocalNote, commitment: Hex) {
    if (!SHIELD_POOL_ADDRESS) return;
    setPendingNote(note);
    setPendingKind("shield");
    saveLocalNote(note);

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
        saveLocalNote(note);
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

    executeShield(value, note, commitment);
  }

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
          Shield pool address missing.
        </p>
      </div>
    );
  }

  const busy = isPending || confirming;

  const hasActiveShield = openNotes.length > 0;

  return (
    <>
      <div className="grid gap-6 lg:grid-cols-12">
        <div className="space-y-4 lg:col-span-7">
          {/* Deposit form first — primary action */}
          <div className="overflow-hidden rounded-xl border border-line bg-panel">
            <div className="relative h-36 border-b border-line sm:h-40">
              <AsciiImage
                src="/ascii/shield.png"
                alt=""
                tone="plate"
                className="h-full w-full"
                sizes="60vw"
              />
              <div className="absolute inset-0 bg-gradient-to-r from-panel via-panel/80 to-panel/40" />
              <div className="absolute bottom-4 left-5">
                <StatusPill tone="lime">Vault live</StatusPill>
                <p className="mt-2 font-display text-xl text-foreground sm:text-2xl">
                  Deposit
                </p>
              </div>
            </div>

            <form onSubmit={onSubmit} className="space-y-5 p-5 sm:p-6">
              <div>
                <p className="text-sm font-medium text-foreground">Asset</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      setAssetChoice("eth");
                      setAmount("");
                    }}
                    className={`min-h-9 rounded-full px-3 text-xs font-medium ${
                      assetChoice === "eth"
                        ? "bg-lime text-black"
                        : "border border-line text-mute hover:text-foreground"
                    }`}
                  >
                    ETH
                  </button>
                  {TESTNET_STOCK_TOKENS.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => {
                        setAssetChoice(t.id);
                        setAmount("");
                      }}
                      className={`min-h-9 rounded-full px-3 text-xs font-medium ${
                        assetChoice === t.id
                          ? "bg-lime text-black"
                          : "border border-line text-mute hover:text-foreground"
                      }`}
                    >
                      {t.symbol}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between">
                  <label
                    htmlFor="shield-amount"
                    className="text-sm font-medium text-foreground"
                  >
                    Amount
                  </label>
                  <button
                    type="button"
                    className="text-xs text-lime hover:underline disabled:opacity-40"
                    disabled={!isConnected}
                    onClick={() => {
                      if (walletBalance === undefined) return;
                      if (selectedToken) {
                        setAmount(
                          formatUnits(walletBalance, decimals).slice(0, 18)
                        );
                      } else {
                        const leave = 50_000_000_000_000n;
                        const v =
                          walletBalance > leave
                            ? walletBalance - leave
                            : BigInt(0);
                        setAmount(
                          v === BigInt(0) ? "0" : formatEther(v).slice(0, 12)
                        );
                      }
                    }}
                  >
                    Max {isConnected ? maxLabel : "—"}
                  </button>
                </div>
                <div className="mt-2 flex overflow-hidden rounded-md border border-line focus-within:border-lime">
                  <input
                    id="shield-amount"
                    inputMode="decimal"
                    autoComplete="off"
                    placeholder="0.0"
                    value={amount}
                    onChange={(e) =>
                      setAmount(e.target.value.replace(/[^0-9.]/g, ""))
                    }
                    className="min-h-12 flex-1 bg-transparent px-4 text-lg text-foreground outline-none placeholder:text-mute"
                  />
                  <span className="flex items-center border-l border-line px-4 font-mono text-sm text-mute">
                    {symbol}
                  </span>
                </div>
                {usdHint && (
                  <p className="mt-1.5 text-xs text-mute">≈ {usdHint}</p>
                )}
              </div>

              <p className="text-xs text-mute">
                Deposit hides this amount from your open wallet. Stocks need two
                confirms (approve, then shield). After that use{" "}
                <Link href="/app/move" className="text-lime hover:underline">
                  Move
                </Link>{" "}
                to private-send or cash out.
              </p>

              {!isConnected || !onProduct ? (
                <WalletMenu />
              ) : (
                <button
                  type="submit"
                  disabled={busy}
                  className="inline-flex min-h-12 w-full items-center justify-center rounded-xl bg-lime text-sm font-semibold text-black hover:opacity-90 disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lime"
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
                <p role="alert" className="text-sm text-red-500">
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
            </form>
          </div>

          {openNotes.length > 0 && (
            <div className="overflow-hidden rounded-xl border border-line bg-panel">
              <div className="flex items-center justify-between border-b border-line px-5 py-3">
                <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-mute">
                  Your deposits
                </p>
                {syncing && (
                  <span className="text-[10px] text-mute">Syncing chain…</span>
                )}
              </div>
              <ul className="divide-y divide-line">
                {openNotes.slice(0, 12).map((n) => (
                  <li
                    key={n.id}
                    className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 text-sm"
                  >
                    <div>
                      <p className="font-medium text-foreground">
                        {isNativeAsset(n.asset)
                          ? formatEth(BigInt(n.amountWei))
                          : formatUnits(BigInt(n.amountWei), 18)}{" "}
                        {assetLabel(n.asset)}
                      </p>
                      <p className="mt-0.5 text-xs text-mute">
                        {n.leafIndex != null
                          ? "In vault · ready to move"
                          : "Confirming on chain…"}
                      </p>
                    </div>
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
                  </li>
                ))}
              </ul>
            </div>
          )}

          {isOwner && (
            <div className="rounded-xl border border-amber-500/30 bg-panel p-5">
              <StatusPill tone="warn">Owner · testnet</StatusPill>
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
                className="mt-4 inline-flex min-h-11 w-full items-center justify-center rounded-xl border border-amber-500/50 px-4 text-sm font-medium text-foreground hover:border-amber-500 disabled:opacity-50 sm:w-auto"
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

        <aside className="space-y-4 lg:col-span-5">
          <div className="rounded-xl border border-line bg-panel p-5">
            <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-mute">
              Wallet · {symbol}
            </p>
            <p className="mt-2 font-display text-3xl text-foreground">
              {isConnected
                ? walletBalance !== undefined
                  ? selectedToken
                    ? formatUnits(walletBalance, decimals)
                    : formatEth(walletBalance)
                  : "…"
                : "—"}
            </p>
          </div>

          <div className="rounded-xl border border-line bg-panel p-5">
            <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-mute">
              Your vault (this browser)
            </p>
            {!hasActiveShield ? (
              <>
                <p className="mt-2 font-display text-2xl text-mute">None</p>
                <p className="mt-1 text-xs text-mute">
                  No active notes with a local secret. Deposit below, or import
                  a note on Move.
                </p>
              </>
            ) : (
              <>
                <ul className="mt-2 space-y-1">
                  {assetRows.map((r) => (
                    <li
                      key={r.asset}
                      className="font-display text-xl text-foreground"
                    >
                      {isNativeAsset(r.asset)
                        ? formatEth(r.amount)
                        : formatUnits(r.amount, 18)}{" "}
                      <span className="text-base text-mute">{r.label}</span>
                    </li>
                  ))}
                </ul>
                {myShieldUsd && (
                  <p className="mt-1 text-sm text-mute">ETH ≈ {myShieldUsd}</p>
                )}
                <p className="mt-2 text-xs text-mute">
                  Use{" "}
                  <Link href="/app/move" className="text-lime hover:underline">
                    Move
                  </Link>{" "}
                  to private-send or cash out.
                </p>
              </>
            )}
            <Link
              href="/app"
              className="mt-3 inline-block text-xs text-lime hover:underline"
            >
              Portfolio →
            </Link>
          </div>

          <div className="rounded-xl border border-line bg-panel p-5">
            <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-mute">
              Pool
            </p>
            <dl className="mt-3 space-y-2 text-sm">
              <div className="flex justify-between gap-3">
                <dt className="text-mute">
                  {isNativeAsset(assetAddress) ? "ETH held" : `${symbol} held`}
                </dt>
                <dd className="font-medium text-foreground">
                  {poolSelected != null
                    ? isNativeAsset(assetAddress)
                      ? formatEth(poolSelected)
                      : formatUnits(poolSelected, 18)
                    : "…"}
                </dd>
              </div>
              {!isNativeAsset(assetAddress) && (
                <div className="flex justify-between gap-3">
                  <dt className="text-mute">ETH held</dt>
                  <dd className="font-medium text-foreground">
                    {poolEth != null ? formatEth(poolEth) : "…"}
                  </dd>
                </div>
              )}
              <div className="flex justify-between gap-3">
                <dt className="text-mute">Leaves in tree</dt>
                <dd className="font-medium text-foreground">
                  {nextIndex != null ? nextIndex.toString() : "…"}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-mute">Verifier</dt>
                <dd className="font-medium text-foreground">
                  {verifierLive ? "Live" : "Off"}
                </dd>
              </div>
            </dl>
            {currentRoot && (
              <p className="mt-3 break-all font-mono text-[10px] text-mute">
                root {currentRoot.slice(0, 18)}…
              </p>
            )}
            <a
              href={EXPLORER_ADDRESS(SHIELD_POOL_ADDRESS!)}
              target="_blank"
              rel="noreferrer"
              className="mt-3 inline-block text-xs text-lime hover:underline"
            >
              Pool on explorer →
            </a>
          </div>

          {/* Explainer — side, not above the form */}
          <div className="rounded-xl border border-line bg-panel p-5 text-sm">
            <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-lime">
              What is shield?
            </p>
            <p className="mt-2 leading-relaxed text-mute">
              Deposit into Gloam’s vault. Your open wallet balance drops; the
              pool holds the asset. This browser keeps your note so you can
              private-send or cash out later.
            </p>
            <ol className="mt-3 space-y-1.5 text-mute">
              <li>
                <span className="text-lime">1</span> Wallet goes down
              </li>
              <li>
                <span className="text-lime">2</span> Vault goes up
              </li>
              <li>
                <span className="text-lime">3</span>{" "}
                <Link href="/app/move" className="text-lime hover:underline">
                  Move
                </Link>{" "}
                to send or cash out
              </li>
            </ol>
          </div>

          <a
            href={FAUCET_URL}
            target="_blank"
            rel="noreferrer"
            className="block rounded-xl border border-line bg-panel p-5 transition-colors hover:border-lime/40"
          >
            <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-lime">
              Need assets?
            </p>
            <p className="mt-2 text-sm text-mute">Faucet for ETH + stocks →</p>
          </a>
        </aside>
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
