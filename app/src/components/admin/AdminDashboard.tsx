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
import { SealedField } from "@/components/ui/SealedField";
import { shortAddress } from "@/lib/chain";
import { useNetwork } from "../app/NetworkProvider";

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
  const { network } = useNetwork();
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
      // Session is valid if we got past 401, don't freeze on metrics failure
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

  // Hooks must run every render (before any early return), React #310
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
          <span className="livedot h-2 w-2 rounded-full bg-foreground/60" />
          <p className="t-label">Verifying session</p>
        </div>
      </div>
    );
  }

  if (!authed) {
    return (
      <div className="flex min-h-dvh flex-col bg-background p-3 sm:p-4">
        <div className="gl-panel flex flex-1 flex-col">
          <SealedField />
          <header className="flex h-16 items-center justify-between px-5 sm:px-8">
            <Logo />
            <span className="rounded-full bg-panel/70 px-3 py-1 text-[12px] text-mute">
              Restricted
            </span>
          </header>

          <main className="flex flex-1 flex-col items-center justify-center px-2 py-12 sm:px-5">
            <div className="w-full max-w-[420px]">
              <div className="gl-glass p-2 shadow-pop">
                <div className="rounded-[12px] bg-panel p-6 sm:p-7">
                  <p className="t-label">Ops console</p>
                  <h1 className="t-display-m mt-3 text-foreground">Traction</h1>
                  <p className="mt-2 text-[14px] leading-relaxed text-mute">
                    On-chain volume, unique wallets, and product funnel. Access
                    code required. Not public.
                  </p>

                  <form onSubmit={onLogin} className="mt-7 space-y-4">
                    <label className="block">
                      <span className="text-[13px] text-mute">Access code</span>
                      <input
                        type="password"
                        autoComplete="current-password"
                        value={code}
                        onChange={(e) => setCode(e.target.value)}
                        placeholder="••••••••••••"
                        className="gl-input mt-2"
                        required
                      />
                    </label>
                    {loginErr && (
                      <p
                        className="rounded-xl bg-danger-soft px-3.5 py-2.5 text-[13px] text-danger"
                        role="alert"
                      >
                        {loginErr}
                      </p>
                    )}
                    <button
                      type="submit"
                      disabled={busy}
                      className="btn btn-ink btn-lg btn-block"
                    >
                      {busy ? "Checking…" : "Enter console"}
                    </button>
                  </form>
                </div>
              </div>
              <p className="mt-5 text-center text-[12px] text-mute">
                Set{" "}
                <code className="rounded-md bg-panel/70 px-1.5 py-0.5 text-foreground">
                  ADMIN_ACCESS_CODE
                </code>{" "}
                on Vercel
              </p>
            </div>
          </main>
        </div>
      </div>
    );
  }

  return (
    <div className="gloam-app min-h-dvh bg-background text-foreground">
      <header className="sticky top-0 z-20 border-b border-line bg-background/85 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-[1200px] items-center justify-between gap-3 px-5 sm:px-8">
          <div className="flex items-center gap-3">
            <Logo />
            <span className="rounded-full border border-line bg-panel px-2.5 py-1 text-[12px] text-mute">
              Admin
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="mr-2 hidden text-[12px] text-mute sm:inline">
              {product?.backend === "redis" ? "Redis" : "Memory"}, refreshes every 45s
            </span>
            <button
              type="button"
              onClick={() => void loadMetrics()}
              className="btn btn-ghost btn-sm"
            >
              Refresh
            </button>
            <button
              type="button"
              onClick={() => void onLogout()}
              className="btn btn-quiet btn-sm"
            >
              Log out
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1200px] space-y-8 px-5 py-10 sm:px-8 sm:py-12">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="t-display-m">Traction</h1>
            <p className="mt-2 text-[14px] text-mute">
              On-chain activity and the product funnel, in one place.
            </p>
          </div>
          {/* Tabs */}
          <div
            role="tablist"
            aria-label="Dashboard sections"
            className="flex self-start rounded-full bg-surface-2 p-1 text-[13px] sm:self-auto"
          >
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
                role="tab"
                aria-selected={tab === id}
                onClick={() => setTab(id)}
                className={`h-9 rounded-full px-3.5 transition-colors sm:px-4 ${
                  tab === id
                    ? "bg-panel font-medium text-foreground shadow-card"
                    : "text-mute hover:text-foreground"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {loadErr && (
          <p className="rounded-xl bg-danger-soft px-4 py-3 text-[14px] text-danger" role="alert">
            {loadErr}
          </p>
        )}

        {tab === "overview" && (
          <>
            <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
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
                sub={product?.backend ?? "unknown"}
              />
            </section>

            <section className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <Kpi
                label="Public open"
                value={data?.launch?.open ? "Yes" : "No"}
                sub={
                  data?.launch?.opensAt
                    ? new Date(data.launch.opensAt).toLocaleString()
                    : "Not scheduled"
                }
              />
              <Kpi
                label="Note slots"
                value={String(oc?.notes ?? 0)}
                sub={`block ${oc?.latestBlock ?? "unknown"}`}
              />
              <Kpi
                label="Unshield vol"
                value={`${oc?.unshieldVolumeEth ?? "0"} ETH`}
                sub={`${oc?.unshields ?? 0} exits`}
              />
            </section>

            {ocError && (
              <p className="rounded-xl bg-danger-soft px-4 py-3 text-[14px] text-danger">
                On-chain: {ocError}
              </p>
            )}

            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
              <Panel title="On-chain activity">
                <BarChart rows={activityBars} />
              </Panel>
              <Panel title="Product funnel">
                {funnelBars.length === 0 ? (
                  <p className="text-[14px] text-mute">No product events yet</p>
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
                    href={network.explorerAddress(oc.pool)}
                    target="_blank"
                    rel="noreferrer"
                    className="t-label inline-flex items-center gap-1.5 text-foreground transition-colors hover:text-sealed"
                  >
                    Pool <span aria-hidden>↗</span>
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
                      href={network.explorerAddress(tx.from)}
                      className="text-mute transition-colors hover:text-foreground"
                      target="_blank"
                      rel="noreferrer"
                    >
                      {shortAddress(tx.from, 4)}
                    </a>
                  ) : (
                    <span key="a" className="text-faint">
                      Not shown
                    </span>
                  ),
                  <a
                    key="t"
                    href={network.explorerTx(tx.txHash)}
                    className="text-mute transition-colors hover:text-foreground"
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
            <p className="mb-4 text-[14px] text-mute">
              Unique addresses that called shield. Volume ETH is native
              deposits only (not stock tokens).
            </p>
            <DataTable
              headers={["#", "Address", "Shields", "ETH vol", "Explorer"]}
              rows={(oc?.topShielders ?? []).map((u, i) => [
                String(i + 1),
                <span key="addr" className="text-[13px] text-foreground">
                  {u.address}
                </span>,
                String(u.shields),
                u.volumeEth,
                <a
                  key="ex"
                  href={network.explorerAddress(u.address)}
                  target="_blank"
                  rel="noreferrer"
                  className="text-foreground underline decoration-line-strong underline-offset-4 transition-colors hover:decoration-foreground"
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
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
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
                  <span key="t" className="text-foreground">
                    {ev.t}
                  </span>,
                  ev.path ?? "None",
                  new Date(ev.ts).toLocaleString(),
                ])}
                empty="No product events, open /app to generate traffic"
              />
            </Panel>
            {product?.backend === "memory" && (
              <p className="text-[14px] text-mute">
                Backend is memory. Set Upstash{" "}
                <code className="rounded-md bg-surface px-1.5 py-0.5 text-foreground">
                  UPSTASH_REDIS_REST_*
                </code>{" "}
                and redeploy for durable counts.
              </p>
            )}
          </>
        )}

        <p className="tnum text-[12px] text-mute">
          Generated {data?.generatedAt ?? "not yet"} ·{" "}
          <Link
            href="/app"
            className="text-foreground underline decoration-line-strong underline-offset-4 transition-colors hover:decoration-foreground"
          >
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
    <div className="gl-card min-w-0 px-4 py-4 sm:px-5 sm:py-5">
      <p className="t-label truncate">{label}</p>
      <p className="tnum mt-3 truncate text-[22px] font-light leading-none tracking-[-0.02em] text-foreground sm:text-[30px]">
        {value}
      </p>
      {sub && <p className="mt-2 truncate text-[12px] text-mute">{sub}</p>}
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
    <section className="gl-card min-w-0 p-5 sm:p-6">
      <div className="mb-5 flex items-center justify-between gap-2">
        <h2 className="text-[17px] tracking-[-0.01em] text-foreground">{title}</h2>
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
    return <p className="text-[14px] text-mute">No data</p>;
  }
  return (
    <ul className="space-y-4">
      {rows.map((r) => (
        <li key={r.k}>
          <div className="mb-1.5 flex items-baseline justify-between gap-2 text-[13px]">
            <span className="truncate text-mute">{r.k}</span>
            <span className="tnum shrink-0 text-foreground">{r.v}</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-surface">
            <div
              className="h-full rounded-full bg-foreground transition-[width] duration-500"
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
    return <p className="text-[14px] text-mute">{empty ?? "No rows"}</p>;
  }
  return (
    <div className="overflow-x-auto rounded-xl border border-line">
      <table className="tnum w-full min-w-[480px] text-left text-[14px]">
        <thead className="border-b border-line bg-surface">
          <tr>
            {headers.map((h) => (
              <th key={h} className="t-label px-4 py-3 font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr
              key={i}
              className="border-b border-line transition-colors last:border-0 hover:bg-surface"
            >
              {row.map((cell, j) => (
                <td key={j} className="h-[52px] whitespace-nowrap px-4 py-2 text-soft">
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
