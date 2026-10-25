"use client";

import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
} from "react";
import { tabIndent } from "@/components/ui/CodeBlock";
import { SealDots } from "@/components/ui/SealDots";
import { SealedField } from "@/components/ui/SealedField";
import { DEMO_MS, jitter, randomHex, sleep } from "@/lib/demo/store";
import { highlight } from "@/lib/highlight";
import { diffLines, diffStats, type DiffLine } from "@/lib/playground/diff";
import {
  SCENARIOS,
  relayPage,
  scenarioById,
  tokenOf,
  vaultPage,
  type AddressPage,
  type PayMode,
  type Scenario,
  type ScenarioId,
} from "@/lib/playground/scenarios";
import { tabKeyTarget } from "@/lib/tabKeys";
import s from "./playground.module.css";

/*
 * The SDK playground. A simulation: no wallet, no chain, no relay. Each run
 * steps through the same moments a real payment has, at the pace of the
 * app's recording demo (lib/demo/store), and lands a pretend transaction in
 * the explorer pane. The code pane is real: it is the file with and without
 * @gloamtrade/sdk, and Copy gives the file with it.
 */

type Run = { mode: PayMode; step: number; running: boolean };
type Tx = { hash: string; mode: PayMode; serial: number; ran: boolean };
type Side = "from" | "to";

/** How long each step holds, public and private, from the demo's own timings. */
const PACE: Record<PayMode, [number, number, number]> = {
  public: [DEMO_MS.wallet, DEMO_MS.confirm, DEMO_MS.lookup],
  private: [DEMO_MS.proof, DEMO_MS.relay, DEMO_MS.confirm],
};

const vars = (v: Record<string, number>) => v as CSSProperties;
const shortHash = (h: string) => `${h.slice(0, 8)}…${h.slice(-6)}`;

