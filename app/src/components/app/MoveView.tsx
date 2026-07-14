"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  useAccount,
  useChainId,
  useWaitForTransactionReceipt,
  useWriteContract,
} from "wagmi";
import { formatEther, formatUnits } from "viem";
import { AsciiImage } from "@/components/AsciiImage";
import { useLocalShieldNotes } from "@/hooks/useLocalShieldNotes";
import { useShieldTree } from "@/hooks/useShieldTree";
import {
  HASH_SCHEME,
  SHIELD_GAS_LIMIT,
  SHIELD_POOL_ADDRESS,
  type LocalNote,
  assetLabel,
  isNativeAsset,
  isShieldDeployed,
  saveLocalNote,
  shieldPoolAbi,
  updateLocalNote,
} from "@/lib/shield";
import { buildPoseidonUnshieldWitness } from "@/lib/proverPoseidon";
import { buildTransferWitness } from "@/lib/proverTransfer";
import {
  fieldToBytes32,
  proveTransferInBrowser,
  proveUnshieldInBrowser,
} from "@/lib/proveClient";
import { noteNullifierPoseidon } from "@/lib/notePoseidon";
import { hexToField } from "@/lib/poseidon";
import type { PoseidonMerklePath } from "@/lib/merklePoseidon";
import { EXPLORER_TX, PRODUCT_CHAIN_ID as CHAIN, formatEth } from "@/lib/chain";
import { safeParseEther } from "@/lib/amount";
import { StatusPill } from "./StatusPill";
import { SuccessModal } from "./SuccessModal";

type Mode = "send" | "cashout" | "receive";

/**
 * Move = private send inside the vault, or cash out (unshield).
 * Plain labels for normal users.
 */
