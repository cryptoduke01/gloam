"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  useAccount,
  useChainId,
  useWaitForTransactionReceipt,
  useWriteContract,
} from "wagmi";
import { formatEther, formatUnits, type Hex } from "viem";
import { AsciiImage } from "@/components/AsciiImage";
import { useLocalShieldNotes } from "@/hooks/useLocalShieldNotes";
import { usePoolDeposited } from "@/hooks/usePoolDeposited";
import { useShieldTree } from "@/hooks/useShieldTree";
import { formatSealedAmount } from "@/lib/sealedRates";
import { getRhPublicClient } from "@/lib/rhClient";
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
  isPayToTagSealed,
} from "@/lib/notePackage";
import {
  getOrCreateReceiveIdentity,
  isReceiveTag,
  encryptTicketForTag,
  rotateReceiveIdentity,
  type ReceiveIdentity,
} from "@/lib/receiveTag";
import {
  loadContacts,
  upsertContact,
  type GloamContact,
} from "@/lib/contacts";
import {
  fetchPaymentMemos,
  isPayMemoLive,
  MEMO_GAS_LIMIT,
  PAY_MEMO_ADDRESS,
  PAY_MEMO_DEPLOY_BLOCK,
  payMemoAbi,
  ticketToMemoBytes,
  type ScannedMemo,
} from "@/lib/payMemo";
import { EXPLORER_TX, PRODUCT_CHAIN_ID as CHAIN, formatEth } from "@/lib/chain";
import { safeParseEther } from "@/lib/amount";
import { StatusPill } from "./StatusPill";
import { SuccessModal } from "./SuccessModal";
import { DevKeysBanner } from "./DevKeysBanner";
import { PaymentTicketShare } from "./PaymentTicketShare";
import { VaultHealth } from "./VaultHealth";

type Mode = "send" | "cashout" | "receive";
/** Direct (pay to sticky tag) vs open bearer ticket */
type PayStyle = "direct" | "bearer";

