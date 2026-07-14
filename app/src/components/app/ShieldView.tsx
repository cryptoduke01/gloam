"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  useAccount,
  useBalance,
  useChainId,
  useReadContracts,
  useWaitForTransactionReceipt,
  useWriteContract,
} from "wagmi";
import { decodeEventLog, formatEther, type Hex } from "viem";
import { AsciiImage } from "@/components/AsciiImage";
import {
  EXPLORER_ADDRESS,
  EXPLORER_TX,
  PRODUCT_CHAIN_ID,
  formatEth,
  shortAddress,
} from "@/lib/chain";
import { safeParseEther } from "@/lib/amount";
import { FAUCET_URL } from "@/lib/faucet";
import { useEthPrice } from "@/hooks/useLiveMarkets";
import { useLocalShieldNotes } from "@/hooks/useLocalShieldNotes";
import { formatUsd } from "@/lib/markets";
import {
  EMERGENCY_GAS_LIMIT,
  NATIVE_ASSET,
  SHIELD_GAS_LIMIT,
  SHIELD_POOL_ADDRESS,
  type LocalNote,
  isShieldDeployed,
  makeNoteMaterial,
  markAllNotesRecovered,
  saveLocalNote,
  shieldPoolAbi,
  updateLocalNote,
} from "@/lib/shield";
import { WalletMenu } from "./WalletMenu";
import { StatusPill } from "./StatusPill";
import { SuccessModal } from "./SuccessModal";

type TxKind = "shield" | "pull" | null;

