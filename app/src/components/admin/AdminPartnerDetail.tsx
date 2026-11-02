"use client";

import { useCallback, useEffect, useState, type ChangeEvent, type ReactNode } from "react";
import { PartnerBreakdown, type BreakdownStats } from "@/components/partners/PartnerBreakdown";
import type { BackfillResult } from "@/lib/partnerBackfill";

/**
 * Admin > Partners, one partner: their figures by source, kind, day and token
 * (the same view the partner sees), the link codes Gloam issued them or they
 * made, and their own receiving addresses for the on-chain match.
 */

type CodeView = {
  code: string;
  label: string;
  createdAt: number;
  createdBy: "partner" | "admin";
  expiresAt: number | null;
  revokedAt: number | null;
  state: "live" | "revoked" | "expired";
};

type Detail = {
  partner: { id: string; name: string };
  stats: BreakdownStats;
  codes: CodeView[];
  addresses: Record<string, string[]>;
  addressCount: number;
  chains: { chainId: number; key: string; name: string }[];
  notMatched: { privatePayments: string; swaps: string };
};

type Envelope<T> = { ok?: boolean; data?: T; error?: { message?: string } };

async function call<T>(url: string, init?: { method: string; body: unknown }): Promise<T> {
  const res = await fetch(url, {
    method: init?.method ?? "GET",
    credentials: "include",
    cache: "no-store",
    headers: init ? { "Content-Type": "application/json" } : undefined,
    body: init ? JSON.stringify(init.body) : undefined,
  });
  const json = (await res.json().catch(() => null)) as Envelope<T> | null;
  if (!res.ok || !json?.ok || !json.data) throw new Error(json?.error?.message ?? `Failed (${res.status})`);
  return json.data;
}

function Box({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return (
    <section className="rounded-xl border border-line p-4 sm:p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-[15px] text-foreground">{title}</h3>
        {action}
      </div>
      {children}
    </section>
  );
}

function ErrorLine({ text }: { text: string | null }) {
  return text ? (
    <p className="mt-2 text-[13px] text-danger" role="alert">
      {text}
    </p>
  ) : null;
}

const when = (ms: number | null) => (ms ? new Date(ms).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "Never");

export function AdminPartnerDetail({ id, onChanged }: { id: string; onChanged: () => void }) {
  const [d, setD] = useState<Detail | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setD(await call<Detail>(`/api/partners/admin/partner?id=${encodeURIComponent(id)}`));
      setErr(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not load this partner");
    }
  }, [id]);

  useEffect(() => {
    const t = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(t);
  }, [load]);

  if (err) return <ErrorLine text={err} />;
  if (!d) {
    return (
      <p className="flex items-center gap-2.5 py-3 text-[14px] text-mute" role="status">
        <span className="livedot h-2 w-2 rounded-full bg-foreground/60" />
        Loading {id}
      </p>
    );
  }
  const changed = () => {
    void load();
    onChanged();
  };
  return (
    <div className="space-y-4">
      <PartnerBreakdown
        stats={d.stats}
        days={30}
        notMatched={d.notMatched}
        csv={{
          daily: `/api/partners/admin/export?id=${encodeURIComponent(d.partner.id)}&type=daily`,
          transactions: `/api/partners/admin/export?id=${encodeURIComponent(d.partner.id)}&type=transactions`,
        }}
      />
      <div className="grid gap-4 lg:grid-cols-2">
        <Codes id={d.partner.id} codes={d.codes} onChanged={changed} />
        <Addresses id={d.partner.id} addresses={d.addresses} count={d.addressCount} chains={d.chains} onChanged={changed} />
      </div>
    </div>
  );
}