/**
 * Move = direct pay-to-tag + bearer tickets + cash out.
 * Never uses a public 0x as the private path.
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
  const [shareAmountLabel, setShareAmountLabel] = useState<string | null>(null);
  const [sendPassphrase, setSendPassphrase] = useState("");
  const [importText, setImportText] = useState("");
  const [importPassphrase, setImportPassphrase] = useState("");
  const [importOk, setImportOk] = useState<string | null>(null);
  const [showSuccess, setShowSuccess] = useState(false);
  const [successTitle, setSuccessTitle] = useState("Done");
  const [busy, setBusy] = useState(false);
  const [claimPreview, setClaimPreview] = useState<string | null>(null);
  const [payStyle, setPayStyle] = useState<PayStyle>("direct");
  const [recipientTag, setRecipientTag] = useState("");
  const [myIdentity, setMyIdentity] = useState<ReceiveIdentity | null>(null);
  const [tagCopied, setTagCopied] = useState(false);
  const [shareLocked, setShareLocked] = useState(false);
  const [inbox, setInbox] = useState<
    { memo: ScannedMemo; label: string; ticket: string }[]
  >([]);
  const [inboxStatus, setInboxStatus] = useState<string | null>(null);
  const [memoPosted, setMemoPosted] = useState(false);
  const [contacts, setContacts] = useState<GloamContact[]>([]);

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
  const pendingAction = useRef<"send" | "cashout" | "memo" | null>(null);
  const spentNoteId = useRef<string | null>(null);
  /** Change only, never store the payment note on the sender */
  const pendingChange = useRef<LocalNote | null>(null);
  const pendingShare = useRef<{ blob: string; amountLabel: string } | null>(
    null
  );
  /** After direct pay: post encrypted ticket on-chain (GloamPayMemo) */
  const pendingMemo = useRef<{
    paymentCommitment: Hex;
    ticket: string;
  } | null>(null);

  // Confirm path: transfer → optional on-chain memo → share UI
  useEffect(() => {
    if (!isSuccess || !hash) return;
    if (handledHash.current === hash) return;
    handledHash.current = hash;

    void (async () => {
      // Memo post finished
      if (pendingAction.current === "memo") {
        pendingAction.current = null;
        pendingMemo.current = null;
        setMemoPosted(true);
        if (pendingShare.current) {
          setShareBlob(pendingShare.current.blob);
          setShareAmountLabel(pendingShare.current.amountLabel);
          pendingShare.current = null;
        }
        setSuccessTitle("Private pay on-chain");
        void import("@/lib/track").then(({ track }) => {
          track("private_pay_success");
        });
        void import("@/lib/onboarding").then(({ markOnboardingStep }) => {
          markOnboardingStep("move");
          markOnboardingStep("shield");
        });
        setShowSuccess(true);
        setBusy(false);
        setStatus(null);
        return;
      }

      if (spentNoteId.current) {
        updateLocalNote(spentNoteId.current, { status: "recovered" });
        spentNoteId.current = null;
      }

      // Resolve leaf index from chain tree (safe if others inserted mid-flight)
      let changeLeaf: number | undefined;
      if (pendingChange.current) {
        try {
          const tree = await syncShieldTree(getRhPublicClient());
          const idx = tree?.indexByCommitment.get(
            pendingChange.current.commitment.toLowerCase()
          );
          if (idx != null) changeLeaf = idx;
        } catch {
          /* leafIndex optional, path resolved on next sync */
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

      refreshNotes();
      void refreshTree();

      // Direct pay + memo board live → second tx posts ciphertext on-chain
      if (
        pendingMemo.current &&
        isPayMemoLive() &&
        PAY_MEMO_ADDRESS &&
        pendingAction.current === "send"
      ) {
        const m = pendingMemo.current;
        setStatus("Posting encrypted memo on-chain (no QR required for them)…");
        pendingAction.current = "memo";
        handledHash.current = null;
        writeContract({
          address: PAY_MEMO_ADDRESS,
          abi: payMemoAbi,
          functionName: "postMemo",
          args: [m.paymentCommitment, ticketToMemoBytes(m.ticket)],
          gas: MEMO_GAS_LIMIT,
          chainId: CHAIN,
        });
        return;
      }

      pendingMemo.current = null;
      if (pendingShare.current) {
        setShareBlob(pendingShare.current.blob);
        setShareAmountLabel(pendingShare.current.amountLabel);
        pendingShare.current = null;
      }

      setShowSuccess(true);
      setBusy(false);
      setStatus(null);
    })();
  }, [isSuccess, hash, refreshNotes, refreshTree, writeContract]);

  // Wallet reject / tx fail: drop ephemeral payment secrets
  useEffect(() => {
    if (!writeError) return;
    setBusy(false);
    setStatus(null);
    pendingChange.current = null;
    pendingShare.current = null;
    pendingMemo.current = null;
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

  const cashOutAsset = selected?.asset as `0x${string}` | undefined;
  const { deposited: poolForCashOut } = usePoolDeposited(
    mode === "cashout" ? cashOutAsset : null
  );
  const cashOutAmount = selected ? BigInt(selected.amountWei) : 0n;
  const cashOutInventoryShort =
    mode === "cashout" &&
    selected != null &&
    poolForCashOut != null &&
    poolForCashOut < cashOutAmount;

  async function onCashOut() {
    if (!selected || !address || !SHIELD_POOL_ADDRESS || !poseidonMode) return;
    setError(null);

    if (poolForCashOut != null && poolForCashOut < BigInt(selected.amountWei)) {
      setError(
        `Vault inventory too low for this cash out (${formatSealedAmount(poolForCashOut)} available, need ${formatSealedAmount(BigInt(selected.amountWei))}). Someone must shield more of this asset first.`
      );
      return;
    }

    setBusy(true);
    reset();
    handledHash.current = null;
    pendingAction.current = "cashout";
    spentNoteId.current = selected.id;
    pendingChange.current = null;

    try {
      const path = await pathForLeaf(selected.leafIndex!);
      if (!path) throw new Error("Could not build path, resync the tree.");
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
      void import("@/lib/track").then(({ track }) => {
        track("unshield_success");
      });
      // cash out is intentional exit, no onboarding mark
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
      if (!path) throw new Error("Could not build path, resync the tree.");

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
      if (BigInt(w.changeNote.amountWei) > 0n) {
        pendingChange.current = {
          id: `chg-${Date.now()}`,
          chainId: CHAIN,
          pool: SHIELD_POOL_ADDRESS,
          asset: selected.asset,
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
      let share: string;
      let locked = false;
      if (payStyle === "direct") {
        const tag = recipientTag.trim();
        if (!isReceiveTag(tag)) {
          throw new Error(
            "Paste their Gloam receive tag (gloamr1…) for direct private pay."
          );
        }
        const plain = encodeNotePackage(pack);
        share = await encryptTicketForTag(plain, tag);
        locked = true; // encrypted to their key
      } else if (sendPassphrase.trim()) {
        share = await encodeNotePackageEncrypted(pack, sendPassphrase);
        locked = true;
      } else {
        share = encodeNotePackage(pack);
      }
      pendingShare.current = {
        blob: share,
        amountLabel: formatAmountEth(w.paymentNote.amountWei),
      };
      setShareLocked(locked);
      setShareBlob(null);
      setMemoPosted(false);

      // Payment leaf commitment, for on-chain memo discovery
      if (payStyle === "direct" && isPayMemoLive()) {
        pendingMemo.current = {
          paymentCommitment: fieldToBytes32(w.publicInputs.newCommitment0),
          ticket: share,
        };
      } else {
        pendingMemo.current = null;
      }

      setStatus("Confirm private pay in your wallet…");
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
      setSuccessTitle(
        payStyle === "direct" && isPayMemoLive()
          ? "Private pay, confirm memo next"
          : "Private pay submitted"
      );
      void import("@/lib/track").then(({ track }) => {
        track("private_send_submit");
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Private send failed");
      setBusy(false);
      setStatus(null);
      pendingChange.current = null;
      pendingShare.current = null;
      pendingMemo.current = null;
    }
  }

  async function scanInbox() {
    if (!isPayMemoLive()) {
      setInboxStatus(
        "On-chain memo board not deployed yet, paste ticket manually or deploy GloamPayMemo."
      );
      return;
    }
    setInboxStatus("Scanning chain for payments to your tag…");
    setInbox([]);
    try {
      const memos = await fetchPaymentMemos(
        getRhPublicClient(),
        PAY_MEMO_DEPLOY_BLOCK
      );
      const hits: { memo: ScannedMemo; label: string; ticket: string }[] = [];
      for (const m of memos) {
        try {
          const pack = await decodeNotePackage(m.ticket, undefined, {
            tryTagDecrypt: true,
          });
          hits.push({
            memo: m,
            ticket: m.ticket,
            label: `${formatAmountEth(pack.amountWei)} ETH`,
          });
        } catch {
          /* not for us */
        }
      }
      setInbox(hits);
      setInboxStatus(
        hits.length
          ? `Found ${hits.length} payment(s) for your tag.`
          : "No new on-chain payments for this tag (or memo board empty)."
      );
    } catch (e) {
      setInboxStatus(e instanceof Error ? e.message : "Inbox scan failed");
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
        importPassphrase || undefined,
        { tryTagDecrypt: true }
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
          ? `Got ${ethLabel} ETH in the vault, open Cash out when ready.`
          : `Got ${ethLabel} ETH. Tap Refresh on the vault tree, then Cash out.`
      );
      setMode("cashout");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Import failed");
    }
  }

  // Sticky receive tag for direct private pay
  useEffect(() => {
    if (mode !== "receive" && mode !== "send") return;
    void getOrCreateReceiveIdentity().then(setMyIdentity).catch(() => {
      /* crypto unavailable */
    });
    if (mode === "send") setContacts(loadContacts());
  }, [mode]);

  // Auto-scan inbox when opening Receive (if memo board live)
  useEffect(() => {
    if (mode !== "receive" || !isPayMemoLive()) return;
    void scanInbox();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- open-tab scan once per enter
  }, [mode]);

  // Live preview when pasting a ticket (amount only, not a full claim)
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
          if (isPayToTagSealed(t)) {
            const pack = await decodeNotePackage(t, undefined, {
              tryTagDecrypt: true,
            });
            if (!cancelled) {
              setClaimPreview(
                `Encrypted to your tag · ${formatAmountEth(pack.amountWei)} ETH, ready to claim.`
              );
            }
            return;
          }
          if (isEncryptedPackage(t) && !importPassphrase.trim()) {
            if (!cancelled) {
              setClaimPreview("Passphrase-locked ticket, enter the phrase to preview.");
            }
            return;
          }
          const pack = await decodeNotePackage(
            t,
            importPassphrase || undefined
          );
          if (cancelled) return;
          setClaimPreview(
            `Looks like ${formatAmountEth(pack.amountWei)} ETH vault payment.`
          );
        } catch (e) {
          if (!cancelled) {
            setClaimPreview(
              e instanceof Error && e.message.includes("someone else")
                ? e.message
                : null
            );
          }
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
                priority
                className="h-full w-full opacity-50"
                sizes="60vw"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-panel via-panel/80 to-transparent" />
              <div className="absolute bottom-4 left-5">
                <StatusPill tone={poseidonMode ? "lime" : "warn"}>
                  {poseidonMode ? "Vault actions" : "Vault not ready"}
                </StatusPill>
                <p className="mt-2 font-display text-2xl text-foreground">
                  Move
                </p>
              </div>
            </div>

            <div className="space-y-5 p-5 sm:p-6">
              <DevKeysBanner compact />
              <VaultHealth compact />
              <p className="text-sm leading-relaxed text-mute">
                <strong className="text-foreground">Private send</strong>: To
                (their tag) + Amount. Chain sees a vault transfer proof, not
                “Alice paid Bob X”. Memo is encrypted
                {isPayMemoLive() ? " (live inbox scan)" : ""}. For a public{" "}
                <span className="">0x</span> transfer use{" "}
                <Link href="/app/send" className="text-lime hover:underline">
                  Send
                </Link>
                .{" "}
                <Link
                  href="/app/trade?path=sealed"
                  className="text-lime hover:underline"
                >
                  Private trade
                </Link>{" "}
                keeps size off the book.
              </p>

              {/* Mode tabs */}
              <div className="flex gap-1 rounded-lg border border-line p-1">
                {(
                  [
                    ["send", "Send privately"],
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
                      setClaimPreview(null);
                    }}
                    className={`min-h-10 flex-1 rounded-md text-sm font-medium ${
                      mode === id
                        ? "bg-lime text-background"
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
                  <p className="text-[10px] uppercase tracking-[0.14em] text-mute">
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
                  The private vault isn’t connected right now. Try again shortly.
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
                            <span className="text-[10px]">
                              #{n.leafIndex ?? "?"}
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>

                  {mode === "send" && (
                    <div className="space-y-3">
                      {/* Same mental model as public Send: To + Amount */}
                      <div>
                        <label
                          htmlFor="recv-tag"
                          className="text-sm font-medium text-foreground"
                        >
                          To
                        </label>
                        <input
                          id="recv-tag"
                          value={recipientTag}
                          onChange={(e) => {
                            const v = e.target.value.trim();
                            setRecipientTag(v);
                            if (v.startsWith("gloamr1.")) setPayStyle("direct");
                            else if (v === "") setPayStyle("direct");
                          }}
                          placeholder="Their gloamr1… receive tag"
                          className="mt-2 min-h-12 w-full rounded-md border border-line bg-transparent px-4 text-sm outline-none focus:border-lime"
                        />
                        <p className="mt-1 text-xs text-mute">
                          Same as “send to address”, private Gloam tag from
                          their Move → Receive.
                        </p>
                        {contacts.length > 0 && (
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {contacts.map((c) => (
                              <button
                                key={c.id}
                                type="button"
                                onClick={() => setRecipientTag(c.tag)}
                                className="rounded-full border border-line px-2.5 py-1 text-[11px] text-mute hover:border-lime/40 hover:text-foreground"
                              >
                                {c.label}
                              </button>
                            ))}
                          </div>
                        )}
                        {recipientTag.trim().startsWith("gloamr1.") && (
                          <button
                            type="button"
                            className="mt-2 text-[11px] text-lime hover:underline"
                            onClick={() => {
                              const label =
                                window.prompt("Save contact as", "Friend") ??
                                "";
                              if (!label.trim()) return;
                              upsertContact(label, recipientTag);
                              setContacts(loadContacts());
                            }}
                          >
                            Save tag to contacts
                          </button>
                        )}
                      </div>
                      <div>
                        <label
                          htmlFor="pay-amt"
                          className="text-sm font-medium text-foreground"
                        >
                          Amount
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
                          Stays in the vault. Amount is not a public transfer
                          line. Change returns to you as a new note.
                        </p>
                      </div>
                      {!recipientTag.trim() && (
                        <div>
                          <button
                            type="button"
                            onClick={() =>
                              setPayStyle((s) =>
                                s === "bearer" ? "direct" : "bearer"
                              )
                            }
                            className="text-xs text-mute hover:text-lime"
                          >
                            {payStyle === "bearer"
                              ? "← Back to pay by tag"
                              : "Advanced: bearer ticket (no tag) →"}
                          </button>
                          {payStyle === "bearer" && (
                            <div className="mt-2">
                              <label
                                htmlFor="send-pass"
                                className="text-sm font-medium text-foreground"
                              >
                                Optional passphrase
                              </label>
                              <input
                                id="send-pass"
                                type="text"
                                autoComplete="off"
                                value={sendPassphrase}
                                onChange={(e) =>
                                  setSendPassphrase(e.target.value)
                                }
                                placeholder="e.g. coffee-tuesday"
                                className="mt-2 min-h-11 w-full rounded-md border border-line bg-transparent px-4 text-sm outline-none focus:border-lime"
                              />
                            </div>
                          )}
                        </div>
                      )}
                      <button
                        type="button"
                        disabled={
                          !isConnected ||
                          !onProduct ||
                          !selected ||
                          matchesChain === false ||
                          treeLoading ||
                          working ||
                          (payStyle !== "bearer" && !recipientTag.trim())
                        }
                        onClick={() => {
                          if (recipientTag.trim()) setPayStyle("direct");
                          void onPrivateSend();
                        }}
                        className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-lime text-sm font-semibold text-background disabled:opacity-50"
                      >
                        {working &&
                        (pendingAction.current === "send" ||
                          pendingAction.current === "memo") ? (
                          <>
                            <span
                              className="h-4 w-4 animate-spin rounded-full border-2 border-black/20 border-t-black"
                              aria-hidden
                            />
                            {status || "Working…"}
                          </>
                        ) : treeLoading ? (
                          "Syncing vault…"
                        ) : (
                          "Send privately"
                        )}
                      </button>
                      {matchesChain === false && (
                        <p className="text-center text-xs text-amber-600 dark:text-amber-400">
                          Vault tree mismatch, tap Refresh above, then retry.
                        </p>
                      )}
                      {isPayMemoLive() && (
                        <p className="text-center text-[11px] text-mute">
                          After confirm: vault transfer + on-chain memo so they
                          can Scan inbox (no QR required).
                        </p>
                      )}
                      {shareBlob && (
                        <PaymentTicketShare
                          code={shareBlob}
                          amountLabel={shareAmountLabel}
                          locked={shareLocked}
                        />
                      )}
                    </div>
                  )}

                  {mode === "cashout" && (
                    <div className="space-y-3">
                      <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-xs leading-relaxed text-mute">
                        <p className="font-medium text-foreground">
                          Cash out ends privacy for this note
                        </p>
                        <p className="mt-1">
                          The explorer will show asset, amount, and your wallet.
                          Prefer private send or private trade if you want size
                          to stay off the public book.
                        </p>
                      </div>
                      {selected && (
                        <p className="text-sm text-mute">
                          Withdraw{" "}
                          <strong className="text-foreground">
                            {formatSealedAmount(BigInt(selected.amountWei))}{" "}
                            {assetLabel(selected.asset)}
                          </strong>{" "}
                          to your connected wallet.
                        </p>
                      )}
                      {selected && (
                        <div
                          className={`rounded-lg border px-3 py-2 text-xs ${
                            cashOutInventoryShort
                              ? "border-amber-500/40 bg-amber-500/5 text-mute"
                              : poolForCashOut != null
                                ? "border-lime/30 bg-lime/5 text-mute"
                                : "border-line text-mute"
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span>
                              Vault inventory ({assetLabel(selected.asset)})
                            </span>
                            <span className="font-medium text-foreground">
                              {poolForCashOut != null
                                ? formatSealedAmount(poolForCashOut)
                                : "Checking…"}
                            </span>
                          </div>
                          {cashOutInventoryShort ? (
                            <p className="mt-1.5 leading-relaxed text-amber-600 dark:text-amber-500">
                              Not enough in the vault to pay this note. Cash out
                              is blocked until more{" "}
                              {assetLabel(selected.asset)} is shielded.{" "}
                              <Link
                                href="/app/shield"
                                className="underline hover:text-foreground"
                              >
                                Shield more →
                              </Link>
                            </p>
                          ) : poolForCashOut != null ? (
                            <p className="mt-1.5 text-[11px] text-mute">
                              Vault can cover this cash out.
                            </p>
                          ) : null}
                        </div>
                      )}
                      <button
                        type="button"
                        disabled={
                          !isConnected ||
                          !onProduct ||
                          !selected ||
                          matchesChain === false ||
                          treeLoading ||
                          working ||
                          selected?.leafIndex == null ||
                          cashOutInventoryShort
                        }
                        onClick={() => void onCashOut()}
                        className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-lime text-sm font-semibold text-background disabled:opacity-50"
                      >
                        {working && pendingAction.current === "cashout" ? (
                          <>
                            <span
                              className="h-4 w-4 animate-spin rounded-full border-2 border-black/20 border-t-black"
                              aria-hidden
                            />
                            {status || "Working…"}
                          </>
                        ) : cashOutInventoryShort ? (
                          "Cash out blocked, low inventory"
                        ) : (
                          "Cash out (public amount)"
                        )}
                      </button>
                      {selected?.leafIndex == null && (
                        <p className="text-xs text-amber-600 dark:text-amber-500">
                          Note not linked to the vault tree yet, tap Refresh
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
                    first, or open <strong className="text-foreground">Receive</strong>{" "}
                    to paste a payment ticket you were sent.
                  </p>
                </div>
              ) : null}

              {mode === "receive" && (
                <div className="space-y-4">
                  <div className="rounded-xl border border-lime/30 bg-lime/5 p-4">
                    <p className="text-sm font-medium text-foreground">
                      Your receive tag (direct private pay)
                    </p>
                    <p className="mt-1 text-xs text-mute">
                      Share this once, others paste it under Private pay →
                      Direct. Encrypted tickets only open in{" "}
                      <strong className="text-foreground">this browser</strong>{" "}
                      (back up notes if you clear data).
                    </p>
                    {myIdentity ? (
                      <>
                        <div className="mt-3 break-all rounded-lg border border-line bg-panel p-3 text-[10px] text-mute">
                          {myIdentity.tag}
                        </div>
                        <div className="mt-2 flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={async () => {
                              try {
                                await navigator.clipboard.writeText(
                                  myIdentity.tag
                                );
                                setTagCopied(true);
                                setTimeout(() => setTagCopied(false), 2000);
                              } catch {
                                setError("Could not copy tag.");
                              }
                            }}
                            className="inline-flex min-h-10 flex-1 items-center justify-center rounded-xl border border-lime/40 text-sm font-medium text-lime"
                          >
                            {tagCopied ? "Copied" : "Copy tag"}
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              void rotateReceiveIdentity().then(setMyIdentity);
                            }}
                            className="inline-flex min-h-10 items-center justify-center rounded-xl border border-line px-3 text-xs text-mute hover:text-foreground"
                          >
                            Rotate
                          </button>
                        </div>
                        <div className="mt-3">
                          <PaymentTicketShare
                            code={myIdentity.tag}
                            amountLabel={null}
                            locked={false}
                          />
                        </div>
                      </>
                    ) : (
                      <p className="mt-2 text-xs text-mute">
                        Generating tag… (needs a secure browser context)
                      </p>
                    )}
                  </div>

                  <div className="rounded-xl border border-line bg-background p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-medium text-foreground">
                        Inbox (on-chain memos)
                      </p>
                      <button
                        type="button"
                        onClick={() => void scanInbox()}
                        className="text-xs text-lime hover:underline"
                      >
                        Scan chain
                      </button>
                    </div>
                    <p className="mt-1 text-xs text-mute">
                      When the sender posts a note, payments show up here
                      automatically, no QR needed.{" "}
                      {isPayMemoLive()
                        ? "Inbox is live."
                        : "Inbox not deployed yet, paste the ticket below."}
                    </p>
                    {inboxStatus && (
                      <p className="mt-2 text-xs text-mute">{inboxStatus}</p>
                    )}
                    {inbox.length > 0 && (
                      <ul className="mt-3 divide-y divide-line rounded-lg border border-line">
                        {inbox.map((row) => (
                          <li
                            key={row.memo.paymentCommitment}
                            className="flex items-center justify-between gap-2 px-3 py-2 text-sm"
                          >
                            <span className="text-foreground">{row.label}</span>
                            <button
                              type="button"
                              className="text-xs font-medium text-lime"
                              onClick={() => {
                                setImportText(row.ticket);
                                setClaimPreview(
                                  `Selected ${row.label} from inbox.`
                                );
                              }}
                            >
                              Use
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>

                  <div className="rounded-xl border border-line bg-background p-4">
                    <p className="text-sm font-medium text-foreground">
                      Claim a payment
                    </p>
                    <p className="mt-1 text-xs text-mute">
                      Paste{" "}
                      <span className="">gloam2t…</span> (to your tag),{" "}
                      <span className="">gloam1…</span>, or locked{" "}
                      <span className="">gloam1e…</span>.
                    </p>
                    <textarea
                      value={importText}
                      onChange={(e) => setImportText(e.target.value)}
                      rows={4}
                      className="mt-3 w-full rounded-md border border-line bg-transparent p-3 text-[11px] outline-none focus:border-lime"
                      placeholder="gloam2t.… / gloam1.… / gloam1e.…"
                    />
                    {claimPreview && (
                      <p className="mt-2 text-xs text-lime">{claimPreview}</p>
                    )}
                    {(importText.trim().startsWith("gloam1e.") ||
                      (isEncryptedPackage(importText) &&
                        !isPayToTagSealed(importText))) && (
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
                          placeholder="Bearer lock phrase"
                          className="mt-2 min-h-11 w-full rounded-md border border-line bg-transparent px-4 text-sm outline-none focus:border-lime"
                        />
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={() => void onImportNote()}
                      disabled={!importText.trim() || !isConnected}
                      className="mt-3 inline-flex min-h-11 w-full items-center justify-center rounded-xl bg-lime text-sm font-semibold text-background disabled:opacity-50"
                    >
                      Claim into my vault
                    </button>
                  </div>
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
            <p className="text-[10px] uppercase tracking-[0.14em] text-lime">
              How private send works
            </p>
            <ul className="mt-3 space-y-2 text-mute">
              <li>
                <strong className="text-foreground">Pay to a tag</strong>, not a
                public address. Size stays off the open ledger.
              </li>
              <li>
                <strong className="text-foreground">Vault proof + encrypted memo.</strong>{" "}
                They find it under Receive, no QR required when memos are live.
              </li>
              <li>
                <strong className="text-foreground">Cash out</strong> publishes
                amount.{" "}
                <Link
                  href="/app/trade?path=sealed"
                  className="text-lime hover:underline"
                >
                  Private trade
                </Link>{" "}
                keeps size private.
              </li>
            </ul>
          </div>
          <div className="rounded-xl border border-line bg-panel p-5 text-sm text-mute">
            <p className="text-foreground">Need a vault note first?</p>
            <Link
              href="/app/shield"
              className="mt-2 inline-flex min-h-10 items-center text-lime hover:underline"
            >
              Shield →
            </Link>
            {" · "}
            <Link
              href="/app/trade?path=sealed"
              className="mt-2 inline-flex min-h-10 items-center text-lime hover:underline"
            >
              Private trade →
            </Link>
          </div>
        </aside>
      </div>

      <SuccessModal
        open={showSuccess && Boolean(hash)}
        title={successTitle}
        body={
          pendingAction.current === "send" ||
          pendingAction.current === "memo" ||
          shareBlob ? (
            <p>
              {memoPosted
                ? "Encrypted memo posted on-chain. Recipient can Scan chain under Receive, no QR required. Backup package still below."
                : "Payment package below (QR / copy / share) if they need handoff. Your vault change stays in this browser."}
            </p>
          ) : (
            <p>
              Funds should be back in your open wallet. That amount is public on
              the explorer, only cash out when you need the open balance.
            </p>
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
