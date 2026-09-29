"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAccount, useChainId, useWriteContract } from "wagmi";
import type { Address, Hex } from "viem";
import { useNetwork } from "./NetworkProvider";
import { RelayToggle } from "./RelayToggle";
import { useLocalShieldNotes } from "@/hooks/useLocalShieldNotes";
import { useShieldTree } from "@/hooks/useShieldTree";
import { getRhPublicClient } from "@/lib/rhClient";
import { shieldTokensFor, supportsNativeShield } from "@/lib/tokens";
import {
  NATIVE_ASSET,
  SHIELD_GAS_LIMIT,
  activeSpendableNotes,
  assetLabel,
  formatAssetLabel,
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
  type PayrollRowStatus,
} from "@/lib/payroll";

const STATUS_LABEL: Record<PayrollRowStatus, string> = {
  queued: "Waiting",
  preparing: "Preparing",
  sending: "Sending",
  confirming: "Confirming",
  notifying: "Letting them know",
  paid: "Paid",
  failed: "Failed",
};

const SECONDS_PER_PERSON = 8;

function download(filename: string, text: string) {
  const blob = new Blob([text], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function short(tag: string) {
  return tag.length > 18 ? `${tag.slice(0, 11)}…${tag.slice(-5)}` : tag;
}

export function PayrollView() {
  const { address, isConnected } = useAccount();
  const walletChainId = useChainId();
  const { network, networkKey } = useNetwork();
  const pool = network.pool;
  const { open, refresh: refreshNotes } = useLocalShieldNotes(address);
  const { loading: treeLoading, leafIndexForCommitment, refresh: refreshTree } = useShieldTree();
  const { writeContractAsync } = useWriteContract();

  // ---------------------------------------------------------------- asset
  const assetOptions = useMemo(() => {
    const opts: { address: Address; label: string }[] = [];
    if (supportsNativeShield(network.chainId)) opts.push({ address: NATIVE_ASSET, label: network.primaryAsset.symbol });
    for (const t of shieldTokensFor(network.chainId)) opts.push({ address: t.address as Address, label: t.symbol });
    return opts;
  }, [network.chainId, network.primaryAsset.symbol]);
  const [assetChoice, setAsset] = useState<Address | null>(null);
  // Falls back to the network's first asset when switching networks.
  const asset: Address =
    assetChoice && assetOptions.some((o) => o.address === assetChoice)
      ? assetChoice
      : (assetOptions[0]?.address ?? NATIVE_ASSET);

  // ---------------------------------------------------------------- draft
  const [csv, setCsv] = useState("");
  const [title, setTitle] = useState(() =>
    `Payroll ${new Date().toLocaleDateString("en-US", { month: "short", day: "numeric" })}`
  );
  const parsed = useMemo(() => parsePayrollCsv(csv, asset), [csv, asset]);
  const validRows = parsed.rows.filter((r) => !r.error);
  const badRows = parsed.rows.filter((r) => r.error);
  const total = draftTotal(parsed.rows);
  const fileRef = useRef<HTMLInputElement>(null);

  // ---------------------------------------------------------------- funding
  const spendable = useMemo(() => {
    return activeSpendableNotes(open)
      .filter((n) => n.asset.toLowerCase() === asset.toLowerCase() && n.scheme !== "keccak")
      .filter((n) => n.leafIndex != null || leafIndexForCommitment(n.commitment) != null)
      .map((n) => BigInt(n.amountWei))
      .filter((v) => v > 0n);
  }, [open, asset, leafIndexForCommitment]);
  const privateTotal = spendable.reduce((s, v) => s + v, 0n);
  const plan = useMemo(
    () => fundingPlan(validRows.map((r) => r.amount!), spendable),
    [validRows, spendable]
  );

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

  // ---------------------------------------------------------------- batches
  const [batches, setBatches] = useState<PayrollBatch[]>([]);
  const [active, setActive] = useState<PayrollBatch | null>(null);
  const [running, setRunning] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);
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
  const canRun =
    isConnected &&
    Boolean(address) &&
    Boolean(pool) &&
    validRows.length > 0 &&
    plan.shortfall === 0n &&
    !treeLoading &&
    !running &&
    (relayOn || walletOnChain);

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
      if (done.status === "done") setCsv("");
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
    const text = exportResultsCsv(b, {
      origin: window.location.origin,
      networkKey,
      assetLabel: assetLabel(b.asset),
      explorerTx: network.explorerTx,
    });
    download(`${b.title.replace(/[^\w-]+/g, "-").toLowerCase()}-results.csv`, text);
  }

  async function onFile(f: File | undefined) {
    if (!f) return;
    setCsv((await f.text()).slice(0, 200_000));
  }

  const view = active;
  const paidCount = view?.rows.filter((r) => r.status === "paid").length ?? 0;
  const paidTotal = view?.rows.filter((r) => r.status === "paid").reduce((s, r) => s + BigInt(r.amount), 0n) ?? 0n;
  const label = assetLabel(asset);

  // ---------------------------------------------------------------- render
  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-12">
      <div className="min-w-0 space-y-6">
        {!view || view.status === "draft" ? (
          <section className="rounded-2xl border border-line bg-panel p-5 sm:p-6">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <h2 className="font-display text-xl tracking-tight text-foreground">Your team</h2>
                <p className="mt-1 text-sm text-mute">
                  One person per line: name, Gloam address, amount. Leave the address blank and
                  they get a claim link instead.
                </p>
              </div>
              <label className="text-xs text-mute">
                <span className="mb-1 block">Pay in</span>
                <select
                  value={asset}
                  onChange={(e) => setAsset(e.target.value as Address)}
                  className="min-h-10 rounded-lg border border-line bg-background px-3 text-sm text-foreground outline-none focus:border-foreground"
                >
                  {assetOptions.map((o) => (
                    <option key={o.address} value={o.address}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <label className="mt-5 block">
              <span className="sr-only">Payroll list</span>
              <textarea
                value={csv}
                onChange={(e) => setCsv(e.target.value)}
                rows={7}
                spellCheck={false}
                placeholder={PAYROLL_TEMPLATE}
                className="w-full resize-y rounded-xl border border-line bg-background px-4 py-3 text-sm leading-relaxed text-foreground outline-none placeholder:text-mute/60 focus:border-foreground"
              />
            </label>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="inline-flex min-h-10 items-center rounded-lg border border-line px-4 text-sm font-medium text-foreground hover:border-foreground"
              >
                Upload CSV
              </button>
              <input
                ref={fileRef}
                type="file"
                accept=".csv,text/csv,text/plain"
                className="hidden"
                onChange={(e) => void onFile(e.target.files?.[0])}
              />
              <button
                type="button"
                onClick={() => download("gloam-payroll-template.csv", PAYROLL_TEMPLATE)}
                className="inline-flex min-h-10 items-center rounded-lg border border-line px-4 text-sm font-medium text-foreground hover:border-foreground"
              >
                Download template
              </button>
            </div>

            {parsed.error && <p className="mt-4 text-sm text-amber-600">{parsed.error}</p>}

            {parsed.rows.length > 0 && (
              <div className="mt-5 overflow-x-auto rounded-xl border border-line">
                <table className="w-full min-w-[520px] text-left text-sm">
                  <thead className="border-b border-line text-xs text-mute">
                    <tr>
                      <th className="px-4 py-2.5 font-medium">Name</th>
                      <th className="px-4 py-2.5 font-medium">Paid to</th>
                      <th className="px-4 py-2.5 text-right font-medium">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {parsed.rows.map((r) => (
                      <tr key={r.line} className="border-b border-line last:border-0 align-top">
                        <td className="whitespace-nowrap px-4 py-2.5 text-foreground">{r.name}</td>
                        <td className="px-4 py-2.5 text-mute">
                          {r.error ? (
                            <span className="text-amber-600">{r.error}</span>
                          ) : r.kind === "gloam" ? (
                            short(r.recipient)
                          ) : (
                            "Claim link"
                          )}
                        </td>
                        <td className="tnum whitespace-nowrap px-4 py-2.5 text-right text-foreground">
                          {r.amount != null ? formatAssetLabel(r.amount, asset) : r.amountInput || "-"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {validRows.length > 0 && (
              <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-5">
                <div className="text-sm">
                  <p className="text-foreground">
                    <strong className="font-semibold">{validRows.length}</strong>{" "}
                    {validRows.length === 1 ? "person" : "people"} ·{" "}
                    <strong className="tnum font-semibold">{formatAssetLabel(total, asset)}</strong>
                  </p>
                  {badRows.length > 0 && (
                    <p className="mt-0.5 text-xs text-amber-600">
                      {badRows.length} {badRows.length === 1 ? "line needs" : "lines need"} fixing and will be skipped.
                    </p>
                  )}
                  <p className="mt-0.5 text-xs text-mute">
                    About {Math.max(1, Math.round((validRows.length * SECONDS_PER_PERSON) / 60))} min. Keep this tab open while it runs.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    aria-label="Run name"
                    className="min-h-11 w-40 rounded-lg border border-line bg-background px-3 text-sm text-foreground outline-none focus:border-foreground"
                  />
                  <button
                    type="button"
                    disabled={!canRun}
                    onClick={() => void startRun()}
                    className="inline-flex min-h-11 items-center justify-center rounded-lg bg-lime px-5 text-sm font-semibold text-background disabled:opacity-40"
                  >
                    Pay {validRows.length} privately
                  </button>
                </div>
              </div>
            )}
            {validRows.length > 0 && !relayOn && !walletOnChain && isConnected && (
              <p className="mt-3 text-xs text-amber-600">
                Switch your wallet to {network.label} to pay from your wallet, or turn on Hide my wallet.
              </p>
            )}
          </section>
        ) : (
          <section className="rounded-2xl border border-line bg-panel p-5 sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h2 className="font-display text-xl tracking-tight text-foreground">{view.title}</h2>
                <p className="mt-1 text-sm text-mute">
                  {paidCount} of {view.rows.length} paid · {formatAssetLabel(paidTotal, view.asset)}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {running ? (
                  <button
                    type="button"
                    onClick={() => (stopRef.current = true)}
                    className="inline-flex min-h-10 items-center rounded-lg border border-line px-4 text-sm font-medium text-foreground hover:border-foreground"
                  >
                    Pause after this person
                  </button>
                ) : view.status !== "done" ? (
                  <button
                    type="button"
                    onClick={() => void execute(view)}
                    className="inline-flex min-h-10 items-center rounded-lg bg-lime px-4 text-sm font-semibold text-background"
                  >
                    Resume
                  </button>
                ) : null}
                {!running && (
                  <button
                    type="button"
                    onClick={() => exportBatch(view)}
                    className="inline-flex min-h-10 items-center rounded-lg border border-line px-4 text-sm font-medium text-foreground hover:border-foreground"
                  >
                    Download results
                  </button>
                )}
                {!running && (
                  <button
                    type="button"
                    onClick={() => setActive(null)}
                    className="inline-flex min-h-10 items-center rounded-lg px-3 text-sm text-mute hover:text-foreground"
                  >
                    New run
                  </button>
                )}
              </div>
            </div>

            <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-line" aria-hidden>
              <div
                className="h-full rounded-full bg-sealed transition-[width] duration-500"
                style={{ width: `${(paidCount / Math.max(1, view.rows.length)) * 100}%` }}
              />
            </div>

            {view.status === "needs_funds" && (
              <p className="mt-4 rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-sm text-mute">
                Paused: not enough private balance for the next payment.{" "}
                <Link href="/app/vault?tab=shield" className="font-medium text-foreground underline">
                  Add money privately
                </Link>
                , then come back and resume.
              </p>
            )}
            {runError && <p className="mt-4 text-sm text-amber-600">{runError}</p>}

            <div className="mt-5 overflow-x-auto rounded-xl border border-line">
              <table className="w-full min-w-[560px] text-left text-sm">
                <thead className="border-b border-line text-xs text-mute">
                  <tr>
                    <th className="px-4 py-2.5 font-medium">Name</th>
                    <th className="px-4 py-2.5 font-medium">Paid to</th>
                    <th className="px-4 py-2.5 text-right font-medium">Amount</th>
                    <th className="px-4 py-2.5 text-right font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {view.rows.map((r) => (
                    <tr key={r.id} className="border-b border-line last:border-0 align-top">
                      <td className="whitespace-nowrap px-4 py-2.5 text-foreground">{r.name}</td>
                      <td className="px-4 py-2.5 text-mute">
                        {r.kind === "gloam" ? short(r.recipient) : "Claim link"}
                        {r.status === "paid" && r.kind === "link" && r.ticket && (
                          <button
                            type="button"
                            onClick={() =>
                              void navigator.clipboard.writeText(claimLink(window.location.origin, networkKey, r.ticket!))
                            }
                            className="ml-2 text-xs font-medium text-foreground underline"
                          >
                            Copy link
                          </button>
                        )}
                        {r.error && r.status !== "paid" && <span className="mt-1 block text-xs text-amber-600">{r.error}</span>}
                      </td>
                      <td className="tnum whitespace-nowrap px-4 py-2.5 text-right text-foreground">{formatAssetLabel(r.amount, view.asset)}</td>
                      <td className="whitespace-nowrap px-4 py-2.5 text-right">
                        <span
                          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs ${
                            r.status === "paid"
                              ? "bg-sealed/10 text-sealed"
                              : r.status === "failed"
                                ? "bg-amber-500/10 text-amber-600"
                                : r.status === "queued"
                                  ? "text-mute"
                                  : "bg-foreground/5 text-foreground"
                          }`}
                        >
                          {r.status !== "paid" && r.status !== "failed" && r.status !== "queued" && (
                            <span className="h-2.5 w-2.5 animate-spin rounded-full border-[1.5px] border-foreground/20 border-t-foreground" aria-hidden />
                          )}
                          {STATUS_LABEL[r.status]}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {view.status === "done" && (
              <div className="mt-5 rounded-xl border border-sealed/30 bg-sealed/5 px-4 py-3 text-sm text-mute">
                <p className="font-medium text-foreground">
                  {paidCount} {paidCount === 1 ? "person" : "people"} paid privately.
                </p>
                <p className="mt-1">
                  Download the results for your records. Claim links work like cash, so send each one
                  only to its person.
                </p>
              </div>
            )}
          </section>
        )}
      </div>

      <aside className="space-y-4">
        <section className="rounded-2xl border border-line bg-panel p-5">
          <h3 className="text-sm font-semibold text-foreground">Private balance</h3>
          <p className="tnum mt-2 font-display text-2xl tracking-tight text-foreground">
            {formatAssetLabel(privateTotal, asset)}
          </p>
          {validRows.length > 0 && (!view || view.status === "draft") && (
            plan.shortfall === 0n ? (
              <p className="mt-2 text-xs text-sealed">Covers this payroll.</p>
            ) : (
              <div className="mt-3 text-xs text-mute">
                <p>
                  Add <strong className="text-foreground">{formatAssetLabel(plan.shortfall, asset)}</strong> privately
                  as one deposit to cover everyone.
                </p>
                <Link
                  href="/app/vault?tab=shield"
                  className="mt-3 inline-flex min-h-10 items-center rounded-lg bg-lime px-4 text-sm font-semibold text-background"
                >
                  Add {label} privately
                </Link>
              </div>
            )
          )}
          {!isConnected && <p className="mt-2 text-xs text-mute">Connect your wallet to see your balance.</p>}
        </section>

        <section className="space-y-3 rounded-2xl border border-line bg-panel p-5">
          <h3 className="text-sm font-semibold text-foreground">Who sees what</h3>
          <RelayToggle
            available={relayAvailable}
            on={relayOn}
            onChange={(v) => {
              setRelayOn(v);
              setRelayPreferred(v);
            }}
          />
          <ul className="space-y-2 text-xs leading-relaxed text-mute">
            <li>
              <span className="text-foreground">The public</span> sees private transfers
              {relayOn ? " sent by Gloam" : ""}. No names, no amounts.
            </li>
            <li>
              <span className="text-foreground">Your team</span> only sees their own pay.
              {isPayMemoLive()
                ? " People with a Gloam address find it in their app."
                : " People with a Gloam address get a payment code in your results."}
            </li>
            <li>
              <span className="text-foreground">You</span> keep a full record in the results file.
            </li>
          </ul>
        </section>

        {batches.length > 0 && (
          <section className="rounded-2xl border border-line bg-panel p-5">
            <h3 className="text-sm font-semibold text-foreground">Past runs</h3>
            <ul className="mt-3 space-y-2">
              {batches.slice(0, 8).map((b) => {
                const paid = b.rows.filter((r) => r.status === "paid").length;
                return (
                  <li key={b.id} className="flex items-center justify-between gap-3 text-sm">
                    <button
                      type="button"
                      disabled={running}
                      onClick={() => setActive(b)}
                      className="min-w-0 truncate text-left text-foreground hover:underline disabled:opacity-50"
                    >
                      {b.title}
                    </button>
                    <span className="shrink-0 text-xs text-mute">
                      {paid}/{b.rows.length} {b.status === "done" ? "paid" : "· paused"}
                    </span>
                    {b.status !== "done" && !running && b.rows.every((r) => r.status === "queued") && (
                      <button
                        type="button"
                        onClick={() => void deleteBatch(b.id).then(reloadBatches)}
                        className="shrink-0 text-xs text-mute hover:text-foreground"
                        aria-label={`Delete ${b.title}`}
                      >
                        Delete
                      </button>
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
