"use client";

import { useMemo, useRef, useState, useEffect } from "react";
import Link from "next/link";
import {
  useAccount,
  useChainId,
  useWaitForTransactionReceipt,
  useWriteContract,
} from "wagmi";
import { formatUnits } from "viem";
import { AsciiImage } from "@/components/AsciiImage";
import { useLocalShieldNotes } from "@/hooks/useLocalShieldNotes";
import { useShieldTree } from "@/hooks/useShieldTree";
import {
  HASH_SCHEME,
  SHIELD_GAS_LIMIT,
  SHIELD_POOL_ADDRESS,
  assetLabel,
  isNativeAsset,
  isShieldDeployed,
  shieldPoolAbi,
  updateLocalNote,
} from "@/lib/shield";
import { PROOF_LAYOUT_VERSION } from "@/lib/note";
import {
  buildUnshieldWitness,
  downloadWitnessJson,
  formatWitnessSummary,
  type UnshieldWitness,
} from "@/lib/prover";
import { buildPoseidonUnshieldWitness } from "@/lib/proverPoseidon";
import {
  fieldToBytes32,
  proveUnshieldInBrowser,
} from "@/lib/proveClient";
import type { PoseidonMerklePath } from "@/lib/merklePoseidon";
import {
  EXPLORER_TX,
  PRODUCT_CHAIN_ID,
  formatEth,
  shortAddress,
} from "@/lib/chain";
import { StatusPill } from "./StatusPill";
import { SuccessModal } from "./SuccessModal";

