"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useAccount, useChainId, useWriteContract } from "wagmi";
import type { Address, Hex } from "viem";
import { useNetwork } from "./NetworkProvider";
import { RelayToggle } from "./RelayToggle";
import { TokenLogo } from "./TokenLogo";
import { useLocalShieldNotes } from "@/hooks/useLocalShieldNotes";
import { useShieldTree } from "@/hooks/useShieldTree";
import { getRhPublicClient } from "@/lib/rhClient";
import { shieldTokensFor, supportsNativeShield } from "@/lib/tokens";
import {
  NATIVE_ASSET,
  SHIELD_GAS_LIMIT,
  activeSpendableNotes,
  formatAssetAmount,
  shieldPoolAbi,
} from "@/lib/shield";
import { MEMO_GAS_LIMIT, isPayMemoLive, payMemoAbi, payMemoAddress } from "@/lib/payMemo";
import {
  relayFor,
  relayMemo,
  relayPreferred,
  relayTransfer,
  setRelayPreferred,
  waitForTx,
} from "@/lib/relay/client";
import {
  PAYROLL_TEMPLATE,
  claimLink,
  deleteBatch,
  draftTotal,
  exportResultsCsv,
  fundingPlan,
  loadBatches,
  newBatch,
  parsePayrollCsv,
  runPayroll,
  saveBatch,
  type PayrollBatch,
  type PayrollRow,
  type PayrollRowStatus,
} from "@/lib/payroll";

// ------------------------------------------------------------------ bits

const SECONDS_PER_PERSON = 8;
const ease = [0.22, 1, 0.36, 1] as const;

type AssetOption = { address: Address; symbol: string; logoId: string };

const STATUS_LABEL: Record<PayrollRowStatus, string> = {
  queued: "Waiting",
  preparing: "Preparing",
  sending: "Sending",
  confirming: "Confirming",
  notifying: "Letting them know",
  paid: "Paid",
  failed: "Failed",
};

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "·";
}

function short(tag: string) {
  return tag.length > 22 ? `${tag.slice(0, 12)}…${tag.slice(-6)}` : tag;
}

