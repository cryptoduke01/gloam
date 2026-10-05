"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { assetLabel, formatAssetAmount, type LocalNote } from "@/lib/shield";
import { buildDisclosure, encodeDisclosure } from "@/lib/disclosure";
import { SealDots } from "@/components/ui/SealDots";
import { LockIcon, Notice, SafeToShare, ShieldCheck, Spinner } from "./ProofParts";

/** What each party sees, as a quiet two-column list. */
const SEES: { who: string; sees: string; hidden?: boolean }[] = [
  { who: "The person you share with", sees: "That one balance, checked against the vault" },
  { who: "Everyone else", sees: "Nothing", hidden: true },
  { who: "Never shared", sees: "Your wallet, other balances, history", hidden: true },
];

/** The original flow: prove one private balance, amount shown exactly. */
export function ExactBalance({ notes, empty }: { notes: LocalNote[]; empty: ReactNode }) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [tokens, setTokens] = useState<Record<string, string>>({});
  const [copied, setCopied] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function make(n: LocalNote) {
    setErr(null);
    setBusyId(n.id);
    try {
      const d = await buildDisclosure({
        chainId: n.chainId,
        pool: n.pool,
        secret: n.secret,
        commitment: n.commitment,
        amount: BigInt(n.amountWei),
        asset: n.asset,
      });
      setTokens((t) => ({ ...t, [n.id]: encodeDisclosure(d) }));
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not build the proof.");
    } finally {
      setBusyId(null);
    }
  }

  async function copy(id: string, token: string) {
    try {
      await navigator.clipboard.writeText(token);
      setCopied(id);
      setTimeout(() => setCopied((c) => (c === id ? null : c)), 1500);
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="grid max-lg:gap-5 lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-6">
      <div className="min-w-0 space-y-5">
        {err && <Notice tone="danger">{err}</Notice>}

        {empty}

        {notes.length > 0 && (
          <p className="text-[13px] text-mute">
            {notes.length === 1
              ? "One private balance you can prove."
              : `${notes.length} private balances you can prove. Each proof covers one.`}
          </p>
        )}

        {notes.map((n) => {
          const token = tokens[n.id];
          const busy = busyId === n.id;
          return (
            <section key={n.id} className="gl-card overflow-hidden">
              <div className="flex flex-wrap items-center justify-between gap-4 max-sm:p-5 sm:p-6">
                <div className="flex min-w-0 items-center gap-3.5">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-sealed-soft text-sealed">
                    <LockIcon />
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-foreground">
                      <span className="tnum text-[26px] font-light leading-none tracking-[-0.02em]">
                        {formatAssetAmount(n.amountWei, n.asset)}
                      </span>{" "}
                      <span className="text-[15px] text-mute">{assetLabel(n.asset)}</span>
                    </p>
                    <p className="mt-1.5 text-[12.5px] text-mute">Private balance, only you can see it</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => void make(n)}
                  disabled={busy}
                  className={`btn btn-sm h-10 ${token ? "btn-quiet text-mute" : "btn-ghost"}`}
                >
                  {busy ? <Spinner /> : <ShieldCheck className="h-3.5 w-3.5" />}
                  {busy ? "Proving…" : token ? "New proof" : "Create proof"}
                </button>
              </div>

              {busy && (
                <p className="border-t border-line bg-surface/60 max-sm:px-5 py-3 text-[12.5px] text-mute sm:px-6">
                  Building the proof on this device. It takes a few seconds, and your
                  key never leaves this browser.
                </p>
              )}

              {token && (
                <div className="border-t border-line bg-surface/50 max-sm:p-5 sm:p-6">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <label htmlFor={`proof-${n.id}`} className="text-[13px] text-mute">
                      Your proof. Share it with whoever you choose.
                    </label>
                    <span className="inline-flex h-6 items-center gap-1.5 rounded-full bg-sealed-soft px-2.5 text-[12px] font-medium text-sealed">
                      <ShieldCheck className="h-3.5 w-3.5" />
                      Ready
                    </span>
                  </div>
                  <textarea
                    id={`proof-${n.id}`}
                    readOnly
                    value={token}
                    rows={3}
                    onFocus={(e) => e.currentTarget.select()}
                    className="gl-input tnum mt-2 h-auto resize-none break-all py-3 text-[12px] leading-relaxed text-soft"
                  />
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <button type="button" onClick={() => void copy(n.id, token)} className="btn btn-ink btn-sm h-10">
                      {copied === n.id ? "Copied" : "Copy proof"}
                    </button>
                    <Link href="/verify" className="btn btn-quiet btn-sm h-10">
                      Open the verifier
                    </Link>
                  </div>
                </div>
              )}
            </section>
          );
        })}
      </div>

      <aside className="space-y-4 lg:sticky lg:top-6 lg:self-start">
        <section className="gl-card max-sm:p-5 sm:p-6">
          <p className="t-label">What a proof shows</p>
          <div className="mt-4 rounded-[14px] bg-surface p-4">
            <div className="flex items-center gap-3">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-sealed-soft text-sealed">
                <ShieldCheck />
              </span>
              <div className="min-w-0">
                <p className="text-[14px] text-foreground">Holds this balance</p>
                <p className="text-[12px] text-mute">Checked against the Gloam vault</p>
              </div>
            </div>
            <div className="mt-3 flex items-center justify-between border-t border-line pt-3 text-[12.5px]">
              <span className="text-mute">Wallet, history, other balances</span>
              <SealDots n={5} className="text-foreground/50" />
            </div>
          </div>
          <dl className="mt-4 divide-y divide-line">
            {SEES.map((r) => (
              <div key={r.who} className="py-3">
                <dt className="text-[12.5px] text-mute">{r.who}</dt>
                <dd className={`mt-0.5 text-[14px] ${r.hidden ? "text-soft" : "text-foreground"}`}>{r.sees}</dd>
              </div>
            ))}
          </dl>
        </section>
        <SafeToShare />
      </aside>
    </div>
  );
}
