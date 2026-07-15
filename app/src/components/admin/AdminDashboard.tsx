"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Logo } from "@/components/Logo";
import { EXPLORER_TX, EXPLORER_ADDRESS } from "@/lib/chain";

type MetricsPayload = {
  ok: boolean;
  generatedAt?: string;
  launch?: {
    open: boolean;
    forceOpen: boolean;
    opensAt: string;
    opensAtMs: number;
  };
  onchain?: {
    error?: string;
    pool?: string | null;
    chainId?: number;
    asOf?: string;
    latestBlock?: string;
    notes?: string;
    shields?: number;
    transfers?: number;
    unshields?: number;
    sealedSwaps?: number;
    uniqueShielders?: number;
    uniqueUnshieldTos?: number;
    shieldVolumeEth?: string;
    unshieldVolumeEth?: string;
    shieldVolumeByAsset?: {
      asset: string;
      symbol: string;
      amount: string;
      count: number;
    }[];
    unshieldVolumeByAsset?: {
      asset: string;
      symbol: string;
      amount: string;
      count: number;
    }[];
    poolBalances?: { asset: string; symbol: string; deposited: string }[];
    recentTxs?: {
      kind: string;
      txHash: string;
      blockNumber: string;
      detail: string;
    }[];
  };
  product?: {
    backend: "redis" | "memory";
    totalEvents: number;
    counters: Record<string, number>;
    recent: {
      t: string;
      path: string | null;
      ref: string | null;
      meta: Record<string, unknown> | null;
      ts: number;
    }[];
  };
  error?: string;
};

