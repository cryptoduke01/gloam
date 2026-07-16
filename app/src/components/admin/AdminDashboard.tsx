"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
  type FormEvent,
} from "react";
import { Logo } from "@/components/Logo";
import { EXPLORER_TX, EXPLORER_ADDRESS, shortAddress } from "@/lib/chain";

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
    topShielders?: { address: string; shields: number; volumeEth: string }[];
    recentTxs?: {
      kind: string;
      txHash: string;
      blockNumber: string;
      detail: string;
      from?: string;
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
  const [tab, setTab] = useState<"overview" | "users" | "events">("overview");

  const checkSession = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/session", { credentials: "include" });
      if (res.status === 503) {
        setAuthed(false);
        setLoginErr("ADMIN_ACCESS_CODE is not set on the server.");
        return false;
      }
      if (res.status === 401) {
        setAuthed(false);
        return false;
      }
      if (!res.ok) {
        setAuthed(false);
        setLoginErr("Could not verify session.");
        return false;
      }
      setAuthed(true);
      return true;
    } catch {
      setAuthed(false);
      setLoginErr("Network error checking session.");
      return false;
    }
  }, []);

  const loadMetrics = useCallback(async () => {
    setLoadErr(null);
    try {
      const res = await fetch("/api/admin/metrics", { credentials: "include" });
      if (res.status === 401) {
        setAuthed(false);
        setData(null);
        return;
      }
      // Session is valid if we got past 401 — don't freeze on metrics failure
      setAuthed(true);
      if (!res.ok) {
        const json = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        setLoadErr(json?.error ?? `Metrics failed (${res.status})`);
        return;
      }
      const json = (await res.json()) as MetricsPayload;
      setData(json);
    } catch (e) {
      // Keep dashboard shell if session was already true
      setLoadErr(e instanceof Error ? e.message : "Network error loading metrics");
      setAuthed((prev) => (prev === null ? false : prev));
    }
  }, []);

  useEffect(() => {
    void (async () => {
      const ok = await checkSession();
      if (ok) await loadMetrics();
    })();
  }, [checkSession, loadMetrics]);

  useEffect(() => {
    if (!authed) return;
    const id = window.setInterval(() => void loadMetrics(), 45_000);
    return () => window.clearInterval(id);
  }, [authed, loadMetrics]);

  async function onLogin(e: FormEvent) {
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
        setAuthed(false);
        return;
      }
      setCode("");
      setAuthed(true);
      await loadMetrics();
    } catch {
      setLoginErr("Network error");
      setAuthed(false);
    } finally {
      setBusy(false);
    }
  }

  async function onLogout() {
    await fetch("/api/admin/logout", {
      method: "POST",
      credentials: "include",
    });
    setAuthed(false);
    setData(null);
  }

  // Hooks must run every render (before any early return) — React #310
  const oc =
    data?.onchain && !("error" in data.onchain && data.onchain.error)
      ? data.onchain
      : null;
  const ocError =
    data?.onchain && "error" in data.onchain ? data.onchain.error : null;
  const product = data?.product;

  const funnelBars = useMemo(() => {
    const counters = product?.counters ?? {};
    const keys = [
      "testnet_gate_view",
      "testnet_open",
      "app_view",
      "wallet_connect",
      "shield_success",
      "private_send_submit",
      "private_pay_success",
      "unshield_success",
      "pageview",
    ];
    const rows = keys
      .map((k) => ({ k, v: counters[k] ?? 0 }))
      .filter((r) => r.v > 0 || counters[r.k] != null);
    const max = Math.max(1, ...rows.map((r) => r.v));
    return rows.map((r) => ({ ...r, pct: (r.v / max) * 100 }));
  }, [product?.counters]);

  const activityBars = useMemo(() => {
    if (!oc) return [];
    const rows = [
      { k: "Shields", v: oc.shields ?? 0 },
      { k: "Transfers", v: oc.transfers ?? 0 },
      { k: "Unshields", v: oc.unshields ?? 0 },
      { k: "Sealed", v: oc.sealedSwaps ?? 0 },
    ];
    const max = Math.max(1, ...rows.map((r) => r.v));
    return rows.map((r) => ({ ...r, pct: (r.v / max) * 100 }));
  }, [oc]);

  if (authed === null) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <span className="livedot h-2 w-2 rounded-full bg-lime" />
          <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-mute">
            Verifying session
          </p>
        </div>
      </div>
    );
  }

  if (!authed) {
    return (
      <div className="relative flex min-h-dvh flex-col bg-background">
        <div className="pointer-events-none absolute inset-0" aria-hidden>
          <div className="absolute left-1/2 top-[42%] h-[480px] w-[480px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-lime/[0.07] blur-[120px]" />
        </div>

        <header className="relative z-10 border-b border-line">
          <div className="mx-auto flex h-14 max-w-lg items-center justify-between px-5 sm:px-6">
            <Logo />
            <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-mute">
              Restricted
            </span>
          </div>
        </header>

        <main className="relative z-10 flex flex-1 flex-col items-center justify-center px-5 py-12">
          <div className="w-full max-w-md">
            <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-lime">
              Ops console
            </p>
            <h1 className="mt-3 font-display text-4xl tracking-tight text-foreground sm:text-5xl">
              Traction
            </h1>
            <p className="mt-3 text-sm leading-relaxed text-mute">
              On-chain volume, unique wallets, and product funnel. Access code
              required. Not public.
            </p>

            <form
              onSubmit={onLogin}
              className="mt-8 space-y-5 rounded-2xl border border-line bg-panel p-6 sm:p-7"
            >
              <label className="block">
                <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-mute">
                  Access code
                </span>
                <input
                  type="password"
                  autoComplete="current-password"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder="••••••••••••"
                  className="mt-2 w-full rounded-lg border border-line bg-background px-4 py-3.5 font-mono text-sm text-foreground outline-none placeholder:text-mute/50 focus:border-lime/50 focus:ring-1 focus:ring-lime/30"
                  required
                />
              </label>
              {loginErr && (
                <p
                  className="rounded-md border border-red-500/25 bg-red-500/10 px-3 py-2 text-sm text-red-300"
                  role="alert"
                >
                  {loginErr}
                </p>
              )}
              <button
                type="submit"
                disabled={busy}
                className="inline-flex min-h-12 w-full items-center justify-center rounded-lg bg-lime text-sm font-semibold text-black transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                {busy ? "Checking…" : "Enter console"}
              </button>
            </form>
            <p className="mt-6 text-center text-[11px] text-mute">
              Set <code className="text-lime">ADMIN_ACCESS_CODE</code> on Vercel
            </p>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-full bg-background">
      <header className="sticky top-0 z-20 border-b border-line bg-background/90 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-3 px-5 sm:px-8">
          <div className="flex items-center gap-3">
            <Logo />
            <span className="rounded-full border border-lime/40 px-2.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.14em] text-lime">
              Admin
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="hidden font-mono text-[10px] text-mute sm:inline">
              {product?.backend === "redis" ? "redis" : "memory"} · auto 45s
            </span>
            <button
              type="button"
              onClick={() => void loadMetrics()}
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

      <main className="mx-auto max-w-6xl space-y-8 px-5 py-8 sm:px-8 sm:py-10">
        {loadErr && (
          <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
            {loadErr}
          </p>
        )}

        {/* Tabs */}
        <div className="flex flex-wrap gap-2 border-b border-line pb-3">
          {(
            [
              ["overview", "Overview"],
              ["users", "Wallets"],
              ["events", "Product events"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={`rounded-md px-3 py-2 text-sm transition-colors ${
                tab === id
                  ? "bg-lime/15 font-medium text-foreground"
                  : "text-mute hover:text-foreground"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {tab === "overview" && (
          <>
            <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Kpi
                label="Unique shielders"
                value={String(oc?.uniqueShielders ?? 0)}
                sub="on-chain"
              />
              <Kpi
                label="Shield volume"
                value={`${oc?.shieldVolumeEth ?? "0"} ETH`}
                sub="native only"
              />
              <Kpi
                label="Private sends"
                value={String(oc?.transfers ?? 0)}
                sub="Transferred events"
              />
              <Kpi
                label="Product events"
                value={String(product?.totalEvents ?? 0)}
                sub={product?.backend ?? "—"}
              />
            </section>

            <section className="grid gap-3 sm:grid-cols-3">
              <Kpi
                label="Public open"
                value={data?.launch?.open ? "Yes" : "No"}
                sub={
                  data?.launch?.opensAt
                    ? new Date(data.launch.opensAt).toLocaleString()
                    : "—"
                }
              />
              <Kpi
                label="Note slots"
                value={String(oc?.notes ?? 0)}
                sub={`block ${oc?.latestBlock ?? "—"}`}
              />
              <Kpi
                label="Unshield vol"
                value={`${oc?.unshieldVolumeEth ?? "0"} ETH`}
                sub={`${oc?.unshields ?? 0} exits`}
              />
            </section>

            {ocError && (
              <p className="text-sm text-red-400">On-chain: {ocError}</p>
            )}

            <div className="grid gap-6 lg:grid-cols-2">
              <Panel title="On-chain activity">
                <BarChart rows={activityBars} />
              </Panel>
              <Panel title="Product funnel">
                {funnelBars.length === 0 ? (
                  <p className="text-sm text-mute">No product events yet</p>
                ) : (
                  <BarChart rows={funnelBars.map((r) => ({ k: r.k, v: r.v, pct: r.pct }))} />
                )}
              </Panel>
            </div>

            {(oc?.poolBalances?.length ?? 0) > 0 && (
              <Panel title="Pool balances (deposited)">
                <DataTable
                  headers={["Asset", "Amount"]}
                  rows={(oc?.poolBalances ?? []).map((r) => [
                    r.symbol,
                    r.deposited,
                  ])}
                />
              </Panel>
            )}

            <Panel
              title="Recent txs"
              action={
                oc?.pool ? (
                  <a
                    href={EXPLORER_ADDRESS(oc.pool)}
                    target="_blank"
                    rel="noreferrer"
                    className="font-mono text-[11px] text-lime hover:underline"
                  >
                    Pool →
                  </a>
                ) : null
              }
            >
              <DataTable
                headers={["Kind", "Detail", "Address", "Tx", "Block"]}
                rows={(oc?.recentTxs ?? []).map((tx) => [
                  tx.kind,
                  tx.detail,
                  tx.from ? (
                    <a
                      key="a"
                      href={EXPLORER_ADDRESS(tx.from)}
                      className="font-mono text-mute hover:text-lime"
                      target="_blank"
                      rel="noreferrer"
                    >
                      {shortAddress(tx.from, 4)}
                    </a>
                  ) : (
                    "—"
                  ),
                  <a
                    key="t"
                    href={EXPLORER_TX(tx.txHash)}
                    className="font-mono text-mute hover:text-lime"
                    target="_blank"
                    rel="noreferrer"
                  >
                    {tx.txHash.slice(0, 10)}…
                  </a>,
                  `#${tx.blockNumber}`,
                ])}
                empty="No on-chain events yet"
              />
            </Panel>
          </>
        )}

        {tab === "users" && (
          <Panel title="Shielders (by activity)">
            <p className="mb-4 text-sm text-mute">
              Unique addresses that called shield. Volume ETH is native
              deposits only (not stock tokens).
            </p>
            <DataTable
              headers={["#", "Address", "Shields", "ETH vol", "Explorer"]}
              rows={(oc?.topShielders ?? []).map((u, i) => [
                String(i + 1),
                <span key="addr" className="font-mono text-xs text-foreground">
                  {u.address}
                </span>,
                String(u.shields),
                u.volumeEth,
                <a
                  key="ex"
                  href={EXPLORER_ADDRESS(u.address)}
                  target="_blank"
                  rel="noreferrer"
                  className="text-lime hover:underline"
                >
                  View
                </a>,
              ])}
              empty="No shielders yet"
            />
          </Panel>
        )}

        {tab === "events" && (
          <>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {Object.entries(product?.counters ?? {})
                .filter(([k]) => k !== "total")
                .sort((a, b) => b[1] - a[1])
                .map(([k, v]) => (
                  <Kpi key={k} label={k} value={String(v)} sub="count" />
                ))}
            </div>
            <Panel title="Event stream">
              <DataTable
                headers={["Event", "Path", "Time"]}
                rows={(product?.recent ?? []).map((ev) => [
                  <span key="t" className="font-mono text-lime">
                    {ev.t}
                  </span>,
                  ev.path ?? "—",
                  new Date(ev.ts).toLocaleString(),
                ])}
                empty="No product events — open /app to generate traffic"
              />
            </Panel>
            {product?.backend === "memory" && (
              <p className="text-sm text-mute">
                Backend is memory. Set Upstash{" "}
                <code className="text-lime">UPSTASH_REDIS_REST_*</code> and
                redeploy for durable counts.
              </p>
            )}
          </>
        )}

        <p className="text-[11px] text-mute">
          Generated {data?.generatedAt ?? "—"} ·{" "}
          <Link href="/app" className="text-lime hover:underline">
            Open app
          </Link>
        </p>
      </main>
    </div>
  );
}