function Codes({ id, codes, onChanged }: { id: string; codes: CodeView[]; onChanged: () => void }) {
  const [label, setLabel] = useState("");
  const [days, setDays] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [made, setMade] = useState<string | null>(null);

  async function run(key: string, body: Record<string, unknown>) {
    setBusy(key);
    setErr(null);
    try {
      const r = await call<{ code: CodeView }>("/api/partners/admin/partner", { method: "POST", body: { id, ...body } });
      if (body.action === "issueCode") {
        setMade(r.code.code);
        setLabel("");
        setDays("");
      }
      onChanged();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "That did not work");
    } finally {
      setBusy(null);
    }
  }

  return (
    <Box title="Link codes">
      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void run("issue", { action: "issueCode", label, expiresInDays: days.trim() ? Number(days) : undefined });
        }}
      >
        <label className="min-w-[160px] flex-1 text-[12.5px] text-mute">
          Label
          <input className="gl-input mt-1 h-10 text-[14px]" maxLength={40} value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Fund button" />
        </label>
        <label className="w-[120px] text-[12.5px] text-mute">
          Expires in days
          <input className="gl-input mt-1 h-10 text-[14px]" inputMode="numeric" value={days} onChange={(e) => setDays(e.target.value.replace(/\D/g, ""))} placeholder="Never" />
        </label>
        <button type="submit" disabled={busy !== null} className="btn btn-ink btn-sm h-10">
          {busy === "issue" ? "Issuing" : "Issue code"}
        </button>
      </form>
      {made && (
        <p className="mt-3 rounded-xl bg-surface px-3.5 py-2.5 text-[13px] text-soft">
          New code <span className="tnum select-all text-foreground">{made}</span>. Send it to the partner; it goes in their links as{" "}
          <span className="tnum">p={made}</span>.
        </p>
      )}
      <ErrorLine text={err} />
      {codes.length === 0 ? (
        <p className="mt-3 text-[13.5px] text-mute">No codes yet.</p>
      ) : (
        <ul className="mt-3 divide-y divide-line rounded-xl border border-line">
          {codes.map((c) => (
            <li key={c.code} className={`flex flex-wrap items-center gap-x-3 gap-y-1 px-3.5 py-2.5 text-[13px] ${c.state === "live" ? "" : "opacity-60"}`}>
              <span className="tnum min-w-0 flex-1 select-all text-foreground [overflow-wrap:anywhere]">{c.code}</span>
              <span className="text-mute">
                {c.label || "No label"} · {c.state === "live" ? "Live" : c.state === "revoked" ? "Revoked" : "Expired"} · {c.createdBy === "admin" ? "by Gloam" : "by partner"} ·
                expires {when(c.expiresAt)}
              </span>
              {c.state === "live" && (
                <button
                  type="button"
                  disabled={busy !== null}
                  onClick={() => void run(c.code, { action: "revokeCode", code: c.code })}
                  className="rounded-full border border-line px-3 py-1 text-[12.5px] text-danger hover:border-line-strong disabled:opacity-50"
                >
                  {busy === c.code ? "Revoking" : "Revoke"}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </Box>
  );
}

function Addresses({
  id,
  addresses,
  count,
  chains,
  onChanged,
}: {
  id: string;
  addresses: Record<string, string[]>;
  count: number;
  chains: Detail["chains"];
  onChanged: () => void;
}) {
  const [text, setText] = useState("");
  const [chain, setChain] = useState<string>(String(chains[0]?.chainId ?? ""));
  const [mode, setMode] = useState<"add" | "replace">("add");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [result, setResult] = useState<{ read: number; rejectedCount: number; rejected: { line: number; reason: string }[] } | null>(null);
  const [showAll, setShowAll] = useState(false);

  async function save() {
    setBusy(true);
    setErr(null);
    setResult(null);
    try {
      const r = await call<{ read: number; rejectedCount: number; rejected: { line: number; reason: string }[] }>("/api/partners/admin/partner", {
        method: "POST",
        body: { id, action: "setAddresses", text, chainId: chain ? Number(chain) : null, mode },
      });
      setResult(r);
      setText("");
      onChanged();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not save");
    } finally {
      setBusy(false);
    }
  }

  async function onFile(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    if (f.size > 300_000) {
      setErr("That file is too large. Up to 5,000 addresses.");
      return;
    }
    setText(await f.text());
  }

  const name = (chainId: string) => chains.find((c) => String(c.chainId) === chainId)?.name ?? chainId;
  return (
    <Box title={`Receiving addresses (${count.toLocaleString("en-US")})`}>
      <p className="text-[13px] leading-relaxed text-mute">
        The partner&apos;s own addresses only, per mainnet. The on-chain match counts past cash outs that paid one of them. Nothing about
        who sent the money is kept.
      </p>
      {count > 0 && (
        <div className="mt-3 rounded-xl bg-surface px-3.5 py-2.5 text-[12.5px] text-soft">
          {Object.entries(addresses).map(([c, list]) => (
            <p key={c}>
              {name(c)}: {list.length.toLocaleString("en-US")}
            </p>
          ))}
          <button type="button" className="mt-1 underline underline-offset-4" onClick={() => setShowAll((v) => !v)}>
            {showAll ? "Hide the list" : "Show the list"}
          </button>
          {showAll && (
            <pre className="tnum mt-2 max-h-48 overflow-auto whitespace-pre-wrap text-[12px] text-foreground">
              {Object.entries(addresses)
                .flatMap(([c, list]) => list.map((a) => `${name(c)},${a}`))
                .join("\n")}
            </pre>
          )}
        </div>
      )}
      <textarea
        className="gl-input mt-3 min-h-[110px] w-full py-2.5 font-mono text-[12.5px]"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={"0x… one per line, or chain,address\nTempo,0x…"}
        aria-label="Addresses to add"
      />
      <div className="mt-2 flex flex-wrap items-center gap-2 text-[12.5px] text-mute">
        <label className="inline-flex items-center gap-1.5">
          Lines with no chain are on
          <select className="gl-input h-9 w-auto py-0 text-[13px]" value={chain} onChange={(e) => setChain(e.target.value)}>
            {chains.map((c) => (
              <option key={c.chainId} value={c.chainId}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label className="inline-flex items-center gap-1.5">
          <select className="gl-input h-9 w-auto py-0 text-[13px]" value={mode} onChange={(e) => setMode(e.target.value as "add" | "replace")}>
            <option value="add">Add to the list</option>
            <option value="replace">Replace the list</option>
          </select>
        </label>
        <label className="btn btn-ghost btn-sm cursor-pointer">
          Upload CSV
          <input type="file" accept=".csv,.txt,text/csv,text/plain" className="sr-only" onChange={(e) => void onFile(e)} />
        </label>
        <button type="button" disabled={busy || (!text.trim() && mode === "add")} onClick={() => void save()} className="btn btn-ink btn-sm">
          {busy ? "Saving" : mode === "replace" && !text.trim() ? "Clear the list" : "Save"}
        </button>
      </div>
      <ErrorLine text={err} />
      {result && (
        <div className="mt-2 text-[12.5px] text-soft" role="status">
          <p>
            Read {result.read.toLocaleString("en-US")} {result.read === 1 ? "address" : "addresses"}
            {result.rejectedCount ? `, left out ${result.rejectedCount} ${result.rejectedCount === 1 ? "line" : "lines"}:` : "."}
          </p>
          {result.rejected.length > 0 && (
            <ul className="mt-1 list-disc pl-5 text-warn">
              {result.rejected.slice(0, 8).map((r) => (
                <li key={r.line}>
                  Line {r.line}: {r.reason}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </Box>
  );
}

/** The on-chain match over every mainnet, for every partner's receiving addresses. */
export function AdminBackfill({ onDone }: { onDone: () => void }) {
  const [busy, setBusy] = useState<"dry" | "run" | null>(null);
  const [fromStart, setFromStart] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [r, setR] = useState<BackfillResult | null>(null);

  async function go(dryRun: boolean) {
    setBusy(dryRun ? "dry" : "run");
    setErr(null);
    try {
      const out = await call<BackfillResult>("/api/partners/admin/backfill", { method: "POST", body: { dryRun, from: fromStart ? "deploy" : "cursor" } });
      setR(out);
      if (!dryRun) onDone();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "The pass failed");
    } finally {
      setBusy(null);
    }
  }

  const notDone = r?.chains.some((c) => !c.done && !c.error);
  const label = (m: BackfillResult["matches"][number]) =>
    m.result === "recorded" ? "Counted" : m.result === "would_record" ? "Would count" : m.result === "already_counted" ? "Already counted" : (m.reason ?? "Left out");
  return (
    <Box
      title="Match past cash outs on chain"
      action={
        <span className="flex flex-wrap items-center gap-2">
          <label className="inline-flex items-center gap-1.5 text-[12.5px] text-mute">
            <input type="checkbox" checked={fromStart} onChange={(e) => setFromStart(e.target.checked)} />
            From each vault&apos;s deploy block
          </label>
          <button type="button" disabled={busy !== null} onClick={() => void go(true)} className="btn btn-ghost btn-sm">
            {busy === "dry" ? "Reading…" : "Dry run"}
          </button>
          <button type="button" disabled={busy !== null} onClick={() => void go(false)} className="btn btn-ink btn-sm">
            {busy === "run" ? "Matching…" : "Match and count"}
          </button>
        </span>
      }
    >
      <p className="text-[13px] leading-relaxed text-mute">
        Reads every mainnet vault&apos;s cash outs (Unshielded) and counts the ones that paid a partner&apos;s receiving address, as
        &quot;matched on chain&quot;. Read-only on chain. A transaction already counted, by a link, a key or an earlier pass, is never
        counted again. Past private payments can&apos;t be matched: inside the vault the payee and the amount are hidden. Swaps can&apos;t
        either: a swap&apos;s output goes back into the vault, not to an address. A dry run counts nothing.
      </p>
      <ErrorLine text={err} />
      {r && (
        <div className="mt-3 space-y-2 text-[12.5px] text-soft" role="status">
          <p className="text-foreground">
            {r.dryRun ? "Dry run" : "Pass"} over {r.addresses.toLocaleString("en-US")} {r.addresses === 1 ? "address" : "addresses"} took{" "}
            {(r.ms / 1000).toFixed(1)}s. {r.matches.filter((m) => m.result === (r.dryRun ? "would_record" : "recorded")).length}{" "}
            {r.dryRun ? "would be counted" : "counted"}.
            {notDone ? " Not every chain finished: run it again without the deploy-block box to carry on." : ""}
          </p>
          <ul className="tnum space-y-0.5">
            {r.chains.map((c) => (
              <li key={c.chainId}>
                {c.network}: blocks {c.from} to {c.scannedTo} of {c.to}, {c.queries} queries, {c.logs} cash outs, {c.matches} matched,{" "}
                {(c.ms / 1000).toFixed(1)}s{c.error ? `, failed: ${c.error}` : c.done ? "" : ", not finished"}
              </li>
            ))}
          </ul>
          {r.matches.length > 0 && (
            <ul className="tnum max-h-56 space-y-0.5 overflow-auto rounded-xl bg-surface px-3.5 py-2.5">
              {r.matches.slice(0, 200).map((m) => (
                <li key={`${m.chainId}-${m.txHash}`}>
                  {m.network} {m.txHash.slice(0, 12)}… {m.symbol ?? m.asset.slice(0, 8)} to {m.partnerId}: {label(m)}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </Box>
  );
}