function download(filename: string, text: string) {
  const blob = new Blob([text], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function Spinner({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={`inline-block shrink-0 animate-spin rounded-full border-2 border-current border-t-transparent opacity-70 ${className}`}
    />
  );
}

type IconName = "file" | "link" | "shield" | "lock" | "check" | "alert" | "upload" | "x";

function Icon({ name, className = "h-4 w-4" }: { name: IconName; className?: string }) {
  const common = {
    className,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };
  switch (name) {
    case "file":
      return (
        <svg {...common}>
          <path d="M14 3H7a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2V8z" />
          <path d="M14 3v5h5M9 13h6M9 17h4" />
        </svg>
      );
    case "upload":
      return (
        <svg {...common}>
          <path d="M12 16V4M7 9l5-5 5 5" />
          <path d="M5 16v2a2 2 0 002 2h10a2 2 0 002-2v-2" />
        </svg>
      );
    case "link":
      return (
        <svg {...common}>
          <path d="M10 14a4 4 0 005.66 0l3-3a4 4 0 00-5.66-5.66l-1 1" />
          <path d="M14 10a4 4 0 00-5.66 0l-3 3a4 4 0 005.66 5.66l1-1" />
        </svg>
      );
    case "shield":
      return (
        <svg {...common}>
          <path d="M12 3l7 3v5.2c0 4.6-3 8.3-7 9.8-4-1.5-7-5.2-7-9.8V6z" />
        </svg>
      );
    case "lock":
      return (
        <svg {...common}>
          <rect x="5" y="10.5" width="14" height="10" rx="2.5" />
          <path d="M8.5 10.5V8a3.5 3.5 0 017 0v2.5" />
        </svg>
      );
    case "check":
      return (
        <svg {...common} strokeWidth={2.2}>
          <path d="M5 12.5l4.2 4.2L19 7" />
        </svg>
      );
    case "alert":
      return (
        <svg {...common}>
          <path d="M12 8v5M12 16.5v.5" />
          <path d="M10.3 3.9L2.6 17.2A2 2 0 004.3 20h15.4a2 2 0 001.7-2.8L13.7 3.9a2 2 0 00-3.4 0z" />
        </svg>
      );
    case "x":
      return (
        <svg {...common}>
          <path d="M6 6l12 12M18 6L6 18" />
        </svg>
      );
  }
}

function Amount({
  raw,
  asset,
  logoId,
  symbol,
  size = 18,
  className = "",
}: {
  raw: bigint | string;
  asset: Address;
  logoId: string;
  symbol: string;
  size?: number;
  className?: string;
}) {
  return (
    <span className={`inline-flex items-center gap-2 whitespace-nowrap ${className}`}>
      <span className="tnum">{formatAssetAmount(raw, asset, 6)}</span>
      <TokenLogo id={logoId} symbol={symbol} size={size} />
    </span>
  );
}

// ------------------------------------------------------------------ view

export function PayrollView() {
  const reduce = useReducedMotion();
  const { address, isConnected } = useAccount();
  const walletChainId = useChainId();
  const { network, networkKey } = useNetwork();
  const pool = network.pool;
  const { open, refresh: refreshNotes } = useLocalShieldNotes(address);
  const { loading: treeLoading, leafIndexForCommitment, refresh: refreshTree } = useShieldTree();
  const { writeContractAsync } = useWriteContract();

  // ---------------------------------------------------------------- assets
  const assetOptions = useMemo<AssetOption[]>(() => {
    const opts: AssetOption[] = [];
    if (supportsNativeShield(network.chainId)) {
      opts.push({
        address: NATIVE_ASSET,
        symbol: network.primaryAsset.symbol,
        logoId: network.primaryAsset.symbol.toLowerCase(),
      });
    }
    for (const t of shieldTokensFor(network.chainId)) {
      opts.push({ address: t.address as Address, symbol: t.symbol, logoId: t.id });
    }
    return opts;
  }, [network.chainId, network.primaryAsset.symbol]);
  const [assetChoice, setAsset] = useState<Address | null>(null);
  const token: AssetOption = assetOptions.find((o) => o.address === assetChoice) ??
    assetOptions[0] ?? { address: NATIVE_ASSET, symbol: "ETH", logoId: "eth" };
  const asset = token.address;

  /** Spendable private balance per asset (only entries the vault tree knows). */
  const balances = useMemo(() => {
    const m = new Map<string, { total: bigint; entries: bigint[] }>();
    for (const n of activeSpendableNotes(open)) {
      if (n.scheme === "keccak") continue;
      if (n.leafIndex == null && leafIndexForCommitment(n.commitment) == null) continue;
      const v = BigInt(n.amountWei);
      if (v <= 0n) continue;
      const k = n.asset.toLowerCase();
      const cur = m.get(k) ?? { total: 0n, entries: [] };
      cur.total += v;
      cur.entries.push(v);
      m.set(k, cur);
    }
    return m;
  }, [open, leafIndexForCommitment]);
  const bal = balances.get(asset.toLowerCase()) ?? { total: 0n, entries: [] as bigint[] };

  // ---------------------------------------------------------------- draft
  const [csv, setCsv] = useState("");
  const [file, setFile] = useState<{ name: string; size: number } | null>(null);
  const [reading, setReading] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [view, setViewMode] = useState<"you" | "public">("you");
  const [title, setTitle] = useState(
    () => `Payroll ${new Date().toLocaleDateString("en-US", { month: "short", day: "numeric" })}`
  );
  const fileRef = useRef<HTMLInputElement>(null);

  const parsed = useMemo(() => parsePayrollCsv(csv, asset), [csv, asset]);
  const validRows = useMemo(() => parsed.rows.filter((r) => !r.error), [parsed.rows]);
  const badCount = parsed.rows.length - validRows.length;
  const total = draftTotal(parsed.rows);
  const directCount = validRows.filter((r) => r.kind === "gloam").length;
  const plan = useMemo(
    () => fundingPlan(validRows.map((r) => r.amount!), bal.entries),
    [validRows, bal.entries]
  );
  const coverage = total > 0n ? Math.min(1, Number((bal.total * 1000n) / total) / 1000) : 0;

  async function loadFile(f: File | undefined) {
    if (!f) return;
    setReading(f.name);
    try {
      // A short minimum so the spinner reads as a step, not a flicker.
      const [text] = await Promise.all([f.text(), new Promise((r) => setTimeout(r, 450))]);
      setCsv(text.slice(0, 200_000));
      setFile({ name: f.name, size: f.size });
      setPasteOpen(false);
    } finally {
      setReading(null);
    }
  }

  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragging(false);
    void loadFile(e.dataTransfer.files?.[0]);
  }

  function clearDraft() {
    setCsv("");
    setFile(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  // ---------------------------------------------------------------- relay
  const [relayAvailable, setRelayAvailable] = useState(false);
  const [relayOn, setRelayOn] = useState(false);
  useEffect(() => {
    let live = true;
    void relayFor(network.chainId).then((r) => {
      if (!live) return;
      const ok = Boolean(r?.enabled);
      setRelayAvailable(ok);
      setRelayOn(ok && relayPreferred());
    });
    return () => {
      live = false;
    };
  }, [network.chainId]);

  // ---------------------------------------------------------------- runs
  const [batches, setBatches] = useState<PayrollBatch[]>([]);
  const [active, setActive] = useState<PayrollBatch | null>(null);
  const [running, setRunning] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const stopRef = useRef(false);

  const reloadBatches = useCallback(() => {
    if (!pool) return Promise.resolve();
    return loadBatches(network.chainId, pool).then(setBatches);
  }, [network.chainId, pool]);
  useEffect(() => {
    if (!pool) return;
    let live = true;
    void loadBatches(network.chainId, pool).then((b) => {
      if (live) setBatches(b);
    });
    return () => {
      live = false;
    };
  }, [network.chainId, pool]);

  const walletOnChain = walletChainId === network.chainId;
  const blocker = !isConnected
    ? "Connect your wallet to pay."
    : !pool
      ? "Payroll is not available on this network."
      : validRows.length === 0
        ? null
        : !relayOn && !walletOnChain
          ? `Switch your wallet to ${network.label}, or turn on Hide my wallet.`
          : treeLoading
            ? "Syncing your private balance…"
            : null;
  const canRun = !blocker && validRows.length > 0 && plan.shortfall === 0n && !running;

  async function execute(batch: PayrollBatch) {
    if (!address || !pool) return;
    stopRef.current = false;
    setRunning(true);
    setRunError(null);
    setActive(batch);
    const useRelay = batch.relay && relayAvailable;
    const memoOn = isPayMemoLive();
    try {
      const done = await runPayroll(batch, {
        client: getRhPublicClient(),
        submitTransfer: (a) =>
          useRelay
            ? relayTransfer({ chainId: network.chainId, ...a })
            : writeContractAsync({
                address: pool,
                abi: shieldPoolAbi,
                functionName: "transfer",
                args: [a.proof, a.root, a.nullifier, [a.commitments[0], a.commitments[1]]],
                gas: SHIELD_GAS_LIMIT,
                chainId: network.chainId,
              }),
        submitMemo: memoOn
          ? (m) =>
              useRelay
                ? relayMemo({ chainId: network.chainId, ...m })
                : writeContractAsync({
                    address: payMemoAddress()!,
                    abi: payMemoAbi,
                    functionName: "postMemo",
                    args: [m.paymentCommitment, m.memo],
                    gas: MEMO_GAS_LIMIT,
                    chainId: network.chainId,
                  })
          : null,
        waitForTx: (h: Hex) => waitForTx(h),
        onUpdate: (b) => setActive(b),
        shouldStop: () => stopRef.current,
      });
      setActive({ ...done });
      if (done.status === "done") clearDraft();
    } catch (e) {
      setRunError(e instanceof Error ? e.message : "Payroll stopped.");
    } finally {
      setRunning(false);
      refreshNotes();
      void refreshTree();
      void reloadBatches();
    }
  }

  async function startRun() {
    if (!address || !pool || !canRun) return;
    const batch = newBatch({
      title: title.trim() || "Payroll",
      chainId: network.chainId,
      pool,
      asset,
      employer: address,
      relay: relayOn,
      rows: parsed.rows,
    });
    await saveBatch(batch);
    await execute(batch);
  }

  function exportBatch(b: PayrollBatch) {
    const opt = assetOptions.find((o) => o.address === b.asset);
    download(
      `${b.title.replace(/[^\w-]+/g, "-").toLowerCase()}-results.csv`,
      exportResultsCsv(b, {
        origin: window.location.origin,
        networkKey,
        assetLabel: opt?.symbol ?? "",
        explorerTx: network.explorerTx,
      })
    );
  }

  async function copy(key: string, text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied((c) => (c === key ? null : c)), 1500);
    } catch {
      /* clipboard blocked */
    }
  }

  const rowMotion = reduce
    ? {}
    : {
        initial: { opacity: 0, y: 6 },
        animate: { opacity: 1, y: 0 },
        exit: { opacity: 0 },
        transition: { duration: 0.22, ease },
      };

  // ================================================================ run view
  if (active && active.status !== "draft") {
    const b = active;
    const opt = assetOptions.find((o) => o.address === b.asset) ?? token;
    const paid = b.rows.filter((r) => r.status === "paid");
    const paidTotal = paid.reduce((s, r) => s + BigInt(r.amount), 0n);
    const current = b.rows.find(
      (r) => r.status !== "paid" && r.status !== "failed" && r.status !== "queued"
    );
    const remaining = b.rows.filter((r) => r.status !== "paid" && r.status !== "failed").length;
    const links = paid.filter((r) => r.kind === "link" && r.ticket);
    const done = b.status === "done";

    return (
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-10">
        <section className="min-w-0 overflow-hidden rounded-2xl border border-line bg-panel">
          <div className="border-b border-line px-5 py-5 sm:px-7">
            {done ? (
              <div className="flex items-start gap-4">
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-sealed text-white">
                  <Icon name="check" className="h-5 w-5" />
                </span>
                <div>
                  <p className="font-display text-2xl tracking-tight text-foreground">
                    {paid.length} {paid.length === 1 ? "person" : "people"} paid privately
                  </p>
                  <p className="mt-1 flex flex-wrap items-center gap-x-2 text-sm text-mute">
                    <Amount raw={paidTotal} asset={b.asset} logoId={opt.logoId} symbol={opt.symbol} size={16} className="text-foreground" />
                    <span>· {b.title}</span>
                  </p>
                </div>
              </div>
            ) : (
              <div>
                <p className="flex items-center gap-2 text-sm font-medium text-foreground">
                  {running ? <Spinner className="h-3.5 w-3.5" /> : null}
                  {running
                    ? current
                      ? `Paying ${current.name}`
                      : "Starting…"
                    : b.status === "needs_funds"
                      ? "Paused: add money privately to continue"
                      : "Paused"}
                </p>
                <p className="mt-1 text-sm text-mute">
                  {paid.length} of {b.rows.length} paid · about{" "}
                  {Math.max(1, Math.round((remaining * SECONDS_PER_PERSON) / 60))} min left. Keep this tab open.
                </p>
              </div>
            )}
            <div className="mt-5 h-1.5 overflow-hidden rounded-full bg-foreground/[0.07]" aria-hidden>
              <motion.div
                className="h-full rounded-full bg-sealed"
                initial={false}
                animate={{ width: `${(paid.length / Math.max(1, b.rows.length)) * 100}%` }}
                transition={{ duration: reduce ? 0 : 0.5, ease }}
              />
            </div>
          </div>

          {runError && (
            <p className="flex items-center gap-2 border-b border-line bg-amber-500/5 px-5 py-3 text-sm text-amber-700 sm:px-7">
              <Icon name="alert" /> {runError}
            </p>
          )}

          <ul>
            {b.rows.map((r) => (
              <RunRow
                key={r.id}
                row={r}
                opt={opt}
                asset={b.asset}
                networkKey={networkKey}
                copied={copied}
                onCopy={copy}
              />
            ))}
          </ul>
        </section>

        <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
          <section className="rounded-2xl border border-line bg-panel p-5">
            <p className="text-xs font-medium uppercase tracking-[0.14em] text-mute">{done ? "Receipt" : "Run"}</p>
            <div className="mt-3 space-y-2 text-sm">
              <Line k="Paid" v={`${paid.length} of ${b.rows.length}`} />
              <Line k="Sent by" v={b.relay ? "Gloam, wallet hidden" : "Your wallet"} />
              <Line k="Claim links" v={String(b.rows.filter((r) => r.kind === "link").length)} />
            </div>
            <div className="mt-5 space-y-2">
              {running ? (
                <button
                  type="button"
                  onClick={() => (stopRef.current = true)}
                  className="inline-flex min-h-11 w-full items-center justify-center rounded-xl border border-line text-sm font-medium text-foreground hover:border-foreground/40"
                >
                  Pause after this person
                </button>
              ) : !done ? (
                <button
                  type="button"
                  onClick={() => void execute(b)}
                  className="inline-flex min-h-11 w-full items-center justify-center rounded-xl bg-lime text-sm font-semibold text-background"
                >
                  Resume
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => exportBatch(b)}
                  className="inline-flex min-h-11 w-full items-center justify-center rounded-xl bg-lime text-sm font-semibold text-background"
                >
                  Download results
                </button>
              )}
              {!running && links.length > 0 && (
                <button
                  type="button"
                  onClick={() =>
                    void copy(
                      "all",
                      links.map((r) => `${r.name}: ${claimLink(window.location.origin, networkKey, r.ticket!)}`).join("\n")
                    )
                  }
                  className="inline-flex min-h-10 w-full items-center justify-center gap-2 text-sm font-medium text-foreground hover:underline"
                >
                  <Icon name="link" />
                  {copied === "all" ? "Copied" : `Copy ${links.length} claim ${links.length === 1 ? "link" : "links"}`}
                </button>
              )}
              {!running && (
                <button
                  type="button"
                  onClick={() => setActive(null)}
                  className="inline-flex min-h-10 w-full items-center justify-center text-sm text-mute hover:text-foreground"
                >
                  {done ? "Start a new run" : "Back to your list"}
                </button>
              )}
            </div>
            {done && links.length > 0 && (
              <p className="mt-4 border-t border-line pt-4 text-xs leading-relaxed text-mute">
                Claim links work like cash. Send each one only to its person.
              </p>
            )}
            {b.status === "needs_funds" && (
              <Link href="/app/vault?tab=shield" className="mt-4 inline-flex text-sm font-medium text-foreground underline">
                Add {opt.symbol} privately
              </Link>
            )}
          </section>
        </aside>
      </div>
    );
  }

  // ================================================================ draft view
  const hasRows = parsed.rows.length > 0;
  const linkCount = validRows.length - directCount;

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-10">
      <div className="min-w-0 space-y-5">
        {/* currency */}
        <section className="rounded-2xl border border-line bg-panel p-5 sm:p-6">
          <p className="text-xs font-medium uppercase tracking-[0.14em] text-mute">Pay in</p>
          <div className="mt-3 flex gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" role="radiogroup" aria-label="Currency">
            {assetOptions.map((o) => {
              const selected = o.address === asset;
              const b = balances.get(o.address.toLowerCase())?.total ?? 0n;
              return (
                <button
                  key={o.address}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => setAsset(o.address)}
                  className={`flex min-w-[156px] shrink-0 items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground ${
                    selected ? "border-foreground bg-foreground/[0.03]" : "border-line hover:border-foreground/30"
                  }`}
                >
                  <TokenLogo id={o.logoId} symbol={o.symbol} size={30} />
                  <span className="min-w-0">
                    <span className="block text-sm font-medium text-foreground">{o.symbol}</span>
                    <span className="tnum block text-xs text-mute">
                      {b > 0n ? `${formatAssetAmount(b, o.address, 2)} private` : "No private balance"}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        {/* team list */}
        <section className="rounded-2xl border border-line bg-panel p-5 sm:p-6">
          {file && !reading ? (
            <div className="flex items-center gap-4 rounded-xl border border-line px-4 py-3.5">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-foreground/[0.05] text-foreground">
                <Icon name="file" className="h-5 w-5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-foreground">{file.name}</p>
                <p className="text-xs text-mute">
                  {validRows.length} {validRows.length === 1 ? "person" : "people"}
                  {badCount > 0 && <span className="text-amber-700"> · {badCount} to fix</span>}
                </p>
              </div>
              <button type="button" onClick={() => fileRef.current?.click()} className="text-sm font-medium text-foreground hover:underline">
                Replace
              </button>
              <button
                type="button"
                onClick={clearDraft}
                aria-label="Remove file"
                className="grid h-9 w-9 place-items-center rounded-lg text-mute hover:bg-foreground/5 hover:text-foreground"
              >
                <Icon name="x" />
              </button>
            </div>
          ) : (
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={onDrop}
              className={`flex flex-col items-center justify-center rounded-xl border border-dashed px-6 py-10 text-center transition-colors ${
                dragging ? "border-foreground bg-foreground/[0.03]" : "border-foreground/20"
              }`}
            >
              {reading ? (
                <>
                  <Spinner className="h-6 w-6 text-foreground" />
                  <p className="mt-4 text-sm font-medium text-foreground">Reading {reading}</p>
                  <p className="mt-1 text-xs text-mute">Checking names, addresses and amounts</p>
                </>
              ) : (
                <>
                  <span className="grid h-12 w-12 place-items-center rounded-full bg-foreground/[0.05] text-foreground">
                    <Icon name="upload" className="h-5 w-5" />
                  </span>
                  <p className="mt-4 text-base font-medium text-foreground">Drop your team&apos;s CSV here</p>
                  <p className="mt-1 max-w-sm text-sm text-mute">
                    Name, Gloam address, amount. Leave the address blank and they get a claim link.
                  </p>
                  <button
                    type="button"
                    onClick={() => fileRef.current?.click()}
                    className="mt-5 inline-flex min-h-10 items-center rounded-lg bg-lime px-4 text-sm font-semibold text-background"
                  >
                    Choose a file
                  </button>
                </>
              )}
            </div>
          )}
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv,text/plain"
            className="hidden"
            onChange={(e) => void loadFile(e.target.files?.[0])}
          />

          <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
            <button
              type="button"
              onClick={() => setPasteOpen((v) => !v)}
              className="font-medium text-foreground hover:underline"
              aria-expanded={pasteOpen}
            >
              {pasteOpen ? "Hide pasted list" : "Paste a list instead"}
            </button>
            <button
              type="button"
              onClick={() => download("gloam-payroll-template.csv", PAYROLL_TEMPLATE)}
              className="text-mute hover:text-foreground"
            >
              Download template
            </button>
          </div>
          <AnimatePresence initial={false}>
            {pasteOpen && (
              <motion.div
                initial={reduce ? false : { height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={reduce ? { opacity: 0 } : { height: 0, opacity: 0 }}
                transition={{ duration: 0.2, ease }}
                className="overflow-hidden"
              >
                <label className="mt-4 block">
                  <span className="sr-only">Payroll list</span>
                  <textarea
                    value={csv}
                    onChange={(e) => {
                      setCsv(e.target.value);
                      setFile(null);
                    }}
                    rows={6}
                    spellCheck={false}
                    placeholder={PAYROLL_TEMPLATE}
                    className="w-full resize-y rounded-xl border border-line bg-background px-4 py-3 text-sm leading-relaxed text-foreground outline-none placeholder:text-mute/60 focus:border-foreground"
                  />
                </label>
              </motion.div>
            )}
          </AnimatePresence>
          {parsed.error && (
            <p className="mt-4 flex items-center gap-2 text-sm text-amber-700">
              <Icon name="alert" /> {parsed.error}
            </p>
          )}
        </section>

        {/* pay list, with the "who sees what" switch */}
        {hasRows && (
          <section className="overflow-hidden rounded-2xl border border-line bg-panel">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4 sm:px-6">
              <div>
                <h2 className="text-base font-semibold text-foreground">Pay list</h2>
                <p className="text-xs text-mute">
                  {validRows.length} {validRows.length === 1 ? "person" : "people"} · {directCount} direct · {linkCount} claim{" "}
                  {linkCount === 1 ? "link" : "links"}
                </p>
              </div>
              <div className="inline-flex rounded-lg bg-foreground/[0.06] p-1 text-xs font-medium" role="tablist" aria-label="Who sees what">
                {(["you", "public"] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    role="tab"
                    aria-selected={view === m}
                    onClick={() => setViewMode(m)}
                    className={`relative min-h-8 rounded-md px-3 transition-colors ${
                      view === m ? "text-foreground" : "text-mute hover:text-foreground"
                    }`}
                  >
                    {view === m && (
                      <motion.span
                        layoutId="payroll-view-pill"
                        className="absolute inset-0 rounded-md bg-panel shadow-sm"
                        transition={{ duration: reduce ? 0 : 0.25, ease }}
                      />
                    )}
                    <span className="relative">{m === "you" ? "You see" : "The public sees"}</span>
                  </button>
                ))}
              </div>
            </div>

            <ul>
              <AnimatePresence initial={false} mode="popLayout">
                {parsed.rows.map((r) => {
                  const pub = view === "public" && !r.error;
                  return (
                    <motion.li
                      key={`${r.line}-${pub ? "p" : "y"}`}
                      {...rowMotion}
                      className="flex items-center gap-4 border-b border-line px-5 py-3.5 last:border-0 sm:px-6"
                    >
                      {pub ? (
                        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-sealed/10 text-sealed">
                          <Icon name="lock" />
                        </span>
                      ) : (
                        <span
                          className={`grid h-9 w-9 shrink-0 place-items-center rounded-full text-xs font-semibold ${
                            r.error ? "bg-amber-500/10 text-amber-700" : "bg-foreground/[0.06] text-foreground"
                          }`}
                        >
                          {r.error ? <Icon name="alert" /> : initials(r.name)}
                        </span>
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-foreground">{pub ? "Private transfer" : r.name}</p>
                        <p className={`truncate text-xs ${r.error ? "text-amber-700" : "text-mute"}`}>
                          {r.error
                            ? r.error
                            : pub
                              ? relayOn
                                ? "Sent by Gloam. No name, no amount."
                                : "No name, no amount."
                              : r.kind === "gloam"
                                ? `Gloam address · ${short(r.recipient)}`
                                : "Claim link, you share it after the run"}
                        </p>
                      </div>
                      {pub ? (
                        <span className="text-sm tracking-[0.2em] text-mute" aria-label="Amount hidden">
                          ●●●●●
                        </span>
                      ) : r.amount != null ? (
                        <Amount
                          raw={r.amount}
                          asset={asset}
                          logoId={token.logoId}
                          symbol={token.symbol}
                          className={`text-sm ${r.error ? "text-mute line-through" : "text-foreground"}`}
                        />
                      ) : (
                        <span className="text-sm text-mute">{r.amountInput || "No amount"}</span>
                      )}
                    </motion.li>
                  );
                })}
              </AnimatePresence>
            </ul>
          </section>
        )}
      </div>

      {/* summary */}
      <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
        <section className="rounded-2xl border border-line bg-panel p-5">
          <p className="text-xs font-medium uppercase tracking-[0.14em] text-mute">This run</p>
          <p className="mt-3 flex items-center gap-2.5 font-display text-3xl tracking-tight text-foreground">
            <span className="tnum">{formatAssetAmount(total, asset, 2)}</span>
            <TokenLogo id={token.logoId} symbol={token.symbol} size={26} />
          </p>
          <p className="mt-1 text-sm text-mute">
            {validRows.length > 0
              ? `${validRows.length} ${validRows.length === 1 ? "person" : "people"} · about ${Math.max(
                  1,
                  Math.round((validRows.length * SECONDS_PER_PERSON) / 60)
                )} min`
              : "Add your team to see the total"}
          </p>

          <div className="mt-5 rounded-xl bg-foreground/[0.03] p-4">
            <div className="flex items-center justify-between text-sm">
              <span className="text-mute">Private balance</span>
              <span className="tnum font-medium text-foreground">
                {formatAssetAmount(bal.total, asset, 2)} {token.symbol}
              </span>
            </div>
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-foreground/[0.08]" aria-hidden>
              <div
                className={`h-full rounded-full transition-[width] duration-500 ${
                  plan.shortfall === 0n && total > 0n ? "bg-sealed" : "bg-foreground/60"
                }`}
                style={{ width: `${total > 0n ? coverage * 100 : 0}%` }}
              />
            </div>
            <p className="mt-2 text-xs text-mute">
              {total === 0n
                ? "Payments come out of your private balance."
                : plan.shortfall === 0n
                  ? "Covers this run."
                  : `${formatAssetAmount(plan.shortfall, asset, 2)} ${token.symbol} short. Add it as one deposit.`}
            </p>
          </div>

          <div className="mt-4">
            <RelayToggle
              available={relayAvailable}
              on={relayOn}
              onChange={(v) => {
                setRelayOn(v);
                setRelayPreferred(v);
              }}
              compact
            />
          </div>

          <div className="mt-5">
            {validRows.length > 0 && plan.shortfall > 0n && isConnected ? (
              <Link
                href="/app/vault?tab=shield"
                className="inline-flex min-h-12 w-full items-center justify-center rounded-xl bg-lime text-sm font-semibold text-background"
              >
                Add {formatAssetAmount(plan.shortfall, asset, 2)} {token.symbol} privately
              </Link>
            ) : (
              <button
                type="button"
                disabled={!canRun}
                onClick={() => void startRun()}
                className="inline-flex min-h-12 w-full items-center justify-center rounded-xl bg-lime text-sm font-semibold text-background transition-opacity disabled:opacity-35"
              >
                {validRows.length > 0
                  ? `Pay ${validRows.length} ${validRows.length === 1 ? "person" : "people"} privately`
                  : "Pay privately"}
              </button>
            )}
            {blocker && <p className="mt-2 text-center text-xs text-mute">{blocker}</p>}
            {badCount > 0 && validRows.length > 0 && (
              <p className="mt-2 text-center text-xs text-amber-700">
                {badCount} {badCount === 1 ? "line" : "lines"} will be skipped until fixed.
              </p>
            )}
          </div>

          {validRows.length > 0 && (
            <label className="mt-4 block border-t border-line pt-4">
              <span className="text-xs text-mute">Name this run</span>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="mt-1 min-h-10 w-full rounded-lg border border-line bg-background px-3 text-sm text-foreground outline-none focus:border-foreground"
              />
            </label>
          )}
        </section>

        {batches.length > 0 && (
          <section className="rounded-2xl border border-line bg-panel p-5">
            <p className="text-xs font-medium uppercase tracking-[0.14em] text-mute">Past runs</p>
            <ul className="mt-3 divide-y divide-line">
              {batches.slice(0, 6).map((b) => {
                const paid = b.rows.filter((r) => r.status === "paid");
                const opt = assetOptions.find((o) => o.address === b.asset);
                const sum = paid.reduce((s, r) => s + BigInt(r.amount), 0n);
                const untouched = b.rows.every((r) => r.status === "queued");
                return (
                  <li key={b.id} className="flex items-center gap-3 py-2.5">
                    <button type="button" onClick={() => setActive(b)} className="min-w-0 flex-1 text-left">
                      <span className="block truncate text-sm font-medium text-foreground">{b.title}</span>
                      <span className="tnum block text-xs text-mute">
                        {paid.length}/{b.rows.length} paid · {formatAssetAmount(sum, b.asset, 2)} {opt?.symbol ?? ""}
                      </span>
                    </button>
                    {b.status === "done" ? (
                      <span className="text-sealed" aria-label="Done">
                        <Icon name="check" />
                      </span>
                    ) : untouched ? (
                      <button
                        type="button"
                        onClick={() => void deleteBatch(b.id).then(reloadBatches)}
                        className="text-xs text-mute hover:text-foreground"
                      >
                        Delete
                      </button>
                    ) : (
                      <span className="text-xs text-amber-700">Paused</span>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        )}
      </aside>
    </div>
  );
}

function Line({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-mute">{k}</span>
      <span className="text-right font-medium text-foreground">{v}</span>
    </div>
  );
}

function RunRow({
  row: r,
  opt,
  asset,
  networkKey,
  copied,
  onCopy,
}: {
  row: PayrollRow;
  opt: AssetOption;
  asset: Address;
  networkKey: string;
  copied: string | null;
  onCopy: (key: string, text: string) => void;
}) {
  const busy = r.status !== "paid" && r.status !== "failed" && r.status !== "queued";
  return (
    <li
      className={`flex items-center gap-4 border-b border-line px-5 py-3.5 last:border-0 sm:px-7 ${
        busy ? "bg-foreground/[0.02]" : ""
      }`}
    >
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-foreground/[0.06] text-xs font-semibold text-foreground">
        {initials(r.name)}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground">{r.name}</p>
        <p className="flex items-center gap-1.5 truncate text-xs text-mute">
          {r.kind === "gloam" ? <Icon name="shield" className="h-3.5 w-3.5" /> : <Icon name="link" className="h-3.5 w-3.5" />}
          {r.kind === "gloam" ? (r.memoPosted ? "Gloam address, notified" : "Gloam address") : "Claim link"}
          {r.status === "paid" && r.kind === "link" && r.ticket && (
            <button
              type="button"
              onClick={() => onCopy(r.id, claimLink(window.location.origin, networkKey, r.ticket!))}
              className="ml-1 font-medium text-foreground hover:underline"
            >
              {copied === r.id ? "Copied" : "Copy link"}
            </button>
          )}
        </p>
        {r.error && r.status !== "paid" && <p className="mt-0.5 truncate text-xs text-amber-700">{r.error}</p>}
      </div>
      <Amount
        raw={r.amount}
        asset={asset}
        logoId={opt.logoId}
        symbol={opt.symbol}
        className="text-sm text-foreground"
      />
      <span
        className={`inline-flex min-w-[112px] items-center justify-end gap-1.5 text-xs font-medium ${
          r.status === "paid"
            ? "text-sealed"
            : r.status === "failed"
              ? "text-amber-700"
              : busy
                ? "text-foreground"
                : "text-mute"
        }`}
      >
        {busy && <Spinner className="h-3 w-3" />}
        {r.status === "paid" && <Icon name="check" className="h-3.5 w-3.5" />}
        {STATUS_LABEL[r.status]}
      </span>
    </li>
  );
}