export function ShieldView() {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const onProduct = chainId === PRODUCT_CHAIN_ID;
  const { ethUsd } = useEthPrice();
  const deployed = isShieldDeployed() && Boolean(SHIELD_POOL_ADDRESS);
  const { open: openNotes, shieldedWei, refresh: refreshNotes } =
    useLocalShieldNotes(address);

  const { data: bal, refetch: refetchBal } = useBalance({
    address,
    chainId: PRODUCT_CHAIN_ID,
    query: { enabled: Boolean(address) },
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
  const [sentAmount, setSentAmount] = useState("");

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

  useEffect(() => {
    if (!isSuccess || !hash || !receipt) return;
    if (handledHash.current === hash) return;
    handledHash.current = hash;

    if (pendingKind === "pull") {
      markAllNotesRecovered(address);
      refreshNotes();
      void refetchBal();
      void refetchPool();
      setSuccessTitle("Pulled back");
      setSuccessBody(
        <>
          <p>ETH left the pool and returned to the owner wallet.</p>
          <p className="mt-2">
            Testnet recovery only — not the final private unshield path.
          </p>
        </>
      );
      setShowSuccess(true);
      setPendingKind(null);
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
        /* not our event */
      }
    }

    if (pendingNote) {
      updateLocalNote(pendingNote.id, {
        txHash: hash,
        leafIndex,
      });
    }
    setPendingNote(null);
    setPendingKind(null);
    refreshNotes();
    void refetchBal();
    void refetchPool();
    setSuccessTitle("Shielded");
    setSuccessBody(
      <>
        <p>
          <span className="font-medium text-foreground">
            {sentAmount || "—"} ETH
          </span>{" "}
          left your wallet and sits in the pool.
        </p>
        <p className="mt-2">
          Portfolio now shows it under Shielded. Private exit is not open yet.
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
    sentAmount,
    refreshNotes,
    refetchBal,
    refetchPool,
  ]);

  function validate(): string | null {
    if (!deployed) return "Pool not configured.";
    if (!isConnected || !onProduct) return "Connect and switch to testnet.";
    const value = safeParseEther(amount || "0");
    if (value === null) return "Invalid amount.";
    if (value <= BigInt(0)) return "Amount must be greater than zero.";
    if (bal && value > bal.value) return "Not enough testnet ETH.";
    if (bal && value > bal.value - 50_000_000_000_000n && bal.value > value) {
      return "Leave a little ETH for gas.";
    }
    return null;
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const err = validate();
    if (err) {
      setFormError(err);
      return;
    }
    if (!SHIELD_POOL_ADDRESS || !address) return;

    const value = safeParseEther(amount);
    if (value === null) {
      setFormError("Invalid amount.");
      return;
    }

    const { secret, commitment } = makeNoteMaterial();
    const note: LocalNote = {
      id: `${Date.now()}-${commitment.slice(0, 10)}`,
      chainId: PRODUCT_CHAIN_ID,
      pool: SHIELD_POOL_ADDRESS,
      asset: NATIVE_ASSET,
      amountWei: value.toString(),
      commitment,
      secret,
      from: address,
      createdAt: Date.now(),
      status: "open",
    };

    setFormError(null);
    reset();
    setShowSuccess(false);
    handledHash.current = null;
    setPendingNote(note);
    setPendingKind("shield");
    setSentAmount(amount);
    saveLocalNote(note);

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

  function onOwnerPull() {
    if (!SHIELD_POOL_ADDRESS || !address || !isOwner) return;
    if (!poolEth || poolEth <= BigInt(0)) {
      setFormError("Pool has no ETH to pull.");
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
      args: [NATIVE_ASSET, address, poolEth],
      gas: EMERGENCY_GAS_LIMIT,
      chainId: PRODUCT_CHAIN_ID,
    });
  }

  const maxEth = bal ? formatEth(bal.value, 6) : "0";
  const amtNum = Number(amount);
  const usdHint =
    ethUsd && Number.isFinite(amtNum) && amtNum > 0
      ? formatUsd(amtNum * ethUsd)
      : null;
  const myShieldUsd =
    ethUsd != null && shieldedWei > BigInt(0)
      ? formatUsd((Number(shieldedWei) / 1e18) * ethUsd)
      : null;

  if (!deployed) {
    return (
      <div className="rounded-xl border border-line bg-panel p-6">
        <StatusPill tone="warn">Not configured</StatusPill>
        <p className="mt-3 text-sm text-mute">
          Shield pool address missing. Set{" "}
          <code className="text-foreground">NEXT_PUBLIC_SHIELD_POOL_ADDRESS</code>.
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="grid gap-6 lg:grid-cols-12">
        <div className="lg:col-span-7 space-y-4">
          {/* What just happened — always plain */}
          <div className="rounded-xl border border-line bg-panel p-5 sm:p-6">
            <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-lime">
              What is this?
            </p>
            <p className="mt-2 text-sm leading-relaxed text-foreground">
              Shield means: move ETH from your wallet into Gloam’s on-chain pool
              and keep a private note of that deposit in this browser.
            </p>
            <ol className="mt-3 space-y-1.5 text-sm text-mute">
              <li>
                <span className="text-lime">1</span> Wallet ETH goes down
              </li>
              <li>
                <span className="text-lime">2</span> Pool ETH goes up
              </li>
              <li>
                <span className="text-lime">3</span> Later: private send / take
                out (not built yet)
              </li>
            </ol>
          </div>

          {shieldedWei > BigInt(0) && (
            <div className="rounded-xl border border-lime/30 bg-lime/5 p-5">
              <StatusPill tone="lime">Your money is here</StatusPill>
              <p className="mt-3 font-display text-3xl text-foreground">
                {formatEth(shieldedWei)}{" "}
                <span className="text-lg text-mute">ETH</span>
              </p>
              {myShieldUsd && (
                <p className="mt-1 text-sm text-mute">≈ {myShieldUsd}</p>
              )}
              <p className="mt-2 text-sm text-mute">
                Not spendable in Send/Trade until you exit. Portfolio lists it
                under <strong className="text-foreground">Shielded</strong>.
              </p>
            </div>
          )}

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
                <StatusPill tone="lime">Live · testnet</StatusPill>
                <p className="mt-2 font-display text-xl text-foreground sm:text-2xl">
                  Deposit ETH
                </p>
              </div>
            </div>

            <form onSubmit={onSubmit} className="space-y-5 p-5 sm:p-6">
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
                      if (!bal) return;
                      const leave = 50_000_000_000_000n;
                      const v =
                        bal.value > leave ? bal.value - leave : BigInt(0);
                      setAmount(
                        v === BigInt(0) ? "0" : formatEther(v).slice(0, 12)
                      );
                    }}
                  >
                    Max {isConnected ? maxEth : "—"}
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
                    ETH
                  </span>
                </div>
                {usdHint && (
                  <p className="mt-1.5 text-xs text-mute">≈ {usdHint}</p>
                )}
              </div>

              <div className="rounded-xl border border-line bg-background px-4 py-3 text-xs leading-relaxed text-mute">
                <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-lime">
                  Before you deposit
                </p>
                <ul className="mt-2 space-y-1.5">
                  <li>This is real testnet ETH into a real contract.</li>
                  <li>
                    Taking it out as a normal user needs Phase 2 (verifier).
                  </li>
                  <li>
                    Note secrets stay in <em>this</em> browser only.
                  </li>
                </ul>
              </div>

              {!isConnected || !onProduct ? (
                <WalletMenu />
              ) : (
                <button
                  type="submit"
                  disabled={isPending || confirming}
                  className="inline-flex min-h-12 w-full items-center justify-center rounded-xl bg-lime text-sm font-semibold text-black hover:opacity-90 disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lime"
                >
                  {isPending && pendingKind === "shield"
                    ? "Confirm in wallet…"
                    : confirming && pendingKind === "shield"
                      ? "Shielding…"
                      : "Shield"}
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
              <div className="border-b border-line px-5 py-3">
                <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-mute">
                  Your notes · this browser
                </p>
              </div>
              <ul className="divide-y divide-line">
                {openNotes.slice(0, 8).map((n) => (
                  <li
                    key={n.id}
                    className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 text-sm"
                  >
                    <div>
                      <p className="font-medium text-foreground">
                        {formatEth(BigInt(n.amountWei))} ETH
                      </p>
                      <p className="mt-0.5 font-mono text-[11px] text-mute">
                        {n.leafIndex != null
                          ? `leaf #${n.leafIndex}`
                          : "leaf —"}{" "}
                        · {shortAddress(n.commitment, 4)}
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

          {/* Owner-only testnet recovery */}
          {isOwner && (
            <div className="rounded-xl border border-amber-500/30 bg-panel p-5">
              <StatusPill tone="warn">Owner · testnet</StatusPill>
              <p className="mt-3 text-sm text-foreground">
                You deployed this pool. You can pull all pool ETH back to your
                wallet (emergency recovery — not private unshield).
              </p>
              <p className="mt-2 text-xs text-mute">
                Pool holds{" "}
                <span className="text-foreground">
                  {poolEth != null ? formatEth(poolEth) : "…"} ETH
                </span>
                . This empties deposited ETH; local notes get marked recovered.
              </p>
              <button
                type="button"
                disabled={
                  isPending ||
                  confirming ||
                  !poolEth ||
                  poolEth <= BigInt(0)
                }
                onClick={onOwnerPull}
                className="mt-4 inline-flex min-h-11 w-full items-center justify-center rounded-xl border border-amber-500/50 px-4 text-sm font-medium text-foreground hover:border-amber-500 disabled:opacity-50 sm:w-auto"
              >
                {isPending && pendingKind === "pull"
                  ? "Confirm in wallet…"
                  : confirming && pendingKind === "pull"
                    ? "Pulling…"
                    : "Pull pool ETH to owner"}
              </button>
            </div>
          )}

          {!isOwner && shieldedWei > BigInt(0) && (
            <div className="rounded-xl border border-line bg-panel p-5 text-sm text-mute">
              <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-mute">
                Getting it out
              </p>
              <p className="mt-2 text-foreground">
                User unshield is not live. Your deposit is in the shared pool
                until private exit ships (or the pool owner runs testnet
                recovery).
              </p>
            </div>
          )}
        </div>

        <aside className="space-y-4 lg:col-span-5">
          <div className="rounded-xl border border-line bg-panel p-5">
            <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-mute">
              Wallet
            </p>
            <p className="mt-2 font-display text-3xl text-foreground">
              {isConnected ? formatEth(bal?.value ?? BigInt(0)) : "—"}{" "}
              <span className="text-lg text-mute">ETH</span>
            </p>
            <p className="mt-1 text-xs text-mute">Spendable · Send / Trade</p>
          </div>

          <div className="rounded-xl border border-line bg-panel p-5">
            <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-mute">
              Your shielded
            </p>
            <p className="mt-2 font-display text-3xl text-foreground">
              {formatEth(shieldedWei)}{" "}
              <span className="text-lg text-mute">ETH</span>
            </p>
            <p className="mt-1 text-xs text-mute">
              {openNotes.length} note{openNotes.length === 1 ? "" : "s"} · this
              browser
            </p>
            <Link
              href="/app"
              className="mt-3 inline-block text-xs text-lime hover:underline"
            >
              See on portfolio →
            </Link>
          </div>

          <div className="rounded-xl border border-line bg-panel p-5">
            <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-mute">
              Pool (everyone)
            </p>
            <dl className="mt-3 space-y-2 text-sm">
              <div className="flex justify-between gap-3">
                <dt className="text-mute">ETH held</dt>
                <dd className="font-medium text-foreground">
                  {poolEth != null ? formatEth(poolEth) : "…"}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-mute">Total notes</dt>
                <dd className="font-medium text-foreground">
                  {nextIndex != null ? nextIndex.toString() : "…"}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-mute">Private exit</dt>
                <dd className="font-medium text-foreground">
                  {verifierLive ? "Verifier set" : "Closed"}
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

          <div className="rounded-xl border border-line bg-panel p-5 text-sm text-mute">
            <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-mute">
              Roadmap
            </p>
            <ul className="mt-2 space-y-1.5 text-foreground">
              <li>
                <span className="text-lime">●</span> Deposit (you are here)
              </li>
              <li>
                <span className="text-mute">○</span> Private move
              </li>
              <li>
                <span className="text-mute">○</span> Private take-out
              </li>
            </ul>
            <div className="mt-3 flex flex-wrap gap-2">
              <Link
                href="/app/move"
                className="inline-flex min-h-10 items-center rounded-lg border border-line px-3 text-xs text-foreground hover:border-lime/40"
              >
                Move status
              </Link>
              <Link
                href="/docs/encryption"
                className="inline-flex min-h-10 items-center rounded-lg border border-line px-3 text-xs text-foreground hover:border-lime/40"
              >
                How it works
              </Link>
            </div>
          </div>

          <a
            href={FAUCET_URL}
            target="_blank"
            rel="noreferrer"
            className="block rounded-xl border border-line bg-panel p-5 transition-colors hover:border-lime/40"
          >
            <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-lime">
              Need ETH?
            </p>
            <p className="mt-2 text-sm text-mute">Open faucet →</p>
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
          if (pendingKind !== "pull") setAmount("");
        }}
      />
    </>
  );
}