export function MoveView() {
  const shieldLive = isShieldDeployed();
  const poseidonMode = HASH_SCHEME === "poseidon";
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const onProduct = chainId === CHAIN;
  const { open, refresh: refreshNotes } = useLocalShieldNotes(address);
  const {
    loading: treeLoading,
    error: treeError,
    matchesChain,
    leafCount,
    pathForLeaf,
    leafIndexForCommitment,
    refresh: refreshTree,
  } = useShieldTree();

  const [mode, setMode] = useState<Mode>("send");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [sendAmount, setSendAmount] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [shareBlob, setShareBlob] = useState<string | null>(null);
  const [importText, setImportText] = useState("");
  const [importOk, setImportOk] = useState<string | null>(null);
  const [showSuccess, setShowSuccess] = useState(false);
  const [successTitle, setSuccessTitle] = useState("Done");
  const [busy, setBusy] = useState(false);

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

  const handledHash = useRef<string | null>(null);
  const pendingAction = useRef<"send" | "cashout" | null>(null);
  const spentNoteId = useRef<string | null>(null);
  const pendingChange = useRef<LocalNote | null>(null);
  const pendingPayment = useRef<LocalNote | null>(null);
  const leafBase = useRef<number>(0);

  useEffect(() => {
    if (!isSuccess || !hash) return;
    if (handledHash.current === hash) return;
    handledHash.current = hash;

    if (spentNoteId.current) {
      updateLocalNote(spentNoteId.current, { status: "recovered" });
    }
    if (pendingPayment.current) {
      saveLocalNote({
        ...pendingPayment.current,
        txHash: hash,
        leafIndex: leafBase.current,
      });
      pendingPayment.current = null;
    }
    if (pendingChange.current) {
      saveLocalNote({
        ...pendingChange.current,
        txHash: hash,
        leafIndex: leafBase.current + 1,
      });
      pendingChange.current = null;
    }
    refreshNotes();
    void refreshTree();
    setShowSuccess(true);
    setBusy(false);
  }, [isSuccess, hash, refreshNotes, refreshTree]);

  // Resolve leafIndex from tree when import left it missing
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

  const selected =
    notes.find((n) => n.id === selectedId) ?? notes[0] ?? null;

  const maxEth = selected
    ? formatEther(BigInt(selected.amountWei))
    : "0";

  async function onCashOut() {
    if (!selected || !address || !SHIELD_POOL_ADDRESS || !poseidonMode) return;
    setError(null);
    setBusy(true);
    reset();
    handledHash.current = null;
    pendingAction.current = "cashout";
    spentNoteId.current = selected.id;
    pendingChange.current = null;

    try {
      const path = await pathForLeaf(selected.leafIndex!);
      if (!path) throw new Error("Could not build path — resync the tree.");
      setStatus("Building proof… this can take 10–30 seconds.");
      const w = await buildPoseidonUnshieldWitness({
        secretHex: selected.secret,
        amount: BigInt(selected.amountWei),
        asset: selected.asset,
        to: address,
        path: path as PoseidonMerklePath,
      });
      if (!w.checks.commitmentMatches) {
        throw new Error(w.blocker ?? "Note does not match");
      }
      const { proofBytes } = await proveUnshieldInBrowser(w.circomInput);
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
      setSuccessTitle("Cashed out");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Cash out failed");
      setBusy(false);
      setStatus(null);
    }
  }

  async function onPrivateSend() {
    if (!selected || !address || !SHIELD_POOL_ADDRESS || !poseidonMode) return;
    setError(null);
    setShareBlob(null);
    setBusy(true);
    reset();
    handledHash.current = null;
    pendingAction.current = "send";
    spentNoteId.current = selected.id;

    try {
      const amountPay = safeParseEther(sendAmount);
      if (amountPay === null || amountPay <= 0n) {
        throw new Error("Enter a valid amount to send.");
      }
      if (amountPay > BigInt(selected.amountWei)) {
        throw new Error("Amount is larger than this note.");
      }

      const path = await pathForLeaf(selected.leafIndex!);
      if (!path) throw new Error("Could not build path — resync the tree.");

      setStatus("Building private send proof…");
      const w = await buildTransferWitness({
        secretHex: selected.secret,
        amountIn: BigInt(selected.amountWei),
        amountPay,
        asset: selected.asset,
        path: path as PoseidonMerklePath,
      });
      if (w.blocker) throw new Error(w.blocker);

      const { proofBytes } = await proveTransferInBrowser(w.circomInput);

      leafBase.current = leafCount;

      // Payment note (recipient package) + change for sender
      pendingPayment.current = {
        id: `pay-${Date.now()}`,
        chainId: CHAIN,
        pool: SHIELD_POOL_ADDRESS,
        asset: selected.asset,
        amountWei: w.paymentNote.amountWei,
        commitment: w.paymentNote.commitment,
        secret: w.paymentNote.secret,
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
              id: `chg-${Date.now()}`,
              chainId: CHAIN,
              pool: SHIELD_POOL_ADDRESS,
              asset: selected.asset,
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

      // Share package for recipient (they import it)
      const pack = {
        v: 1,
        type: "gloam-private-note",
        scheme: "poseidon",
        pool: SHIELD_POOL_ADDRESS,
        asset: w.paymentNote.asset,
        amountWei: w.paymentNote.amountWei,
        secret: w.paymentNote.secret,
        commitment: w.paymentNote.commitment,
        message: "Import this in Gloam → Move → Import note. Keep secret.",
      };
      setShareBlob(JSON.stringify(pack, null, 2));

      setStatus("Confirm private send in your wallet…");
      writeContract({
        address: SHIELD_POOL_ADDRESS,
        abi: shieldPoolAbi,
        functionName: "transfer",
        args: [
          proofBytes,
          fieldToBytes32(w.publicInputs.root),
          fieldToBytes32(w.publicInputs.nullifier),
          [
            fieldToBytes32(w.publicInputs.newCommitment0),
            fieldToBytes32(w.publicInputs.newCommitment1),
          ],
        ],
        gas: SHIELD_GAS_LIMIT,
        chainId: CHAIN,
      });
      setSuccessTitle("Private send submitted");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Private send failed");
      setBusy(false);
      setStatus(null);
    }
  }

  async function onImportNote() {
    setError(null);
    setImportOk(null);
    try {
      const raw = importText.trim();
      const pack = JSON.parse(raw) as {
        type?: string;
        secret?: string;
        commitment?: string;
        amountWei?: string;
        asset?: string;
        pool?: string;
        scheme?: string;
      };
      if (pack.type !== "gloam-private-note" || !pack.secret || !pack.amountWei) {
        throw new Error("Paste the full payment package from the sender.");
      }
      if (!SHIELD_POOL_ADDRESS || !address) {
        throw new Error("Connect wallet first.");
      }
      if (
        pack.pool &&
        pack.pool.toLowerCase() !== SHIELD_POOL_ADDRESS.toLowerCase()
      ) {
        throw new Error("This note is for a different vault address.");
      }

      const asset = (pack.asset as `0x${string}`) ||
        ("0x0000000000000000000000000000000000000000" as const);
      const secret = pack.secret as `0x${string}`;
      const commitment = (pack.commitment || "0x") as `0x${string}`;
      let nullifier: `0x${string}` | undefined;
      try {
        const n = await noteNullifierPoseidon(
          hexToField(secret),
          hexToField(commitment)
        );
        nullifier =
          `0x${n.toString(16).padStart(64, "0")}` as `0x${string}`;
      } catch {
        /* optional */
      }

      // Prefer live tree index; fall back after refresh
      await refreshTree();
      const idx =
        leafIndexForCommitment(commitment) ??
        leafIndexForCommitment(commitment.toLowerCase());

      const note: LocalNote = {
        id: `imp-${Date.now()}`,
        chainId: CHAIN,
        pool: SHIELD_POOL_ADDRESS,
        asset,
        amountWei: pack.amountWei,
        commitment,
        secret,
        nullifier,
        bound: true,
        scheme: "poseidon",
        from: address,
        createdAt: Date.now(),
        status: "open",
        source: "local",
        leafIndex: idx ?? undefined,
        // No txHash — still spendable (import)
      };
      saveLocalNote(note);
      refreshNotes();
      setSelectedId(note.id);
      setImportText("");
      const ethLabel = formatEth(BigInt(pack.amountWei));
      setImportOk(
        idx != null
          ? `Imported ${ethLabel} ETH — ready under your vault notes. Cash out or send.`
          : `Imported ${ethLabel} ETH. Tap Refresh on the vault tree if the note doesn’t list yet, then cash out.`
      );
      setMode("cashout");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Import failed");
    }
  }

  const working = busy || isPending || confirming;

  return (
    <>
      <div className="grid gap-6 lg:grid-cols-12">
        <div className="space-y-4 lg:col-span-7">
          <div className="overflow-hidden rounded-xl border border-line bg-panel">
            <div className="relative h-36 border-b border-line sm:h-40">
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
                  {poseidonMode ? "Vault actions" : "Not on Poseidon pool"}
                </StatusPill>
                <p className="mt-2 font-display text-2xl text-foreground">
                  Move
                </p>
              </div>
            </div>

            <div className="space-y-5 p-5 sm:p-6">
              <p className="text-sm leading-relaxed text-mute">
                Money stays in the Gloam vault.{" "}
                <strong className="text-foreground">Private send</strong> creates
                a payment ticket for someone else.{" "}
                <strong className="text-foreground">Cash out</strong> returns
                funds to your open wallet (that step is public).
              </p>

              {/* Mode tabs */}
              <div className="flex gap-1 rounded-lg border border-line p-1">
                {(
                  [
                    ["send", "Send"],
                    ["receive", "Receive"],
                    ["cashout", "Cash out"],
                  ] as const
                ).map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => {
                      setMode(id);
                      setError(null);
                      setStatus(null);
                      setImportOk(null);
                    }}
                    className={`min-h-10 flex-1 rounded-md text-sm font-medium ${
                      mode === id
                        ? "bg-lime text-black"
                        : "text-mute hover:text-foreground"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {/* Tree status */}
              <div className="rounded-xl border border-line bg-background px-4 py-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-mute">
                    Vault tree
                  </p>
                  <button
                    type="button"
                    onClick={() => void refreshTree()}
                    className="text-xs text-lime hover:underline"
                  >
                    {treeLoading ? "Syncing…" : "Refresh"}
                  </button>
                </div>
                <p className="mt-2 text-mute">
                  Notes in vault:{" "}
                  <span className="text-foreground">
                    {treeLoading ? "…" : leafCount}
                  </span>
                  {" · "}
                  Match:{" "}
                  <span className="text-foreground">
                    {matchesChain == null
                      ? "…"
                      : matchesChain
                        ? "Yes"
                        : "No"}
                  </span>
                </p>
                {treeError && (
                  <p className="mt-1 text-xs text-red-500">{treeError}</p>
                )}
              </div>

              {!poseidonMode && (
                <p className="text-sm text-amber-600 dark:text-amber-500">
                  App is not on the Poseidon vault. Check env defaults.
                </p>
              )}

              {importOk && (
                <div className="rounded-xl border border-lime/30 bg-lime/5 px-4 py-3 text-sm text-foreground">
                  {importOk}
                </div>
              )}

              {shieldLive && notes.length > 0 && mode !== "receive" ? (
                <>
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      Your vault notes
                    </p>
                    <ul className="mt-2 divide-y divide-line rounded-xl border border-line">
                      {notes.map((n) => (
                        <li key={n.id}>
                          <button
                            type="button"
                            onClick={() => setSelectedId(n.id)}
                            className={`flex w-full items-center justify-between px-4 py-3 text-left text-sm ${
                              selected?.id === n.id
                                ? "bg-lime/10 text-foreground"
                                : "text-mute hover:text-foreground"
                            }`}
                          >
                            <span>
                              {isNativeAsset(n.asset)
                                ? formatEth(BigInt(n.amountWei))
                                : formatUnits(BigInt(n.amountWei), 18)}{" "}
                              {assetLabel(n.asset)}
                              {!n.txHash && (
                                <span className="ml-2 text-[10px] text-lime">
                                  imported
                                </span>
                              )}
                            </span>
                            <span className="font-mono text-[10px]">
                              #{n.leafIndex ?? "?"}
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>

                  {mode === "send" && (
                    <div className="space-y-3">
                      <div>
                        <label
                          htmlFor="pay-amt"
                          className="text-sm font-medium text-foreground"
                        >
                          Amount to send (stays in vault)
                        </label>
                        <div className="mt-2 flex overflow-hidden rounded-md border border-line focus-within:border-lime">
                          <input
                            id="pay-amt"
                            inputMode="decimal"
                            value={sendAmount}
                            onChange={(e) =>
                              setSendAmount(
                                e.target.value.replace(/[^0-9.]/g, "")
                              )
                            }
                            placeholder="0.0"
                            className="min-h-12 flex-1 bg-transparent px-4 text-lg outline-none"
                          />
                          <button
                            type="button"
                            className="border-l border-line px-3 text-xs text-lime"
                            onClick={() => setSendAmount(maxEth)}
                          >
                            Max
                          </button>
                        </div>
                        <p className="mt-1 text-xs text-mute">
                          Rest of the note stays with you as change.
                        </p>
                      </div>
                      <button
                        type="button"
                        disabled={
                          !isConnected ||
                          !onProduct ||
                          !selected ||
                          !matchesChain ||
                          working
                        }
                        onClick={() => void onPrivateSend()}
                        className="inline-flex min-h-12 w-full items-center justify-center rounded-xl bg-lime text-sm font-semibold text-black disabled:opacity-50"
                      >
                        {working && pendingAction.current === "send"
                          ? status || "Working…"
                          : "Private send"}
                      </button>
                      {shareBlob && (
                        <div className="rounded-xl border border-lime/30 bg-lime/5 p-4">
                          <p className="text-sm font-medium text-foreground">
                            Share this with the recipient only
                          </p>
                          <p className="mt-1 text-xs text-mute">
                            They import it under Move → Import note. Anyone with
                            this text can cash out that amount.
                          </p>
                          <pre className="mt-3 max-h-40 overflow-auto rounded-lg border border-line bg-panel p-3 font-mono text-[10px] text-mute">
                            {shareBlob}
                          </pre>
                          <button
                            type="button"
                            className="mt-2 text-xs text-lime hover:underline"
                            onClick={() => {
                              void navigator.clipboard.writeText(shareBlob);
                              setStatus("Copied to clipboard.");
                            }}
                          >
                            Copy package
                          </button>
                        </div>
                      )}
                    </div>
                  )}

                  {mode === "cashout" && (
                    <div className="space-y-3">
                      <p className="text-sm text-mute">
                        Withdraw the full selected note to your connected
                        wallet. This exit is visible on the explorer.
                      </p>
                      <button
                        type="button"
                        disabled={
                          !isConnected ||
                          !onProduct ||
                          !selected ||
                          !matchesChain ||
                          working ||
                          selected?.leafIndex == null
                        }
                        onClick={() => void onCashOut()}
                        className="inline-flex min-h-12 w-full items-center justify-center rounded-xl bg-lime text-sm font-semibold text-black disabled:opacity-50"
                      >
                        {working && pendingAction.current === "cashout"
                          ? status || "Working…"
                          : "Cash out to wallet"}
                      </button>
                      {selected?.leafIndex == null && (
                        <p className="text-xs text-amber-600 dark:text-amber-500">
                          Note not linked to the vault tree yet — tap Refresh
                          above.
                        </p>
                      )}
                    </div>
                  )}
                </>
              ) : mode !== "receive" ? (
                <div className="rounded-xl border border-line bg-background p-4 text-sm text-mute">
                  <p className="text-foreground">No vault notes yet.</p>
                  <p className="mt-1">
                    <Link href="/app/shield" className="text-lime hover:underline">
                      Shield
                    </Link>{" "}
                    first, or open the <strong className="text-foreground">Receive</strong> tab
                    to paste a payment package.
                  </p>
                </div>
              ) : null}

              {mode === "receive" && (
                <div className="rounded-xl border border-line bg-background p-4">
                  <p className="text-sm font-medium text-foreground">
                    Receive a private payment
                  </p>
                  <p className="mt-1 text-xs text-mute">
                    Paste the package the sender copied for you. Keep it secret —
                    it is the key to that amount in the vault.
                  </p>
                  <textarea
                    value={importText}
                    onChange={(e) => setImportText(e.target.value)}
                    rows={5}
                    className="mt-3 w-full rounded-md border border-line bg-transparent p-3 font-mono text-[11px] outline-none focus:border-lime"
                    placeholder="Paste payment package here…"
                  />
                  <button
                    type="button"
                    onClick={() => void onImportNote()}
                    disabled={!importText.trim() || !isConnected}
                    className="mt-3 inline-flex min-h-11 w-full items-center justify-center rounded-xl bg-lime text-sm font-semibold text-black disabled:opacity-50"
                  >
                    Import payment
                  </button>
                </div>
              )}

              {(error || writeError) && (
                <p role="alert" className="text-sm text-red-500">
                  {error || writeError?.message.slice(0, 200)}
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
                    View tx
                  </a>
                </p>
              )}
            </div>
          </div>
        </div>

        <aside className="space-y-4 lg:col-span-5">
          <div className="rounded-xl border border-line bg-panel p-5 text-sm">
            <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-lime">
              Does it show on the explorer?
            </p>
            <ul className="mt-3 space-y-2 text-mute">
              <li>
                <strong className="text-foreground">Shield / cash out</strong> —
                yes, those edges are public.
              </li>
              <li>
                <strong className="text-foreground">Private send</strong> — the
                chain sees a transfer proof, not “Alice paid Bob 0.01 ETH”.
              </li>
              <li>
                Nothing is fully invisible; privacy is about what is hidden, not
                erasing the chain.
              </li>
            </ul>
          </div>
          <div className="rounded-xl border border-line bg-panel p-5 text-sm text-mute">
            <p className="text-foreground">Need a note first?</p>
            <Link
              href="/app/shield"
              className="mt-2 inline-flex min-h-10 items-center text-lime hover:underline"
            >
              Shield assets →
            </Link>
          </div>
        </aside>
      </div>

      <SuccessModal
        open={showSuccess && Boolean(hash)}
        title={successTitle}
        body={
          pendingAction.current === "send" ? (
            <p>
              Payment note is ready to share. Your change (if any) is saved in
              this browser.
            </p>
          ) : (
            <p>Funds should be back in your open wallet.</p>
          )
        }
        primaryHref={hash ? EXPLORER_TX(hash) : undefined}
        primaryLabel="View on explorer"
        secondaryLabel="Done"
        onClose={() => {
          setShowSuccess(false);
          setStatus(null);
        }}
      />
    </>
  );
}