/** Private unshield / move prep + Poseidon unshield when pool is live. */
export function MoveView() {
  const shieldLive = isShieldDeployed();
  const poseidonMode = HASH_SCHEME === "poseidon";
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const onProduct = chainId === PRODUCT_CHAIN_ID;
  const { open, refresh: refreshNotes } = useLocalShieldNotes(address);
  const {
    loading: treeLoading,
    error: treeError,
    matchesChain,
    leafCount,
    root,
    pathForLeaf,
    refresh: refreshTree,
    scheme,
  } = useShieldTree();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [witnessLog, setWitnessLog] = useState<string | null>(null);
  const [lastWitness, setLastWitness] = useState<UnshieldWitness | null>(null);
  const [proving, setProving] = useState(false);
  const [proveError, setProveError] = useState<string | null>(null);
  const [showSuccess, setShowSuccess] = useState(false);

  const {
    writeContract,
    data: hash,
    isPending,
    error: writeError,
    reset,
  } = useWriteContract();

  const { isLoading: confirming, isSuccess } = useWaitForTransactionReceipt({
    hash,
    chainId: PRODUCT_CHAIN_ID,
  });

  const handledHash = useRef<string | null>(null);
  const unshieldNoteId = useRef<string | null>(null);

  useEffect(() => {
    if (!isSuccess || !hash) return;
    if (handledHash.current === hash) return;
    handledHash.current = hash;
    if (unshieldNoteId.current) {
      updateLocalNote(unshieldNoteId.current, { status: "recovered" });
    }
    refreshNotes();
    void refreshTree();
    setShowSuccess(true);
  }, [isSuccess, hash, refreshNotes, refreshTree]);

  const boundNotes = useMemo(
    () =>
      open.filter(
        (n) =>
          n.bound &&
          n.secret &&
          n.secret !== "0x" &&
          n.leafIndex != null &&
          (!poseidonMode || n.scheme === "poseidon")
      ),
    [open, poseidonMode]
  );

  const selected =
    boundNotes.find((n) => n.id === selectedId) ?? boundNotes[0] ?? null;

  async function onBuildWitness() {
    if (!selected || !address || selected.leafIndex == null) return;
    setProveError(null);
    const path = await pathForLeaf(selected.leafIndex);
    if (!path) {
      setLastWitness(null);
      setWitnessLog(
        "No Merkle path — wait for tree sync or refresh. Leaf may be missing."
      );
      return;
    }

    if (poseidonMode) {
      const pp = path as PoseidonMerklePath;
      const w = await buildPoseidonUnshieldWitness({
        secretHex: selected.secret,
        amount: BigInt(selected.amountWei),
        asset: selected.asset,
        to: address,
        path: pp,
      });
      setLastWitness(null);
      setWitnessLog(
        [
          `scheme poseidon`,
          `root ${w.publicInputs.root.toString().slice(0, 20)}…`,
          `nullifier ${w.publicInputs.nullifier.toString().slice(0, 20)}…`,
          `amount ${w.publicInputs.amount.toString()}`,
          `commitment ok: ${w.checks.commitmentMatches}`,
          w.blocker ?? "ok",
        ].join("\n")
      );
      // stash for prove
      (window as unknown as { __gloamPoseidonWitness?: typeof w }).__gloamPoseidonWitness =
        w;
      return;
    }

    const w = buildUnshieldWitness({
      secret: selected.secret,
      amount: BigInt(selected.amountWei),
      asset: selected.asset,
      to: address,
      path: path as import("@/lib/merkle").MerklePath,
      root: (path as import("@/lib/merkle").MerklePath).root,
    });
    setLastWitness(w);
    setWitnessLog(formatWitnessSummary(w));
  }

  async function onUnshield() {
    if (!selected || !address || !SHIELD_POOL_ADDRESS || !poseidonMode) return;
    setProveError(null);
    setProving(true);
    reset();
    handledHash.current = null;

    try {
      const path = await pathForLeaf(selected.leafIndex!);
      if (!path) throw new Error("No Merkle path — resync tree.");
      const w = await buildPoseidonUnshieldWitness({
        secretHex: selected.secret,
        amount: BigInt(selected.amountWei),
        asset: selected.asset,
        to: address,
        path: path as PoseidonMerklePath,
      });
      if (!w.checks.commitmentMatches) {
        throw new Error(w.blocker ?? "Note does not open");
      }

      setWitnessLog("Proving in browser (may take ~10–30s)…");
      const { proofBytes } = await proveUnshieldInBrowser(w.circomInput);

      unshieldNoteId.current = selected.id;
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
        chainId: PRODUCT_CHAIN_ID,
      });
      setWitnessLog("Proof ready — confirm unshield in wallet…");
    } catch (e) {
      setProveError(e instanceof Error ? e.message : "Prove/unshield failed");
      setWitnessLog(null);
    } finally {
      setProving(false);
    }
  }

  const canUnshield =
    poseidonMode &&
    isConnected &&
    onProduct &&
    selected &&
    matchesChain &&
    !proving &&
    !isPending &&
    !confirming;

  return (
    <>
      <div className="grid gap-6 lg:grid-cols-12">
        <div className="space-y-4 lg:col-span-7">
          <div className="overflow-hidden rounded-xl border border-line bg-panel">
            <div className="relative h-40 border-b border-line">
              <AsciiImage
                src="/ascii/move.png"
                alt=""
                tone="plate"
                className="h-full w-full opacity-50"
                sizes="60vw"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-panel via-panel/80 to-transparent" />
              <div className="absolute bottom-4 left-5">
                <StatusPill tone={poseidonMode ? "lime" : "warn"}>
                  {poseidonMode ? "Poseidon · unshield" : "Proofs not live"}
                </StatusPill>
                <p className="mt-2 font-display text-2xl text-foreground">
                  {poseidonMode ? "Unshield" : "Private move"}
                </p>
              </div>
            </div>
            <div className="space-y-4 p-6">
              <p className="text-sm leading-relaxed text-mute">
                {poseidonMode
                  ? "Prove you own a note and exit to your wallet. Uses the real Poseidon circuit in the browser."
                  : "Live pool is still keccak Phase-1. Deploy Poseidon pool + set NEXT_PUBLIC_POSEIDON_SHIELD_POOL to unlock unshield."}
              </p>

              <div className="rounded-xl border border-line bg-background px-4 py-3 text-sm">
                <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-lime">
                  Merkle tree · {scheme ?? HASH_SCHEME}
                </p>
                <dl className="mt-2 space-y-1 text-mute">
                  <div className="flex justify-between gap-2">
                    <dt>Leaves</dt>
                    <dd className="text-foreground">
                      {treeLoading ? "…" : leafCount}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt>Matches pool</dt>
                    <dd className="text-foreground">
                      {matchesChain == null
                        ? "…"
                        : matchesChain
                          ? "Yes"
                          : "No"}
                    </dd>
                  </div>
                  {root && (
                    <div className="flex justify-between gap-2">
                      <dt>Root</dt>
                      <dd className="font-mono text-[11px] text-foreground">
                        {shortAddress(root, 6)}
                      </dd>
                    </div>
                  )}
                </dl>
                {treeError && (
                  <p className="mt-2 text-xs text-red-500">{treeError}</p>
                )}
                <button
                  type="button"
                  onClick={() => void refreshTree()}
                  disabled={treeLoading}
                  className="mt-3 inline-flex min-h-9 items-center rounded-lg border border-line px-3 text-xs text-foreground hover:border-lime/40 disabled:opacity-50"
                >
                  {treeLoading ? "Syncing…" : "Resync tree"}
                </button>
              </div>

              {shieldLive && boundNotes.length > 0 ? (
                <div className="rounded-xl border border-line bg-background px-4 py-3 text-sm">
                  <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-mute">
                    Bound notes
                  </p>
                  <ul className="mt-2 divide-y divide-line">
                    {boundNotes.map((n) => (
                      <li key={n.id}>
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedId(n.id);
                            setWitnessLog(null);
                            setProveError(null);
                          }}
                          className={`flex w-full items-center justify-between gap-2 py-2.5 text-left ${
                            selected?.id === n.id
                              ? "text-lime"
                              : "text-foreground"
                          }`}
                        >
                          <span>
                            {isNativeAsset(n.asset)
                              ? formatEth(BigInt(n.amountWei))
                              : formatUnits(BigInt(n.amountWei), 18)}{" "}
                            {assetLabel(n.asset)}
                            <span className="ml-2 font-mono text-[10px] text-mute">
                              leaf #{n.leafIndex}
                            </span>
                          </span>
                          {selected?.id === n.id && (
                            <span className="text-[10px] text-lime">
                              selected
                            </span>
                          )}
                        </button>
                      </li>
                    ))}
                  </ul>

                  <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                    <button
                      type="button"
                      onClick={() => void onBuildWitness()}
                      disabled={!selected || !matchesChain}
                      className="inline-flex min-h-11 flex-1 items-center justify-center rounded-xl border border-lime/40 px-4 text-sm font-medium text-foreground hover:bg-lime/10 disabled:opacity-50"
                    >
                      Build witness
                    </button>
                    {poseidonMode ? (
                      <button
                        type="button"
                        onClick={() => void onUnshield()}
                        disabled={!canUnshield}
                        className="inline-flex min-h-11 flex-1 items-center justify-center rounded-xl bg-lime px-4 text-sm font-semibold text-black hover:opacity-90 disabled:opacity-50"
                      >
                        {proving
                          ? "Proving…"
                          : isPending
                            ? "Confirm in wallet…"
                            : confirming
                              ? "Unshielding…"
                              : "Prove & unshield"}
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() =>
                          lastWitness && downloadWitnessJson(lastWitness)
                        }
                        disabled={
                          !lastWitness?.checks.pathValid ||
                          !lastWitness.checks.commitmentMatches
                        }
                        className="inline-flex min-h-11 flex-1 items-center justify-center rounded-xl border border-line px-4 text-sm text-foreground hover:border-lime/40 disabled:opacity-50"
                      >
                        Download JSON
                      </button>
                    )}
                  </div>

                  {witnessLog && (
                    <pre className="mt-3 overflow-x-auto rounded-lg border border-line bg-panel p-3 font-mono text-[10px] leading-relaxed text-mute">
                      {witnessLog}
                    </pre>
                  )}
                  {(proveError || writeError) && (
                    <p role="alert" className="mt-2 text-sm text-red-500">
                      {proveError || writeError?.message.slice(0, 200)}
                    </p>
                  )}
                  {hash && !isSuccess && (
                    <p className="mt-2 text-sm text-mute">
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
                  <p className="mt-2 text-xs text-mute">
                    Layout v{PROOF_LAYOUT_VERSION}
                    {poseidonMode
                      ? " · browser snark (dev keys)"
                      : " · deploy Poseidon pool to unshield"}
                  </p>
                </div>
              ) : (
                <div className="rounded-xl border border-line bg-background px-4 py-3 text-sm text-mute">
                  <p className="text-foreground">No bound notes ready.</p>
                  <p className="mt-1">
                    {poseidonMode
                      ? "Shield on this pool with Poseidon notes first."
                      : "Shield a bound note, or switch to Poseidon pool after deploy."}
                  </p>
                  {shieldLive && (
                    <Link
                      href="/app/shield"
                      className="mt-3 inline-flex min-h-10 items-center rounded-lg bg-lime px-4 text-sm font-semibold text-black"
                    >
                      Open shield
                    </Link>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        <aside className="space-y-4 lg:col-span-5">
          <div className="rounded-xl border border-line bg-panel p-5 text-sm text-mute">
            <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-mute">
              Pipeline
            </p>
            <ul className="mt-3 space-y-2 text-foreground">
              <li>
                <span className="text-lime">●</span> Poseidon circuit
              </li>
              <li>
                <span className="text-lime">●</span> Solidity verifier
              </li>
              <li>
                <span className={poseidonMode ? "text-lime" : "text-mute"}>
                  {poseidonMode ? "●" : "○"}
                </span>{" "}
                Poseidon pool {poseidonMode ? "active" : "pending deploy"}
              </li>
              <li>
                <span className={poseidonMode ? "text-lime" : "text-mute"}>
                  {poseidonMode ? "●" : "○"}
                </span>{" "}
                Unshield in app
              </li>
            </ul>
          </div>
          <div className="rounded-xl border border-line bg-panel p-5 text-sm text-mute">
            <p className="text-foreground">
              {poseidonMode
                ? "You are on the Poseidon pool. Dev ceremony keys — not mainnet."
                : "Keccak live pool remains separate. After deploy-phase2.mjs, set NEXT_PUBLIC_POSEIDON_SHIELD_POOL and NEXT_PUBLIC_HASH_SCHEME=poseidon."}
            </p>
          </div>
        </aside>
      </div>

      <SuccessModal
        open={showSuccess && Boolean(hash)}
        title="Unshielded"
        body={
          <p>
            Funds returned to your wallet. Note marked recovered in this browser.
          </p>
        }
        primaryHref={hash ? EXPLORER_TX(hash) : undefined}
        primaryLabel="View on explorer"
        secondaryLabel="Done"
        onClose={() => setShowSuccess(false)}
      />
    </>
  );
}