export function Playground({ sdkVersion }: { sdkVersion: string }) {
  const [sid, setSid] = useState<ScenarioId>("tip");
  const [gloam, setGloam] = useState(false);
  const [run, setRun] = useState<Run>({ mode: "public", step: 3, running: false });
  const [tx, setTx] = useState<Tx>({ hash: SCENARIOS[0]!.firstTx, mode: "public", serial: 0, ran: false });
  const [open, setOpen] = useState<Side | null>(null);
  const [said, setSaid] = useState("");
  // Each run takes a number; a newer run or a scenario switch makes the old one stop.
  const runId = useRef(0);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  // Add Gloam and Show it without replace each other; focus moves across.
  const addRef = useRef<HTMLButtonElement | null>(null);
  const removeRef = useRef<HTMLButtonElement | null>(null);
  const focusNext = useRef<"add" | "remove" | null>(null);
  const explorerRef = useRef<HTMLElement | null>(null);
  const base = useId();

  useEffect(() => {
    const want = focusNext.current;
    focusNext.current = null;
    if (want === "remove") removeRef.current?.focus();
    else if (want === "add") addRef.current?.focus();
  }, [gloam]);

  useEffect(() => {
    const ref = runId;
    return () => {
      ref.current++;
    };
  }, []);

  const sc = scenarioById(sid);
  const busy = run.running;

  /**
   * Below 1280px the explorer sits above the code, so the payment can land out
   * of sight of the button that sent it. Scroll just enough to show it.
   */
  function showExplorer() {
    const el = explorerRef.current;
    if (!el || el.getBoundingClientRect().top >= 0) return;
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollIntoView({ block: "nearest", behavior: still ? "auto" : "smooth" });
  }

  async function pay(mode: PayMode, from: "app" | "code" = "app") {
    const id = ++runId.current;
    if (from === "code") showExplorer();
    const pace = PACE[mode];
    setSaid("");
    setRun({ mode, step: 0, running: true });
    for (let i = 0; i < 3; i++) {
      await sleep(jitter(pace[i]!));
      if (runId.current !== id) return;
      setRun({ mode, step: i + 1, running: i < 2 });
    }
    setTx((t) => ({ hash: randomHex(32), mode, serial: t.serial + 1, ran: true }));
    setSaid(
      mode === "private"
        ? "Paid with Gloam. The explorer now shows the Gloam relay as the sender, the vault as the receiver, and no amount."
        : `Paid in public. The explorer shows ${sc.payerName}, ${sc.payeeName} and ${sc.amount}.`
    );
  }

  function pick(id: ScenarioId) {
    if (id === sid) return;
    runId.current++;
    const next = scenarioById(id);
    setSid(id);
    setGloam(false);
    setRun({ mode: "public", step: 3, running: false });
    setTx((t) => ({ hash: next.firstTx, mode: "public", serial: t.serial + 1, ran: false }));
    setOpen(null);
    setSaid("");
  }

  function onTabKey(e: KeyboardEvent<HTMLButtonElement>, index: number) {
    const to = tabKeyTarget(e.key, index, SCENARIOS.length);
    if (to === null) return;
    e.preventDefault();
    tabRefs.current[to]?.focus();
    pick(SCENARIOS[to]!.id);
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
        <div role="tablist" aria-label="Scenario" className="inline-flex rounded-full bg-surface p-1">
          {SCENARIOS.map((x, i) => {
            const on = x.id === sid;
            return (
              <button
                key={x.id}
                ref={(el) => {
                  tabRefs.current[i] = el;
                }}
                type="button"
                role="tab"
                id={`${base}-tab-${x.id}`}
                aria-selected={on}
                aria-controls={`${base}-stage`}
                tabIndex={on ? 0 : -1}
                onClick={() => pick(x.id)}
                onKeyDown={(e) => onTabKey(e, i)}
                className={`h-10 rounded-full px-4 text-[14px] transition-colors sm:px-5 ${
                  on ? "bg-panel text-foreground shadow-card" : "text-mute hover:text-foreground"
                }`}
              >
                {x.tab}
              </button>
            );
          })}
        </div>
        <p className="text-[13px] text-soft">Simulation, no real funds</p>
      </div>

      <div
        role="tabpanel"
        id={`${base}-stage`}
        aria-labelledby={`${base}-tab-${sid}`}
        className={`${s.stage} mt-4 rounded-[24px] bg-surface p-2`}
      >
        <AppPane sc={sc} gloam={gloam} run={run} busy={busy} onPay={() => !busy && void pay(gloam ? "private" : "public")} />
        <CodePane
          sc={sc}
          gloam={gloam}
          busy={busy}
          sdkVersion={sdkVersion}
          addRef={addRef}
          removeRef={removeRef}
          onAdd={(byKey) => {
            if (busy) return;
            if (byKey) focusNext.current = "remove";
            setGloam(true);
            void pay("private", "code");
          }}
          onRemove={(byKey) => {
            if (busy) return;
            if (byKey) focusNext.current = "add";
            setGloam(false);
            void pay("public", "code");
          }}
        />
        <ExplorerPane
          sc={sc}
          tx={tx}
          pending={busy}
          open={open}
          setOpen={setOpen}
          base={base}
          sectionRef={explorerRef}
        />
      </div>
      <p className="sr-only" aria-live="polite">
        {said}
      </p>
    </div>
  );
}

/* ---------------------------------------------------------------- the app */

function PaneHead({ title, aside }: { title: string; aside?: ReactNode }) {
  return (
    <div className="flex min-h-12 items-center justify-between gap-3 px-5 pt-3 text-[13px]">
      <h2 className="text-mute">{title}</h2>
      {aside}
    </div>
  );
}

