"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  useAccount,
  useChainId,
  usePublicClient,
  useWaitForTransactionReceipt,
  useWriteContract,
} from "wagmi";
import { formatEther, formatUnits, type Hex } from "viem";
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
import { syncShieldTree } from "@/lib/treeSync";
import { buildPoseidonUnshieldWitness } from "@/lib/proverPoseidon";
import { buildTransferWitness } from "@/lib/proverTransfer";
import {
  fieldToBytes32,
  proveTransferInBrowser,
  proveUnshieldInBrowser,
} from "@/lib/proveClient";
import { noteNullifierPoseidon } from "@/lib/notePoseidon";
import { fieldToHex, hexToField } from "@/lib/poseidon";
import type { PoseidonMerklePath } from "@/lib/merklePoseidon";
import {
  buildNotePackage,
  decodeNotePackage,
  encodeNotePackage,
  encodeNotePackageEncrypted,
  formatAmountEth,
  isEncryptedPackage,
} from "@/lib/notePackage";
import { EXPLORER_TX, PRODUCT_CHAIN_ID as CHAIN, formatEth } from "@/lib/chain";
import { safeParseEther } from "@/lib/amount";
import { StatusPill } from "./StatusPill";
import { SuccessModal } from "./SuccessModal";
import { DevKeysBanner } from "./DevKeysBanner";
import { PaymentTicketShare } from "./PaymentTicketShare";

type Mode = "send" | "cashout" | "receive";

/**
 * Move = vault payment tickets (not address transfer) + cash out.
 * Private pay never asks for a recipient 0x address.
 */
