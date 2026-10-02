"use client";

import Link from "next/link";
import { useState } from "react";
import { useAccount } from "wagmi";
import { useLocalShieldNotes } from "@/hooks/useLocalShieldNotes";
import { assetLabel, formatAssetAmount, type LocalNote } from "@/lib/shield";
import { buildDisclosure, encodeDisclosure } from "@/lib/disclosure";
import { SealDots } from "@/components/ui/SealDots";
import { SealedField } from "@/components/ui/SealedField";
import { WalletMenu } from "./WalletMenu";

function ShieldCheck({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 3.5l7 3v5.25c0 4.1-2.9 7.6-7 8.75-4.1-1.15-7-4.65-7-8.75V6.5l7-3z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path d="M9 12.25l2.1 2.1L15.25 10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function Spinner() {
  return (
    <span
      aria-hidden
      className="inline-block h-3.5 w-3.5 shrink-0 animate-spin rounded-full border-[1.5px] border-current border-t-transparent opacity-70 motion-reduce:animate-none"
    />
  );
}

/** What each party sees, as a quiet two-column list. */
const SEES: { who: string; sees: string; hidden?: boolean }[] = [
  { who: "The person you share with", sees: "That one balance, checked against the vault" },
  { who: "Everyone else", sees: "Nothing", hidden: true },
  { who: "Never shared", sees: "Your wallet, other balances, history", hidden: true },
];

export function DiscloseView() {
  const { address } = useAccount();
  const { open } = useLocalShieldNotes(address);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [tokens, setTokens] = useState<Record<string, string>>({});
  const [copied, setCopied] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const notes = (open as LocalNote[]).filter(
    (n) => n.secret && n.bound && n.status !== "recovered"
  );

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
        {err && (
          <p className="flex items-start gap-2.5 rounded-[14px] bg-danger-soft px-4 py-3 text-[13.5px] leading-relaxed text-danger" role="alert">
            <svg className="mt-0.5 h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" aria-hidden>
              <circle cx="12" cy="12" r="8.5" stroke="currentColor" strokeWidth="1.6" />
              <path d="M12 7.75v5M12 16.25v.01" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
            <span className="min-w-0 break-words">{err}</span>
          </p>
        )}

        {!address && (
          <section className="gl-card relative overflow-hidden">
            <SealedField tone="soft" />
            <div className="relative z-[1] flex flex-col items-start max-sm:p-6 sm:p-8">
              <span className="grid h-11 w-11 place-items-center rounded-full bg-panel text-foreground shadow-card">
                <ShieldCheck className="h-5 w-5" />
              </span>
              <h2 className="mt-5 text-[22px] font-light tracking-[-0.012em] text-foreground">
                Connect to prove a balance
              </h2>
              <p className="mt-2 max-w-[48ch] text-[14px] leading-relaxed text-mute">
                Your private balances live in this browser. Connect the wallet you
                used, and pick one to prove.
              </p>
              <div className="mt-6">
                <WalletMenu />
              </div>
            </div>
          </section>
        )}

        {address && notes.length === 0 && (
          <section className="gl-card relative overflow-hidden">
            <SealedField tone="soft" />
            <div className="relative z-[1] flex flex-col items-start max-sm:p-6 sm:p-8">
              <span className="grid h-11 w-11 place-items-center rounded-full bg-panel text-foreground shadow-card">
                <ShieldCheck className="h-5 w-5" />
              </span>
              <h2 className="mt-5 text-[22px] font-light tracking-[-0.012em] text-foreground">
                No private balance yet
              </h2>
              <p className="mt-2 max-w-[48ch] text-[14px] leading-relaxed text-mute">
                Add money to your vault first. Then come back and prove it to anyone,
                without showing them anything else.
              </p>
              <Link href="/app/vault?tab=shield" className="btn btn-ink mt-6">
                Add privately
              </Link>
            </div>
          </section>
        )}

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
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
                      <rect x="5" y="10.5" width="14" height="10" rx="2.5" stroke="currentColor" strokeWidth="1.8" />
                      <path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5" stroke="currentColor" strokeWidth="1.8" />
                    </svg>
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
        <section className="rounded-[18px] border border-line max-sm:p-5 sm:p-6">
          <p className="text-[14px] text-foreground">Safe to share</p>
          <p className="mt-1.5 text-[13px] leading-relaxed text-mute">
            A proof is not your key. It can never be used to spend your money. Whoever
            gets it can check it in their browser at{" "}
            <Link href="/verify" className="text-foreground underline decoration-line-strong underline-offset-2 hover:decoration-foreground">
              gloam.trade/verify
            </Link>
            .
          </p>
        </section>
      </aside>
    </div>
  );
}
