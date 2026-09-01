"use client";

import Link from "next/link";
import { useState } from "react";
import { useAccount } from "wagmi";
import { formatUnits } from "viem";
import { useLocalShieldNotes } from "@/hooks/useLocalShieldNotes";
import { NATIVE_ASSET, type LocalNote } from "@/lib/shield";
import { buildDisclosure, encodeDisclosure } from "@/lib/disclosure";

function assetLabel(asset: string): string {
  return asset.toLowerCase() === NATIVE_ASSET.toLowerCase()
    ? "ETH"
    : `${asset.slice(0, 6)}…${asset.slice(-4)}`;
}

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
      setErr(e instanceof Error ? e.message : "Could not build the disclosure.");
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
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_320px] lg:gap-14">
      <div className="min-w-0 space-y-4">
        {err && (
          <p className="rounded-xl border border-[#C0432F]/30 bg-[#C0432F]/[0.06] px-4 py-3 text-sm text-[#C0432F]">
            {err}
          </p>
        )}

        {!address && (
          <div className="rounded-2xl border border-line bg-panel p-6 text-sm text-mute">
            Connect your wallet to see the notes you can disclose.
          </div>
        )}

        {address && notes.length === 0 && (
          <div className="rounded-2xl border border-line bg-panel p-6 text-sm text-mute">
            No shielded notes yet. Shield a balance first, then you can prove it
            here without revealing anything else.
          </div>
        )}

        {notes.map((n) => {
          const token = tokens[n.id];
          return (
            <div
              key={n.id}
              className="rounded-2xl border border-line bg-panel p-5 sm:p-6"
            >
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="font-display text-xl tracking-tight text-foreground">
                    <span className="tnum">
                      {formatUnits(BigInt(n.amountWei), 18)}
                    </span>{" "}
                    {assetLabel(n.asset)}
                  </p>
                  <p className="mt-1 text-[11px] text-mute">Shielded note</p>
                </div>
                <button
                  type="button"
                  onClick={() => void make(n)}
                  disabled={busyId === n.id}
                  className="inline-flex min-h-10 items-center justify-center rounded-xl bg-lime px-4 text-sm font-semibold text-background transition-opacity hover:opacity-90 disabled:opacity-50"
                >
                  {busyId === n.id ? "Proving…" : "Create disclosure"}
                </button>
              </div>

              {token && (
                <div className="mt-4 border-t border-line pt-4">
                  <p className="text-[10px] uppercase tracking-[0.14em] text-mute">
                    Share this with the party you choose
                  </p>
                  <textarea
                    readOnly
                    value={token}
                    rows={3}
                    className="mt-2 w-full resize-none rounded-xl border border-line bg-background px-3 py-2.5 font-mono text-[12px] leading-relaxed text-foreground outline-none"
                  />
                  <div className="mt-2 flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => void copy(n.id, token)}
                      className="inline-flex min-h-9 items-center rounded-lg border border-line px-3 text-xs text-foreground hover:border-lime/50"
                    >
                      {copied === n.id ? "Copied" : "Copy"}
                    </button>
                    <Link
                      href="/verify"
                      className="text-xs text-lime hover:underline"
                    >
                      Open the verifier →
                    </Link>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
        <div className="rounded-2xl border border-line bg-panel p-5 sm:p-6">
          <span className="text-[10px] uppercase tracking-[0.16em] text-mute">
            What this proves
          </span>
          <p className="mt-2 text-sm leading-relaxed text-foreground/80">
            A disclosure proves you own a specific shielded balance in the vault,
            to a party you choose. It reveals only that one note. Your identity,
            your note secret, and every other holding stay private.
          </p>
        </div>
        <div className="rounded-2xl border border-line p-5 sm:p-6">
          <span className="text-[10px] uppercase tracking-[0.16em] text-mute">
            Safe to share
          </span>
          <p className="mt-2 text-sm leading-relaxed text-mute">
            The disclosure contains a zero-knowledge proof, not your secret, so it
            can never be used to spend the note. The recipient verifies it in the
            browser at{" "}
            <Link href="/verify" className="text-lime hover:underline">
              /verify
            </Link>
            .
          </p>
        </div>
      </aside>
    </div>
  );
}
