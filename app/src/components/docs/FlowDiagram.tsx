import { SealedField } from "@/components/ui/SealedField";
import { SealDots } from "@/components/ui/SealDots";

/**
 * Step diagrams for the docs and whitepaper. Rendered inside `.docs-prose`, so
 * everything here is built from spans and divs: prose rules style bare p, li
 * and a tags, and these cards should not inherit them.
 */

export type FlowStep = {
  n: string;
  title: string;
  body: string;
};

type Marker =
  | { kind: "step"; label: string }
  | { kind: "yes" | "caveat" | "no" | "live" | "planned" };

function readMarker(n: string): Marker {
  const t = n.trim();
  if (/^\d+$/.test(t)) return { kind: "step", label: `Step ${Number(t)}` };
  if (t === "✓") return { kind: "yes" };
  if (t === "!") return { kind: "caveat" };
  if (t === "✕" || t === "×") return { kind: "no" };
  if (t === "●") return { kind: "live" };
  if (t === "○") return { kind: "planned" };
  return { kind: "step", label: t };
}

function StepMarker({ n }: { n: string }) {
  const m = readMarker(n);
  if (m.kind === "step") {
    return <span className="t-label tnum block">{m.label}</span>;
  }
  if (m.kind === "live" || m.kind === "planned") {
    const live = m.kind === "live";
    return (
      <span
        className={`inline-flex h-6 items-center gap-1.5 self-start rounded-full px-2.5 text-[11.5px] font-medium ${
          live ? "bg-panel text-foreground" : "text-mute ring-1 ring-inset ring-line-strong"
        }`}
      >
        <span
          aria-hidden
          className={`h-1.5 w-1.5 rounded-full ${
            live ? "bg-foreground" : "ring-1 ring-inset ring-current"
          }`}
        />
        {live ? "Live" : "Planned"}
      </span>
    );
  }
  const map = {
    yes: { cls: "bg-sealed-soft text-sealed", label: "Yes", path: "M5 12.5l4.2 4.2L19 7" },
    caveat: { cls: "bg-warn-soft text-warn", label: "Caveat", path: "M12 6.5v7M12 17.5h.01" },
    no: { cls: "bg-panel text-mute", label: "Not live", path: "M7 7l10 10M17 7L7 17" },
  } as const;
  const s = map[m.kind];
  return (
    <span className={`grid h-7 w-7 place-items-center self-start rounded-full ${s.cls}`}>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
        <path d={s.path} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <span className="sr-only">{s.label}</span>
    </span>
  );
}

function gridCols(n: number) {
  if (n <= 1) return "";
  if (n === 2 || n === 4) return "sm:grid-cols-2";
  return "sm:grid-cols-2 md:grid-cols-3";
}

export function FlowDiagram({
  title,
  subtitle,
  steps,
}: {
  title: string;
  subtitle?: string;
  steps: FlowStep[];
}) {
  return (
    <figure className="my-10 rounded-[22px] border border-line p-2 sm:p-2.5">
      <figcaption className="flex flex-col gap-1 px-3 pb-3.5 pt-3 sm:px-3.5">
        <span className="t-label">{title}</span>
        {subtitle && <span className="text-[13.5px] leading-snug text-mute">{subtitle}</span>}
      </figcaption>
      {steps.length > 6 ? (
        /* long boards read better as rows than as a wall of cards */
        <div className="gl-tile divide-y divide-line">
          {steps.map((s, i) => (
            <div
              key={`${s.n}-${i}`}
              className="grid gap-3 px-5 py-4 sm:grid-cols-[104px_minmax(0,1fr)] sm:gap-5"
            >
              <span className="flex sm:pt-0.5">
                <StepMarker n={s.n} />
              </span>
              <span className="block min-w-0">
                <span className="block text-[16px] leading-snug tracking-[-0.01em] text-foreground">
                  {s.title}
                </span>
                <span className="mt-1 block text-[14px] leading-[1.55] text-mute">{s.body}</span>
              </span>
            </div>
          ))}
        </div>
      ) : (
        <div className={`grid gap-2 ${gridCols(steps.length)}`}>
          {steps.map((s, i) => (
            <div key={`${s.n}-${i}`} className="gl-tile flex flex-col p-5">
              <StepMarker n={s.n} />
              <span className="mt-4 block text-[16px] leading-snug tracking-[-0.01em] text-foreground">
                {s.title}
              </span>
              <span className="mt-1.5 block text-[14px] leading-[1.55] text-mute">{s.body}</span>
            </div>
          ))}
        </div>
      )}
    </figure>
  );
}

/** Wallet, vault, exit: what the explorer can read at each stage. */
export function PoolPicture({
  title = "Where your money sits",
}: {
  title?: string;
}) {
  const stages = [
    {
      label: "Your wallet",
      state: "Public",
      shows: <span className="tnum text-foreground">1,000 USDG</span>,
      body: "Anyone can see the balance if they know the address.",
      sealed: false,
    },
    {
      label: "Gloam vault",
      state: "Private",
      shows: <SealDots n={6} className="text-foreground/70" />,
      body: "Money sits in the shared vault. You hold a private note that proves it is yours.",
      sealed: true,
    },
    {
      label: "After cash out",
      state: "Public again",
      shows: <span className="tnum text-foreground">400 USDG</span>,
      body: "Leaving the vault is public on purpose: the money goes back to a wallet.",
      sealed: false,
    },
  ];

  return (
    <figure className="my-10 rounded-[22px] border border-line p-2 sm:p-2.5">
      <figcaption className="px-3 pb-3.5 pt-3 sm:px-3.5">
        <span className="t-label">{title}</span>
      </figcaption>
      <div className="grid gap-2 sm:grid-cols-3">
        {stages.map((s) => (
          <div
            key={s.label}
            className="gl-tile relative isolate flex flex-col overflow-hidden p-5"
          >
            {s.sealed && <SealedField tone="soft" />}
            <span className="relative flex items-center justify-between gap-3">
              <span className="text-[13px] text-mute">{s.label}</span>
              {s.sealed && (
                <span className="inline-flex items-center gap-1.5 text-[12px] font-medium text-sealed">
                  <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-sealed" />
                  Only you
                </span>
              )}
            </span>
            <span className="relative mt-3 block text-[22px] font-light leading-tight tracking-[-0.015em] text-foreground">
              {s.state}
            </span>
            <span className="relative mt-4 flex flex-col gap-1.5 rounded-xl bg-panel px-3.5 py-3">
              <span className="text-[12px] text-mute">Explorer shows</span>
              <span className="flex h-5 items-center text-[15px]">{s.shows}</span>
            </span>
            <span className="relative mt-4 block text-[14px] leading-[1.55] text-mute">{s.body}</span>
          </div>
        ))}
      </div>
    </figure>
  );
}
