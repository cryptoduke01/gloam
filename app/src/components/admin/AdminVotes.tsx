"use client";

import { useEffect, useMemo, useState } from "react";
import { formatGloam, percentOf, type Ballot } from "@/lib/vote/core";
import type { VoteSummary } from "@/lib/vote/results";
import type { Feedback } from "@/lib/vote/feedback";
import { DataTable, Kpi, Panel } from "./AdminDashboard";

type Data = {
  backend: string;
  kept: { ballots: string; feedback: string };
  votes: { summary: VoteSummary; ballots: Ballot[] }[];
  feedback: Feedback[];
};

const REFRESH_MS = 60_000;
const n = (v: number) => v.toLocaleString("en-US");

function Chips<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-1.5">
      {options.map(([v, text]) => (
        <button
          key={v}
          type="button"
          role="radio"
          aria-checked={value === v}
          onClick={() => onChange(v)}
          className={`min-h-9 rounded-full border px-3 text-[13px] transition-colors ${
            value === v ? "border-foreground bg-foreground text-panel" : "border-line text-mute hover:text-foreground"
          }`}
        >
          {text}
        </button>
      ))}
    </div>
  );
}

/** Admin: every vote's tallies and ballots, and the private feedback, with filters and exports. */
export function VotesPanel() {
  const [data, setData] = useState<(Data & { loadedAt: number }) | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [vote, setVote] = useState<string>("all");
  const [option, setOption] = useState<string>("all");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string>("all");

  useEffect(() => {
    let live = true;
    const load = async () => {
      try {
        const res = await fetch("/api/admin/votes", { credentials: "include", cache: "no-store" });
        const json = (await res.json().catch(() => null)) as { ok?: boolean; data?: Data; error?: { message?: string } } | null;
        if (!live) return;
        if (!res.ok || !json?.ok || !json.data) {
          setErr(json?.error?.message ?? `Votes failed (${res.status})`);
          return;
        }
        setErr(null);
        setData({ ...json.data, loadedAt: Date.now() });
      } catch {
        if (live) setErr("Network error loading votes");
      }
    };
    void load();
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, REFRESH_MS);
    return () => {
      live = false;
      window.clearInterval(id);
    };
  }, []);

  const rows = useMemo(() => {
    if (!data) return [];
    const q = query.trim().toLowerCase();
    return data.votes
      .filter((v) => vote === "all" || v.summary.id === vote)
      .flatMap((v) => v.ballots.map((b) => ({ vote: v.summary, b })))
      .filter(({ b }) => (option === "all" || String(b.option) === option) && (!q || b.voter.toLowerCase().includes(q)))
      .sort((a, b) => b.b.receivedAt - a.b.receivedAt);
  }, [data, vote, option, query]);

  const notes = useMemo(() => {
    if (!data) return [];
    const q = query.trim().toLowerCase();
    return data.feedback.filter((f) => (category === "all" || f.category === category) && (!q || f.author.toLowerCase().includes(q) || f.message.toLowerCase().includes(q)));
  }, [data, category, query]);

  if (err) {
    return (
      <p className="rounded-xl bg-danger-soft px-4 py-3 text-[14px] text-danger" role="alert">
        {err}
      </p>
    );
  }
  if (!data) {
    return (
      <p className="rounded-xl bg-surface px-4 py-3 text-[14px] text-mute" role="status">
        Loading votes
      </p>
    );
  }

  const one = vote === "all" ? null : data.votes.find((v) => v.summary.id === vote) ?? null;
  const wallets = new Set(data.votes.flatMap((v) => v.ballots.map((b) => b.voter.toLowerCase()))).size;
  const dayAgo = data.loadedAt - 86_400_000;

  return (
    <>
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Votes" value={n(data.votes.length)} sub={`${n(data.votes.filter((v) => v.summary.status === "open").length)} open now`} />
        <Kpi label="Wallets that voted" value={n(wallets)} sub="in any vote" />
        <Kpi label="Ballots" value={n(data.votes.reduce((s, v) => s + v.ballots.length, 0))} sub={`${n(data.votes.reduce((s, v) => s + v.ballots.filter((b) => b.receivedAt > dayAgo).length, 0))} in the last 24h`} />
        <Kpi label="Feedback notes" value={n(data.feedback.length)} sub={`${n(data.feedback.filter((f) => f.receivedAt > dayAgo).length)} in the last 24h`} />
      </section>

      <Panel
        title="Tallies"
        action={
          <a href="/api/admin/votes?download=1" className="btn btn-ghost btn-sm">
            All data (JSON)
          </a>
        }
      >
        <DataTable
          headers={["Vote", "Status", "Answer", "Share", "GLOAM", "Wallets"]}
          rows={data.votes.flatMap((v) => {
            const total = BigInt(v.summary.totals.weight);
            return v.summary.totals.options.map((o, i) => [
              i === 0 ? <span key="q" className="text-foreground">{v.summary.question}</span> : "",
              i === 0 ? (v.summary.draft ? "Draft" : v.summary.status) : "",
              o.label,
              `${percentOf(BigInt(o.weight), total)}%`,
              formatGloam(o.weight),
              n(o.wallets),
            ]);
          })}
          empty="No votes configured"
          minWidth={820}
        />
      </Panel>

      <Panel
        title="Every vote"
        action={
          <a href={`/api/admin/votes?format=csv&kind=votes${vote === "all" ? "" : `&vote=${encodeURIComponent(vote)}`}`} className="btn btn-ghost btn-sm">
            CSV
          </a>
        }
      >
        <div className="mb-4 flex flex-col gap-3">
          <Chips
            label="Vote"
            value={vote}
            onChange={(v) => {
              setVote(v);
              setOption("all");
            }}
            options={[["all", "All votes"], ...data.votes.map((v) => [v.summary.id, v.summary.question] as [string, string])]}
          />
          {one && (
            <Chips label="Answer" value={option} onChange={setOption} options={[["all", "Any answer"], ...one.summary.options.map((o, i) => [String(i), o] as [string, string])]} />
          )}
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter by wallet (or feedback text)"
            aria-label="Filter by wallet or feedback text"
            className="gl-input max-w-[420px]"
          />
        </div>
        <DataTable
          headers={["Wallet", "Vote", "Answer", "GLOAM", "Signed (UTC)", "Signature"]}
          rows={rows.map(({ vote: v, b }) => [
            <span key="w" className="font-mono text-[12.5px]" title={b.voter}>
              {b.voter}
            </span>,
            v.id,
            b.choice,
            formatGloam(b.weight),
            new Date(b.timestamp * 1000).toISOString().replace("T", " ").slice(0, 19),
            <span key="s" className="block max-w-[180px] truncate font-mono text-[12px] text-mute" title={b.signature}>
              {b.signature}
            </span>,
          ])}
          empty={data.backend === "none" ? "Vote storage is not configured (set Upstash Redis)." : "No votes match"}
          minWidth={1100}
        />
      </Panel>

      <Panel
        title="Feedback (private)"
        action={
          <a href="/api/admin/votes?format=csv&kind=feedback" className="btn btn-ghost btn-sm">
            CSV
          </a>
        }
      >
        <div className="mb-4">
          <Chips
            label="Kind"
            value={category}
            onChange={setCategory}
            options={[
              ["all", "All"],
              ["Feature", "Feature"],
              ["Bug", "Bug"],
              ["Idea", "Idea"],
              ["Other", "Other"],
            ]}
          />
        </div>
        <DataTable
          headers={["Wallet", "Kind", "Note", "Sent (UTC)"]}
          rows={notes.map((f) => [
            <span key="w" className="font-mono text-[12.5px]" title={f.author}>
              {f.author}
            </span>,
            f.category,
            <span key="m" className="block max-w-[560px] whitespace-pre-wrap text-foreground">
              {f.message}
            </span>,
            new Date(f.receivedAt).toISOString().replace("T", " ").slice(0, 16),
          ])}
          empty={data.backend === "none" ? "Feedback storage is not configured (set Upstash Redis)." : "No feedback yet"}
          minWidth={980}
        />
        <p className="mt-4 text-[13px] leading-relaxed text-mute">
          Notes are signed by a wallet that could vote, private to the team and never shown on the site. Kept in Redis ({data.backend}) with no
          expiry: ballots until deleted, feedback the {data.kept.feedback} notes.
        </p>
      </Panel>
    </>
  );
}