function AppPane({
  sc,
  gloam,
  run,
  busy,
  onPay,
}: {
  sc: Scenario;
  gloam: boolean;
  run: Run;
  busy: boolean;
  onPay: () => void;
}) {
  const steps = sc.steps[run.mode];
  return (
    <section className={`${s.app} rounded-[16px] bg-panel`}>
      <PaneHead title="The app" />
      <div className="px-5 pb-5">
        <p className="text-[14px] leading-snug text-soft">{sc.line}</p>
        <div className="mt-4 rounded-[12px] border border-line p-4">
          <MockApp sc={sc} />
          <p className={`mt-4 text-[13px] ${gloam ? "text-sealed" : "text-mute"}`}>{sc.payTo[gloam ? "private" : "public"]}</p>
          <button
            type="button"
            onClick={onPay}
            aria-disabled={busy || undefined}
            className="btn btn-ghost btn-block mt-3 aria-disabled:cursor-default aria-disabled:opacity-60"
          >
            {sc.action}
          </button>
        </div>
        <ol className="mt-4 space-y-1" aria-label="What happened">
          {steps.map((label, i) => {
            const state = i < run.step ? "done" : i === run.step && run.running ? "now" : "todo";
            return (
              <li key={`${run.mode}-${i}`} className="flex min-h-8 items-center gap-2.5 text-[13.5px]">
                <StepMark state={state} />
                <span className={state === "todo" ? "text-faint" : "text-soft"}>
                  <span className="sr-only">{state === "done" ? "Done: " : state === "now" ? "In progress: " : "Next: "}</span>
                  {label}
                </span>
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}

function StepMark({ state }: { state: "done" | "now" | "todo" }) {
  if (state === "done") {
    return (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden className="shrink-0 text-foreground">
        <path d="M5 12.5l4.2 4.2L19 7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  if (state === "now") {
    return (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden className={`shrink-0 text-foreground ${s.spin}`}>
        <circle cx="12" cy="12" r="7.5" stroke="currentColor" strokeOpacity="0.2" strokeWidth="1.8" />
        <path d="M12 4.5a7.5 7.5 0 0 1 7.5 7.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    );
  }
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden className="shrink-0 text-faint">
      <circle cx="12" cy="12" r="7.5" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

/** Each scenario's app, as small as it can be and still be the thing. */
function MockApp({ sc }: { sc: Scenario }) {
  if (sc.id === "tip") {
    return (
      <div>
        <p className="text-[17px] leading-snug text-foreground">Ines Moreau</p>
        <p className="mt-1 text-[13.5px] leading-relaxed text-mute">A weekly letter on how cities move.</p>
      </div>
    );
  }
  if (sc.id === "checkout") {
    return (
      <div>
        <div className="flex items-baseline justify-between gap-3">
          <p className="text-[15px] text-foreground">Ostra Studio</p>
          <p className="text-[13px] text-mute">Invoice 1042</p>
        </div>
        <div className="mt-3 flex items-baseline justify-between gap-3 border-t border-line pt-3">
          <p className="text-[13.5px] text-soft">Product shoot, 12 photos</p>
          <p className="tnum whitespace-nowrap text-[14px] text-foreground">120.00 USDC.e</p>
        </div>
        <p className="mt-1 text-[12.5px] text-mute">Due 31 Oct</p>
      </div>
    );
  }
  return (
    <div>
      <p className="text-[15px] text-foreground">research-agent</p>
      <p className="mt-1 text-[13px] leading-relaxed text-mute [overflow-wrap:anywhere]">GET api.example.com/v1/summarize</p>
    </div>
  );
}

/* ---------------------------------------------------------------- the code */

function CodePane({
  sc,
  gloam,
  busy,
  sdkVersion,
  addRef,
  removeRef,
  onAdd,
  onRemove,
}: {
  sc: Scenario;
  gloam: boolean;
  busy: boolean;
  sdkVersion: string;
  addRef: RefObject<HTMLButtonElement | null>;
  removeRef: RefObject<HTMLButtonElement | null>;
  /** byKey: the press came from the keyboard (or a screen reader), so focus should follow. */
  onAdd: (byKey: boolean) => void;
  onRemove: (byKey: boolean) => void;
}) {
  // Added lines open one after another, so each carries its place in that order.
  const rows = useMemo(() => {
    let n = 0;
    return diffLines(sc.before, sc.after).map((line) => ({ line, order: line.kind === "add" ? n++ : 0 }));
  }, [sc]);
  const stats = useMemo(() => diffStats(rows.map((r) => r.line)), [rows]);

  return (
    <section className={`${s.code} min-w-0 overflow-hidden rounded-[16px] bg-panel`}>
      <div className="flex min-h-16 flex-wrap items-center gap-x-4 gap-y-2 border-b border-line px-5 py-3">
        {gloam ? (
          <>
            <p className="inline-flex items-center gap-2 text-[14px] text-foreground">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden className="text-sealed">
                <path d="M5 12.5l4.2 4.2L19 7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Gloam added
            </p>
            <button
              ref={removeRef}
              type="button"
              onClick={(e) => onRemove(e.detail === 0)}
              aria-disabled={busy || undefined}
              className="btn btn-quiet btn-sm aria-disabled:cursor-default aria-disabled:opacity-60"
            >
              Show it without
            </button>
          </>
        ) : (
          <>
            <button
              ref={addRef}
              type="button"
              onClick={(e) => onAdd(e.detail === 0)}
              aria-disabled={busy || undefined}
              className="btn btn-ink aria-disabled:cursor-default aria-disabled:opacity-60"
            >
              Add Gloam
            </button>
            <p className="text-[13.5px] text-mute">Shows the change and runs the same payment again.</p>
          </>
        )}
      </div>

      <div className="flex min-h-12 items-center justify-between gap-3 pl-5 pr-2 text-[13px]">
        <p className="min-w-0 truncate">
          <span className="text-foreground">{sc.file}</span>
          <span className="text-mute"> · {gloam ? "with Gloam" : "today"}</span>
        </p>
        {gloam && (
          <div className="flex shrink-0 items-center gap-2 sm:gap-3">
            <p className="tnum whitespace-nowrap" aria-label={`${stats.added} lines added, ${stats.removed} removed`}>
              <span className="text-sealed">+{stats.added}</span> <span className="text-mute">−{stats.removed}</span>
            </p>
            <CopyCode text={sc.after} />
          </div>
        )}
      </div>

      <div
        className={`${s.codeBody} tnum text-soft`}
        tabIndex={0}
        role="region"
        aria-label={gloam ? `${sc.file} with Gloam, as a diff` : `${sc.file} today`}
      >
        <div className={s.lines}>
          {rows.map((r, k) => (
            <CodeLine key={`${sc.id}-${k}`} line={r.line} gloam={gloam} order={r.order} />
          ))}
        </div>
      </div>

      <p className="border-t border-line px-5 py-3 text-[12.5px] text-mute">
        TypeScript, with @gloamtrade/sdk {sdkVersion} and viem
      </p>
    </section>
  );
}

function CodeLine({ line, gloam, order }: { line: DiffLine; gloam: boolean; order: number }) {
  const shown = gloam || line.kind !== "add";
  const marked = gloam && line.kind !== "same";
  const html = useMemo(() => highlight(tabIndent(line.text), "ts") || " ", [line.text]);
  const cls = [s.line, !shown && s.collapsed, marked && line.kind === "add" && s.add, marked && line.kind === "del" && s.del]
    .filter(Boolean)
    .join(" ");
  return (
    <div className={cls} style={vars({ "--i": Math.min(order, 30) })} aria-hidden={!shown || undefined}>
      <div>
        <div className={s.row}>
          <span className={s.sign} aria-hidden>
            {marked ? (line.kind === "add" ? "+" : "−") : " "}
          </span>
          {marked && <span className="sr-only">{line.kind === "add" ? "Added: " : "Removed: "}</span>}
          <code dangerouslySetInnerHTML={{ __html: html }} />
        </div>
      </div>
    </div>
  );
}

/** Copies the file with Gloam. Says so for a moment, or says it could not. */
function CopyCode({ text }: { text: string }) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  const timer = useRef<number | null>(null);
  useEffect(() => () => window.clearTimeout(timer.current ?? undefined), []);
  const settle = (next: "copied" | "failed") => {
    setState(next);
    window.clearTimeout(timer.current ?? undefined);
    timer.current = window.setTimeout(() => setState("idle"), next === "copied" ? 1600 : 3200);
  };
  const label = state === "copied" ? "Copied" : state === "failed" ? "Couldn't copy" : "Copy";
  return (
    <button
      type="button"
      onClick={() => {
        if (!navigator.clipboard) return settle("failed");
        navigator.clipboard.writeText(text).then(
          () => settle("copied"),
          () => settle("failed")
        );
      }}
      aria-label={state === "idle" ? "Copy the code with Gloam" : label}
      className="inline-flex h-10 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-3 text-[13px] font-medium text-foreground transition-colors hover:bg-surface"
    >
      {state === "copied" ? (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
          <path d="M5 12.5l4.2 4.2L19 7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ) : (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
          <rect x="8.5" y="8.5" width="11" height="11" rx="2.5" stroke="currentColor" strokeWidth="1.5" />
          <path d="M15.5 8.5V6.5a2 2 0 0 0-2-2h-7a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h2" stroke="currentColor" strokeWidth="1.5" />
        </svg>
      )}
      <span aria-live="polite">{label}</span>
    </button>
  );
}

/* ---------------------------------------------------------------- the explorer */

function ExplorerPane({
  sc,
  tx,
  pending,
  open,
  setOpen,
  base,
  sectionRef,
}: {
  sc: Scenario;
  tx: Tx;
  pending: boolean;
  open: Side | null;
  setOpen: (s: Side | null) => void;
  base: string;
  sectionRef: RefObject<HTMLElement | null>;
}) {
  const priv = tx.mode === "private";
  const from = priv ? relayPage() : sc.payer;
  const to = priv ? vaultPage(tokenOf(sc)) : sc.payee;
  const page = open === "from" ? from : open === "to" ? to : null;
  const panelId = `${base}-address`;
  // The rows only play their change after a run, never on load or a switch.
  const moved = tx.ran;
  const flash = moved ? (priv ? s.flashPrivate : s.flashPublic) : "";
  const swap = moved ? s.swap : "";
  const k = `${tx.serial}`;

  // A row's tint and its new value are their own keyed layers, so they replay
  // on every new transaction while the row itself (and any focus on it) stays.
  const tint = (i: number) =>
    flash ? (
      <span key={`t-${k}`} aria-hidden className={`${flash} pointer-events-none absolute inset-0 -z-10 rounded-[10px]`} style={vars({ "--i": i })} />
    ) : null;

  const party = (side: Side, p: AddressPage, i: number) => (
    <button
      type="button"
      aria-label={`${side === "from" ? "From" : "To"} ${p.address}, ${p.who}. Its history`}
      aria-expanded={open === side}
      aria-controls={panelId}
      onClick={() => setOpen(open === side ? null : side)}
      className="group relative isolate flex min-h-12 w-full items-center gap-3 rounded-[10px] px-3 text-left transition-colors hover:bg-surface"
    >
      {tint(i)}
      <span className="w-[68px] shrink-0 text-[13px] text-mute">{side === "from" ? "From" : "To"}</span>
      <span key={`v-${k}`} className={`min-w-0 flex-1 ${swap}`} style={vars({ "--i": i })}>
        <span className="tnum block truncate text-[14px] text-foreground underline decoration-line-strong underline-offset-4 group-hover:decoration-foreground">
          {p.address}
        </span>
        <span className="block truncate text-[12.5px] text-mute">{p.who}</span>
      </span>
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        aria-hidden
        className={`shrink-0 text-mute transition-transform duration-200 ${open === side ? "rotate-90" : ""}`}
      >
        <path d="M9 6l6 6-6 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  );

  return (
    <section
      ref={sectionRef}
      className={`${s.explorer} relative isolate min-w-0 scroll-mt-24 overflow-hidden rounded-[16px] bg-panel`}
    >
      <div aria-hidden className={`${s.glow} ${priv ? s.glowOn : ""} pointer-events-none absolute inset-0 -z-10`}>
        <SealedField tone="soft" />
      </div>
      <PaneHead title="What a block explorer shows" aside={<span className="text-mute">{sc.chain}</span>} />
      <div className="px-2 pb-2">
        <div className={`transition-opacity duration-300 ${pending ? "opacity-50" : ""}`}>
          <div className="flex min-h-11 items-center gap-3 px-3">
            <span className="w-[68px] shrink-0 text-[13px] text-mute">Transaction</span>
            <span key={`h-${k}`} className={`tnum min-w-0 flex-1 truncate text-[14px] text-foreground ${swap}`} style={vars({ "--i": 0 })}>
              {shortHash(tx.hash)}
            </span>
            <span className="text-[12.5px] text-mute">Success</span>
          </div>
          {party("from", from, 1)}
          {party("to", to, 2)}
          <div className="relative isolate flex min-h-12 items-center gap-3 rounded-[10px] px-3">
            {tint(3)}
            <span className="w-[68px] shrink-0 text-[13px] text-mute">Amount</span>
            <span key={`a-${k}`} className={`min-w-0 flex-1 ${swap}`} style={vars({ "--i": 3 })}>
              {priv ? (
                <span className="inline-flex items-center gap-2.5 text-sealed">
                  <SealDots n={6} label="Amount not on chain" />
                  <span className="text-[13px]">Not on chain</span>
                </span>
              ) : (
                <span className="tnum text-[15px] text-foreground">{sc.amount}</span>
              )}
            </span>
          </div>
          <div className="relative isolate flex min-h-12 items-center gap-3 rounded-[10px] px-3">
            {tint(4)}
            <span className="w-[68px] shrink-0 text-[13px] text-mute">Call</span>
            <span key={`c-${k}`} className={`min-w-0 flex-1 ${swap}`} style={vars({ "--i": 4 })}>
              <span className="block text-[14px] text-foreground">transfer</span>
              <span className="block text-[12.5px] text-mute [overflow-wrap:anywhere]">
                {priv ? "proof, root, nullifier, commitments" : "to, amount"}
              </span>
            </span>
          </div>
        </div>

        <p className="mx-3 mt-2 border-t border-line pb-2 pt-3 text-[13.5px] leading-relaxed text-soft">
          {pending
            ? "A new payment is on its way."
            : priv
              ? "The chain shows the relay paying into the vault. Not who paid, who got paid, or how much."
              : `Anyone can see ${sc.payerName} paid ${sc.payeeName} ${sc.amount}, and open either wallet's history.`}
        </p>

        <div id={panelId}>{page && <AddressPanel page={page} onClose={() => setOpen(null)} />}</div>
      </div>
    </section>
  );
}

function AddressPanel({ page, onClose }: { page: AddressPage; onClose: () => void }) {
  return (
    <div className="mt-1 rounded-[12px] bg-surface px-3 pb-2 pt-3" role="region" aria-label={`${page.who}, ${page.address}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 pl-1">
          <p className="text-[14px] text-foreground">
            <span className="tnum">{page.address}</span> <span className="text-mute">· {page.who}</span>
          </p>
          <p className="mt-1 text-[13px] leading-relaxed text-mute">{page.line}</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="-mr-1 -mt-1 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-mute transition-colors hover:bg-panel hover:text-foreground"
          aria-label="Close"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
        </button>
      </div>
      {page.balance && (
        <p className="mt-3 flex items-baseline justify-between gap-3 pl-1 text-[13px]">
          <span className="text-mute">Balance</span>
          <span className="tnum text-[15px] text-foreground">{page.balance}</span>
        </p>
      )}
      <ul className="mt-2 divide-y divide-line">
        {page.rows.map((r, i) => (
          <li key={i} className="flex min-h-11 items-center gap-3 py-1.5 pl-1 text-[13px]">
            <span className="w-[74px] shrink-0 text-mute">{r.when}</span>
            <span className="min-w-0 flex-1">
              <span className="block text-soft">{r.what}</span>
              {r.hint && <span className="block text-[12px] text-mute">{r.hint}</span>}
            </span>
            {r.amount ? (
              <span className="tnum whitespace-nowrap text-foreground">{r.amount}</span>
            ) : (
              <SealDots n={4} className="text-sealed" label="No amount on chain" />
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
