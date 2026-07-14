"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { formatUsd } from "@/lib/markets";
import {
  NATIVE_ASSET,
  SHIELD_GAS_LIMIT,
  SHIELD_POOL_ADDRESS,
  type LocalNote,
  isShieldDeployed,
  loadLocalNotes,
  makeNoteMaterial,
  saveLocalNote,
  shieldPoolAbi,
  updateLocalNote,
} from "@/lib/shield";
import { WalletMenu } from "./WalletMenu";
import { StatusPill } from "./StatusPill";
import { SuccessModal } from "./SuccessModal";

export function ShieldView() {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const onProduct = chainId === PRODUCT_CHAIN_ID;
  const { ethUsd } = useEthPrice();
  const deployed = isShieldDeployed() && Boolean(SHIELD_POOL_ADDRESS);

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
  const verifierLive =
    Boolean(verifier) &&
    verifier !== "0x0000000000000000000000000000000000000000";

  const [amount, setAmount] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [showSuccess, setShowSuccess] = useState(false);
  const [pendingNote, setPendingNote] = useState<LocalNote | null>(null);
  const [notes, setNotes] = useState<LocalNote[]>([]);
  const [sentAmount, setSentAmount] = useState("");

  const refreshNotes = useCallback(() => {
    setNotes(loadLocalNotes(address));
  }, [address]);

  useEffect(() => {
    refreshNotes();
  }, [refreshNotes]);

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
    refreshNotes();
    void refetchBal();
    void refetchPool();
    setShowSuccess(true);
  }, [
    isSuccess,
    hash,
    receipt,
    pendingNote,
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
    // leave dust for gas
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
    };

    setFormError(null);
    reset();
    setShowSuccess(false);
    handledHash.current = null;
    setPendingNote(note);
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

  const maxEth = bal ? formatEth(bal.value, 6) : "0";
  const amtNum = Number(amount);
  const usdHint =
    ethUsd && Number.isFinite(amtNum) && amtNum > 0
      ? formatUsd(amtNum * ethUsd)
      : null;

  const myNotes = useMemo(
    () => notes.filter((n) => n.txHash || n.id === pendingNote?.id),
    [notes, pendingNote]
  );

  const confirmedNotes = myNotes.filter((n) => n.txHash);
  const myShieldedWei = confirmedNotes.reduce(
    (s, n) => s + BigInt(n.amountWei || "0"),
    BigInt(0)
  );

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
        <div className="lg:col-span-7">
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
                  Shield ETH
                </p>
              </div>
            </div>

            <form onSubmit={onSubmit} className="space-y-5 p-5 sm:p-6">
              <p className="text-sm leading-relaxed text-mute">
                Deposit testnet ETH into the pool. A commitment is written on
                chain. Private exit is not open yet — only deposit works today.
              </p>

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
                      // leave ~0.00005 ETH for gas
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
                    className="min-h-12 flex-1 bg-transparent px-4 text-lg text-foreground outline-none placeholder:text-mute focus-visible:ring-0"
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
                  Honest limits
                </p>
                <ul className="mt-2 space-y-1.5">
                  <li>Deposit is real and on-chain.</li>
                  <li>
                    Private transfer / unshield stay closed until a verifier
                    ships.
                  </li>
                  <li>
                    Your note secret is saved in this browser only — clear data
                    and you lose the local record (not the on-chain leaf).
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
                  {isPending
                    ? "Confirm in wallet…"
                    : confirming
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

          {confirmedNotes.length > 0 && (
            <div className="mt-4 overflow-hidden rounded-xl border border-line bg-panel">
              <div className="border-b border-line px-5 py-3">
                <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-mute">
                  Your notes · this browser
                </p>
              </div>
              <ul className="divide-y divide-line">
                {confirmedNotes.slice(0, 8).map((n) => (
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
          </div>

          <div className="rounded-xl border border-line bg-panel p-5">
            <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-mute">
              Pool (on-chain)
            </p>
            <dl className="mt-3 space-y-2 text-sm">
              <div className="flex justify-between gap-3">
                <dt className="text-mute">ETH held</dt>
                <dd className="font-medium text-foreground">
                  {poolEth != null ? formatEth(poolEth) : "…"}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-mute">Notes</dt>
                <dd className="font-medium text-foreground">
                  {nextIndex != null ? nextIndex.toString() : "…"}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-mute">Your notes</dt>
                <dd className="font-medium text-foreground">
                  {confirmedNotes.length}
                  {myShieldedWei > BigInt(0)
                    ? ` · ${formatEth(myShieldedWei)} ETH`
                    : ""}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-mute">Verifier</dt>
                <dd className="font-medium text-foreground">
                  {verifier == null
                    ? "…"
                    : verifierLive
                      ? shortAddress(verifier, 4)
                      : "Not set"}
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
              Next
            </p>
            <p className="mt-2 text-foreground">
              Private move stays closed until proofs land.
            </p>
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
        title="Shielded"
        body={
          <>
            <p>
              <span className="font-medium text-foreground">
                {sentAmount || "—"} ETH
              </span>{" "}
              is in the pool.
            </p>
            <p className="mt-2">
              Note saved in this browser. Private exit is not available yet.
            </p>
          </>
        }
        primaryHref={hash ? EXPLORER_TX(hash) : undefined}
        primaryLabel="View on explorer"
        secondaryLabel="Shield more"
        onClose={() => {
          setShowSuccess(false);
          setAmount("");
        }}
      />
    </>
  );
}