export function AdminDashboard() {
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [code, setCode] = useState("");
  const [loginErr, setLoginErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [data, setData] = useState<MetricsPayload | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoadErr(null);
    try {
      const res = await fetch("/api/admin/metrics", { credentials: "include" });
      if (res.status === 401) {
        setAuthed(false);
        setData(null);
        return;
      }
      const json = (await res.json()) as MetricsPayload;
      if (!res.ok) {
        setLoadErr(json.error ?? "Failed to load");
        return;
      }
      setAuthed(true);
      setData(json);
    } catch (e) {
      setLoadErr(e instanceof Error ? e.message : "Network error");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!authed) return;
    const id = window.setInterval(() => void load(), 45_000);
    return () => window.clearInterval(id);
  }, [authed, load]);

  async function onLogin(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setLoginErr(null);
    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
        credentials: "include",
      });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok) {
        setLoginErr(json.error ?? "Login failed");
        return;
      }
      setCode("");
      setAuthed(true);
      await load();
    } catch {
      setLoginErr("Network error");
    } finally {
      setBusy(false);
    }
  }

  async function onLogout() {
    await fetch("/api/admin/logout", { method: "POST", credentials: "include" });
    setAuthed(false);
    setData(null);
  }

  if (authed === null) {
    return (
      <div className="flex min-h-full items-center justify-center bg-background text-sm text-mute">
        Checking session…
      </div>
    );
  }

  if (!authed) {
    return (
      <div className="flex min-h-full flex-col bg-background">
        <header className="border-b border-line">
          <div className="mx-auto flex h-14 max-w-md items-center px-5">
            <Logo />
          </div>
        </header>
        <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-5 py-12">
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-lime">
            Internal
          </p>
          <h1 className="mt-2 font-display text-3xl text-foreground">Admin</h1>
          <p className="mt-2 text-sm text-mute">
            Access code required. Traction metrics are not public.
          </p>
          <form onSubmit={onLogin} className="mt-8 space-y-4">
            <label className="block">
              <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-mute">
                Access code
              </span>
              <input
                type="password"
                autoComplete="current-password"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                className="mt-2 w-full rounded-md border border-line bg-panel px-3 py-3 text-sm text-foreground outline-none focus:border-lime"
                required
              />
            </label>
            {loginErr && (
              <p className="text-sm text-red-400" role="alert">
                {loginErr}
              </p>
            )}
            <button
              type="submit"
              disabled={busy}
              className="inline-flex min-h-11 w-full items-center justify-center rounded-md bg-lime text-sm font-semibold text-black hover:opacity-90 disabled:opacity-50"
            >
              {busy ? "…" : "Enter"}
            </button>
          </form>
        </main>
      </div>
    );
  }

  const oc = data?.onchain && !("error" in data.onchain && data.onchain.error)
    ? data.onchain
    : null;
  const ocError =
    data?.onchain && "error" in data.onchain ? data.onchain.error : null;
  const product = data?.product;

  return (
    <div className="min-h-full bg-background">
      <header className="sticky top-0 z-20 border-b border-line bg-background/90 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-3 px-5 sm:px-8">
          <div className="flex items-center gap-3">
            <Logo />
            <span className="rounded-full border border-lime/40 px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.14em] text-lime">
              Admin
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void load()}
              className="rounded-md border border-line px-3 py-2 text-xs text-mute hover:text-foreground"
            >
              Refresh
            </button>
            <button
              type="button"
              onClick={() => void onLogout()}
              className="rounded-md border border-line px-3 py-2 text-xs text-mute hover:text-foreground"
            >
              Log out
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-10 px-5 py-10 sm:px-8">
        {loadErr && (
          <p className="rounded-md border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
            {loadErr}
          </p>
        )}

        <section>
          <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-lime">
            Launch gate
          </p>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <Stat
              label="Public open"
              value={data?.launch?.open ? "Yes" : "No"}
            />
            <Stat
              label="Opens at (UTC)"
              value={
                data?.launch?.opensAt
                  ? new Date(data.launch.opensAt).toLocaleString()
                  : "—"
              }
            />
            <Stat
              label="Force open"
              value={data?.launch?.forceOpen ? "On" : "Off"}
            />
          </div>
          <p className="mt-2 text-[11px] text-mute">
            Generated {data?.generatedAt ?? "—"} · auto-refresh 45s
          </p>
        </section>

        <section>
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-lime">
                On-chain (source of truth)
              </p>
              <h2 className="mt-1 font-display text-2xl text-foreground">
                Pool activity
              </h2>
            </div>
            {oc?.pool && (
              <a
                href={EXPLORER_ADDRESS(oc.pool)}
                target="_blank"
                rel="noreferrer"
                className="font-mono text-[11px] text-mute hover:text-lime"
              >
                {oc.pool.slice(0, 10)}… → explorer
              </a>
            )}
          </div>
          {ocError && (
            <p className="mt-3 text-sm text-red-400">On-chain error: {ocError}</p>
          )}
          {oc && (
            <>
              <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <Stat label="Unique shielders" value={String(oc.uniqueShielders ?? 0)} />
                <Stat label="Shields" value={String(oc.shields ?? 0)} />
                <Stat label="Private sends" value={String(oc.transfers ?? 0)} />
                <Stat label="Unshields" value={String(oc.unshields ?? 0)} />
                <Stat label="Sealed swaps" value={String(oc.sealedSwaps ?? 0)} />
                <Stat label="Note slots (nextIndex)" value={String(oc.notes ?? 0)} />
                <Stat label="Shield vol (ETH)" value={oc.shieldVolumeEth ?? "0"} />
                <Stat label="Unshield vol (ETH)" value={oc.unshieldVolumeEth ?? "0"} />
              </div>

              {(oc.poolBalances?.length ?? 0) > 0 && (
                <div className="mt-6">
                  <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-mute">
                    Pool balances (deposited)
                  </p>
                  <div className="mt-2 overflow-x-auto rounded-lg border border-line">
                    <table className="w-full text-left text-sm">
                      <thead className="border-b border-line bg-panel text-[11px] text-mute">
                        <tr>
                          <th className="px-3 py-2 font-medium">Asset</th>
                          <th className="px-3 py-2 font-medium">Amount</th>
                        </tr>
                      </thead>
                      <tbody>
                        {oc.poolBalances!.map((r) => (
                          <tr key={r.asset} className="border-b border-line last:border-0">
                            <td className="px-3 py-2 text-foreground">{r.symbol}</td>
                            <td className="tnum px-3 py-2 text-mute">{r.deposited}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              <div className="mt-6">
                <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-mute">
                  Recent txs
                </p>
                <ul className="mt-2 max-h-72 space-y-1 overflow-y-auto rounded-lg border border-line bg-panel p-3 text-xs">
                  {(oc.recentTxs ?? []).length === 0 && (
                    <li className="text-mute">No events yet</li>
                  )}
                  {(oc.recentTxs ?? []).map((tx) => (
                    <li
                      key={`${tx.txHash}-${tx.kind}-${tx.blockNumber}`}
                      className="flex flex-wrap items-center gap-2 text-mute"
                    >
                      <span className="rounded bg-background px-1.5 py-0.5 font-mono text-[10px] uppercase text-lime">
                        {tx.kind}
                      </span>
                      <span className="text-foreground">{tx.detail}</span>
                      <a
                        href={EXPLORER_TX(tx.txHash)}
                        target="_blank"
                        rel="noreferrer"
                        className="font-mono hover:text-lime"
                      >
                        {tx.txHash.slice(0, 10)}…
                      </a>
                      <span className="tnum">#{tx.blockNumber}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </>
          )}
        </section>

        <section>
          <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-lime">
            Product events
          </p>
          <h2 className="mt-1 font-display text-2xl text-foreground">
            App funnel
          </h2>
          <p className="mt-1 text-sm text-mute">
            Backend:{" "}
            <span className="text-foreground">
              {product?.backend ?? "—"}
            </span>
            {product?.backend === "memory" && (
              <span>
                {" "}
                · set Upstash Redis for durable counts across deploys
              </span>
            )}
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Stat
              label="Total events"
              value={String(product?.totalEvents ?? 0)}
            />
            {Object.entries(product?.counters ?? {})
              .filter(([k]) => k !== "total")
              .sort((a, b) => b[1] - a[1])
              .slice(0, 11)
              .map(([k, v]) => (
                <Stat key={k} label={k} value={String(v)} />
              ))}
          </div>
          <div className="mt-6">
            <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-mute">
              Recent product events
            </p>
            <ul className="mt-2 max-h-72 space-y-1 overflow-y-auto rounded-lg border border-line bg-panel p-3 text-xs">
              {(product?.recent ?? []).length === 0 && (
                <li className="text-mute">No product events yet</li>
              )}
              {(product?.recent ?? []).map((ev, i) => (
                <li
                  key={`${ev.ts}-${ev.t}-${i}`}
                  className="flex flex-wrap gap-2 text-mute"
                >
                  <span className="font-mono text-lime">{ev.t}</span>
                  <span>{ev.path}</span>
                  <span className="tnum">
                    {new Date(ev.ts).toLocaleString()}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="rounded-xl border border-line bg-panel p-5 text-sm text-mute">
          <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-lime">
            How big teams do this
          </p>
          <ul className="mt-3 list-disc space-y-1.5 pl-5">
            <li>
              <strong className="text-foreground">On-chain</strong> = users &amp;
              volume truth (what we show above from the pool).
            </li>
            <li>
              <strong className="text-foreground">Product analytics</strong> =
              PostHog / Mixpanel / Amplitude — we use first-party{" "}
              <code className="text-lime">/api/collect</code> + optional Redis.
            </li>
            <li>
              <strong className="text-foreground">Durable store</strong>: free{" "}
              <a
                href="https://upstash.com"
                className="text-lime hover:underline"
                target="_blank"
                rel="noreferrer"
              >
                Upstash Redis
              </a>{" "}
              env vars (see .env.example).
            </li>
          </ul>
          <p className="mt-4">
            <Link href="/app" className="text-lime hover:underline">
              Open testnet app →
            </Link>
          </p>
        </section>
      </main>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-line bg-panel px-4 py-3">
      <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-mute">
        {label}
      </p>
      <p className="tnum mt-1 text-xl font-medium text-foreground">{value}</p>
    </div>
  );
}