function Kpi({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="rounded-xl border border-line bg-panel px-4 py-4">
      <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-mute">
        {label}
      </p>
      <p className="tnum mt-1.5 text-xl font-medium tracking-tight text-foreground sm:text-2xl">
        {value}
      </p>
      {sub && <p className="mt-1 text-[11px] text-mute">{sub}</p>}
    </div>
  );
}

function Panel({
  title,
  children,
  action,
}: {
  title: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <section className="rounded-xl border border-line bg-panel p-4 sm:p-5">
      <div className="mb-4 flex items-center justify-between gap-2">
        <h2 className="font-display text-lg text-foreground">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

function BarChart({
  rows,
}: {
  rows: { k: string; v: number; pct: number }[];
}) {
  if (rows.length === 0) {
    return <p className="text-sm text-mute">No data</p>;
  }
  return (
    <ul className="space-y-3">
      {rows.map((r) => (
        <li key={r.k}>
          <div className="mb-1 flex items-baseline justify-between gap-2 text-xs">
            <span className="truncate font-mono text-mute">{r.k}</span>
            <span className="tnum shrink-0 text-foreground">{r.v}</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-background">
            <div
              className="h-full rounded-full bg-lime transition-[width] duration-500"
              style={{ width: `${Math.max(r.pct, r.v > 0 ? 4 : 0)}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

function DataTable({
  headers,
  rows,
  empty,
}: {
  headers: string[];
  rows: ReactNode[][];
  empty?: string;
}) {
  if (rows.length === 0) {
    return <p className="text-sm text-mute">{empty ?? "No rows"}</p>;
  }
  return (
    <div className="overflow-x-auto rounded-lg border border-line">
      <table className="w-full min-w-[480px] text-left text-sm">
        <thead className="border-b border-line bg-background/80">
          <tr>
            {headers.map((h) => (
              <th
                key={h}
                className="px-3 py-2.5 font-mono text-[10px] font-medium uppercase tracking-[0.12em] text-mute"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr
              key={i}
              className="border-b border-line last:border-0 hover:bg-background/40"
            >
              {row.map((cell, j) => (
                <td key={j} className="px-3 py-2.5 text-mute">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