export function MoveView() {
  const shieldLive = isShieldDeployed();
  const poseidonMode = HASH_SCHEME === "poseidon";
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const onProduct = chainId === CHAIN;
  const publicClient = usePublicClient({ chainId: CHAIN });
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
  const [shareAmountLabel, setShareAmountLabel] = useState<string | null>(null);
  const [sendPassphrase, setSendPassphrase] = useState("");
  const [importText, setImportText] = useState("");
  const [importPassphrase, setImportPassphrase] = useState("");
  const [importOk, setImportOk] = useState<string | null>(null);
  const [showSuccess, setShowSuccess] = useState(false);
  const [successTitle, setSuccessTitle] = useState("Done");
  const [busy, setBusy] = useState(false);
  const [claimPreview, setClaimPreview] = useState<string | null>(null);

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
  /** Change only — never store the payment note on the sender */
  const pendingChange = useRef<LocalNote | null>(null);
  const pendingShare = useRef<{ blob: string; amountLabel: string } | null>(
    null
  );

  // Confirm path: spend note, keep change for sender, publish share only after success
  useEffect(() => {
    if (!isSuccess || !hash) return;
    if (handledHash.current === hash) return;
    handledHash.current = hash;

    void (async () => {
      if (spentNoteId.current) {
        updateLocalNote(spentNoteId.current, { status: "recovered" });
        spentNoteId.current = null;
      }

      // Resolve leaf index from chain tree (safe if others inserted mid-flight)
      let changeLeaf: number | undefined;
      if (pendingChange.current && publicClient) {
        try {
          const tree = await syncShieldTree(publicClient);
          const idx = tree?.indexByCommitment.get(
            pendingChange.current.commitment.toLowerCase()
          );
          if (idx != null) changeLeaf = idx;
        } catch {
          /* leafIndex optional — path resolved on next sync */
        }
      }

      if (pendingChange.current) {
        saveLocalNote({
          ...pendingChange.current,
          txHash: hash,
          leafIndex: changeLeaf,
        });
        pendingChange.current = null;
      }

      // Payment note is NOT saved here — only the share package for the recipient
      if (pendingShare.current) {
        setShareBlob(pendingShare.current.blob);
        setShareAmountLabel(pendingShare.current.amountLabel);
        pendingShare.current = null;
      }

      refreshNotes();
      void refreshTree();
      setShowSuccess(true);
      setBusy(false);
      setStatus(null);
    })();
  }, [isSuccess, hash, refreshNotes, refreshTree, publicClient]);

  // Wallet reject / tx fail: drop ephemeral payment secrets
  useEffect(() => {
    if (!writeError) return;
    setBusy(false);
    setStatus(null);
    pendingChange.current = null;
    pendingShare.current = null;
    spentNoteId.current = null;
    setShareBlob(null);
  }, [writeError]);

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

      // Change stays with sender only. Payment secret goes solely into share package.
      let changeNullifier: Hex | undefined;
      if (BigInt(w.changeNote.amountWei) > 0n) {
        try {
          const n = await noteNullifierPoseidon(
            hexToField(w.changeNote.secret),
            hexToField(w.changeNote.commitment)
          );
          changeNullifier = fieldToHex(n);
        } catch {
          /* optional for spend tracking */
        }
        pendingChange.current = {
          id: `chg-${Date.now()}`,
          chainId: CHAIN,
          pool: SHIELD_POOL_ADDRESS,
          asset: selected.asset,
          amountWei: w.changeNote.amountWei,
          commitment: w.changeNote.commitment,
          secret: w.changeNote.secret,
          nullifier: changeNullifier,
          bound: true,
          scheme: "poseidon",
          from: address,
          createdAt: Date.now(),
          status: "open",
          source: "local",
        };
      } else {
        pendingChange.current = null;
      }

      // Share package for recipient (shown only after on-chain success)
      const pack = buildNotePackage({
        pool: SHIELD_POOL_ADDRESS,
        asset: w.paymentNote.asset,
        amountWei: w.paymentNote.amountWei,
        secret: w.paymentNote.secret,
        commitment: w.paymentNote.commitment,
      });
      const share = sendPassphrase.trim()
        ? await encodeNotePackageEncrypted(pack, sendPassphrase)
        : encodeNotePackage(pack);
      pendingShare.current = {
        blob: share,
        amountLabel: formatAmountEth(w.paymentNote.amountWei),
      };
      setShareBlob(null);

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
      pendingChange.current = null;
      pendingShare.current = null;
    }
  }

  async function onImportNote() {
    setError(null);
    setImportOk(null);
    try {
      if (!SHIELD_POOL_ADDRESS || !address) {
        throw new Error("Connect wallet first.");
      }
      const pack = await decodeNotePackage(
        importText,
        importPassphrase || undefined
      );
      if (
        pack.pool &&
        pack.pool.toLowerCase() !== SHIELD_POOL_ADDRESS.toLowerCase()
      ) {
        throw new Error("This payment is for a different vault.");
      }

      const asset = pack.asset;
      const secret = pack.secret;
      const commitment = pack.commitment;
      let nullifier: Hex | undefined;
      try {
        const n = await noteNullifierPoseidon(
          hexToField(secret),
          hexToField(commitment)
        );
        nullifier = fieldToHex(n);
      } catch {
        /* optional */
      }

      await refreshTree();
      const idx = leafIndexForCommitment(commitment);

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
      };
      saveLocalNote(note);
      refreshNotes();
      setSelectedId(note.id);
      setImportText("");
      setImportPassphrase("");
      const ethLabel = formatAmountEth(pack.amountWei);
      setImportOk(
        idx != null
          ? `Got ${ethLabel} ETH in the vault — open Cash out when ready.`
          : `Got ${ethLabel} ETH. Tap Refresh on the vault tree, then Cash out.`
      );
      setMode("cashout");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Import failed");
    }
  }

  // Live preview when pasting a ticket (amount only — not a full claim)
  useEffect(() => {
    const t = importText.trim();
    if (!t || mode !== "receive") {
      setClaimPreview(null);
      return;
    }
    let cancelled = false;
    const handle = window.setTimeout(() => {
      void (async () => {
        try {
          if (isEncryptedPackage(t) && !importPassphrase.trim()) {
            if (!cancelled) {
              setClaimPreview("Locked ticket — enter the passphrase to preview.");
            }
            return;
          }
          const pack = await decodeNotePackage(
            t,
            importPassphrase || undefined
          );
          if (cancelled) return;
          setClaimPreview(
            `Looks like ${formatAmountEth(pack.amountWei)} ETH vault payment${
              isEncryptedPackage(t) ? " (unlocked)" : ""
            }.`
          );
        } catch {
          if (!cancelled) setClaimPreview(null);
        }
      })();
    }, 400);
    return () => {
      cancelled = true;
      window.clearTimeout(handle);
    };
  }, [importText, importPassphrase, mode]);

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
              <DevKeysBanner />
              <p className="text-sm leading-relaxed text-mute">
                This is <strong className="text-foreground">not</strong> a
                normal crypto send. No recipient address. You mint a{" "}
                <strong className="text-foreground">payment ticket</strong>{" "}
                inside the vault; they claim it.{" "}
                <strong className="text-foreground">Cash out</strong> exits to
                your open wallet (public edge).
              </p>
              <p className="rounded-lg border border-line bg-background px-3 py-2 text-xs text-mute">
                Need a classic on-chain transfer to a{" "}
                <span className="font-mono">0x</span> address? Use{" "}
                <Link href="/app/send" className="text-lime hover:underline">
                  Send
                </Link>{" "}
                (public book).
              </p>

              {/* Mode tabs — ticket language, not address send */}
              <div className="flex gap-1 rounded-lg border border-line p-1">
                {(
                  [
                    ["send", "Pay ticket"],
                    ["receive", "Claim"],
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
                      setClaimPreview(null);
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
                      <div className="rounded-lg border border-lime/20 bg-lime/5 px-3 py-2 text-xs text-mute">
                        <strong className="text-foreground">How it works:</strong>{" "}
                        split your vault note → payment ticket + your change.
                        No <span className="font-mono">0x</span> address field.
                        Chain sees a transfer proof, not who paid whom.
                      </div>
                      <div>
                        <label
                          htmlFor="pay-amt"
                          className="text-sm font-medium text-foreground"
                        >
                          Ticket amount (stays in vault)
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
                          Leftover stays with you as vault change.
                        </p>
                      </div>
                      <div>
                        <label
                          htmlFor="send-pass"
                          className="text-sm font-medium text-foreground"
                        >
                          Lock ticket with passphrase{" "}
                          <span className="font-normal text-mute">(optional)</span>
                        </label>
                        <input
                          id="send-pass"
                          type="text"
                          autoComplete="off"
                          value={sendPassphrase}
                          onChange={(e) => setSendPassphrase(e.target.value)}
                          placeholder="e.g. coffee-tuesday"
                          className="mt-2 min-h-11 w-full rounded-md border border-line bg-transparent px-4 text-sm outline-none focus:border-lime"
                        />
                        <p className="mt-1 text-xs text-mute">
                          Share the phrase on a different channel (call/chat).
                          Blank = plain ticket (still a bearer secret).
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
                          : "Create payment ticket"}
                      </button>
                      {shareBlob && (
                        <PaymentTicketShare
                          code={shareBlob}
                          amountLabel={shareAmountLabel}
                          locked={Boolean(sendPassphrase.trim())}
                        />
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
                    first, or open <strong className="text-foreground">Claim</strong>{" "}
                    to paste a payment ticket you received.
                  </p>
                </div>
              ) : null}

              {mode === "receive" && (
                <div className="rounded-xl border border-line bg-background p-4">
                  <p className="text-sm font-medium text-foreground">
                    Claim a payment ticket
                  </p>
                  <p className="mt-1 text-xs text-mute">
                    Paste or scan-share the ticket (
                    <span className="font-mono">gloam1…</span> /{" "}
                    <span className="font-mono">gloam1e…</span>). No sender
                    address needed — the ticket is the payment.
                  </p>
                  <textarea
                    value={importText}
                    onChange={(e) => setImportText(e.target.value)}
                    rows={4}
                    className="mt-3 w-full rounded-md border border-line bg-transparent p-3 font-mono text-[11px] outline-none focus:border-lime"
                    placeholder="gloam1.… or gloam1e.… locked ticket"
                  />
                  {claimPreview && (
                    <p className="mt-2 text-xs text-lime">{claimPreview}</p>
                  )}
                  {(isEncryptedPackage(importText) ||
                    importText.trim().startsWith("gloam1e.")) && (
                    <div className="mt-3">
                      <label
                        htmlFor="recv-pass"
                        className="text-sm font-medium text-foreground"
                      >
                        Passphrase
                      </label>
                      <input
                        id="recv-pass"
                        type="text"
                        autoComplete="off"
                        value={importPassphrase}
                        onChange={(e) => setImportPassphrase(e.target.value)}
                        placeholder="From the sender (other channel)"
                        className="mt-2 min-h-11 w-full rounded-md border border-line bg-transparent px-4 text-sm outline-none focus:border-lime"
                      />
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => void onImportNote()}
                    disabled={!importText.trim() || !isConnected}
                    className="mt-3 inline-flex min-h-11 w-full items-center justify-center rounded-xl bg-lime text-sm font-semibold text-black disabled:opacity-50"
                  >
                    Claim into my vault
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
              Ticket vs traditional send
            </p>
            <ul className="mt-3 space-y-2 text-mute">
              <li>
                <strong className="text-foreground">Traditional</strong> —{" "}
                <Link href="/app/send" className="text-lime hover:underline">
                  Send
                </Link>
                : you type a <span className="font-mono">0x</span> address;
                amount is public.
              </li>
              <li>
                <strong className="text-foreground">Gloam ticket</strong> — no
                address. Bearer code (optional lock). Chain sees a proof, not
                “Alice → Bob 0.01”.
              </li>
              <li>
                <strong className="text-foreground">Cash out</strong> — exit to
                open wallet is a public edge.
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
          pendingAction.current === "send" || shareBlob ? (
            <p>
              Your payment ticket is below (QR / copy / share). Hand it to the
              recipient only — it is bearer cash. Your vault change stays in
              this browser. Do not reuse a ticket you already gave away.
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
