"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { SealDots } from "@/components/ui/SealDots";

/**
 * A live payroll run, rendered with the same rows, chips and step ticks as the
 * real Payroll screen. It pays five people one after another, shows the
 * receipt, flips to what the public sees, then starts over. Pauses off screen;
 * holds the finished state under reduced motion.
 */

type Status = "queued" | "preparing" | "sending" | "confirming" | "paid";

const PEOPLE = [
  { name: "Duke", face: "/brand/people/memoji/duke.png", kind: "gloam" as const, amt: 6000 },
  { name: "Yomi", face: "/brand/people/memoji/yomi.png", kind: "gloam" as const, amt: 4800 },
  { name: "Robin", face: "/brand/people/memoji/robin.png", kind: "link" as const, amt: 4200 },
  { name: "Romeo", face: "/brand/people/memoji/romeo.png", kind: "gloam" as const, amt: 3600 },
  { name: "Kris", face: "/brand/people/memoji/kris.png", kind: "link" as const, amt: 2900 },
];
const TOTAL = PEOPLE.reduce((a, p) => a + p.amt, 0);

const LABEL: Record<Status, string> = {
  queued: "Waiting",
  preparing: "Preparing",
  sending: "Sending",
  confirming: "Confirming",
  paid: "Paid",
};
const STEP: Partial<Record<Status, number>> = { preparing: 1, sending: 2, confirming: 3 };

// Timeline (ms)
const START = 900;
const PER = 1500; // each person
const RUN_END = START + PEOPLE.length * PER;
const DONE_END = RUN_END + 2600;
const PUBLIC_END = DONE_END + 3800;
const LOOP = PUBLIC_END + 400;

function statusAt(i: number, t: number): Status {
  const s = START + i * PER;
  if (t < s) return "queued";
  const d = t - s;
  if (d < PER * 0.34) return "preparing";
  if (d < PER * 0.67) return "sending";
  if (d < PER) return "confirming";
  return "paid";
}

const fmt = (n: number) => n.toLocaleString("en-US");

function Spinner() {
  return (
    <svg className="h-3 w-3 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.2" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

function Lock() {
  return (
    <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="5" y="10.5" width="14" height="10" rx="2.4" fill="currentColor" />
      <path d="M8.5 10.5V7.5a3.5 3.5 0 0 1 7 0v3" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

export function PayrollLive() {
  const [t, setT] = useState(RUN_END + 600);
  const root = useRef<HTMLDivElement>(null);
  const [still, setStill] = useState(false);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setStill(true);
      return;
    }
    let raf = 0;
    let visible = false;
    let base = performance.now();
    let last = 0;
    const io = new IntersectionObserver(
      ([e]) => {
        visible = !!e?.isIntersecting;
        if (visible) base = performance.now() - last;
      },
      { threshold: 0.2 },
    );
    if (root.current) io.observe(root.current);
    const tick = (now: number) => {
      if (visible) {
        last = (now - base) % LOOP;
        setT(last);
      }
      raf = requestAnimationFrame(tick);
    };
    setT(0);
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      io.disconnect();
    };
  }, []);

  const statuses = PEOPLE.map((_, i) => statusAt(i, t));
  const paidCount = statuses.filter((s) => s === "paid").length;
  const isPublic = !still && t >= DONE_END && t < PUBLIC_END;
  const done = paidCount === PEOPLE.length;
  const progress = Math.min(1, Math.max(0, (t - START) / (RUN_END - START)));
  const paidSoFar = PEOPLE.reduce((a, p, i) => a + (statuses[i] === "paid" ? p.amt : 0), 0);

  return (
    <div ref={root} className="gl-glass w-full max-w-[520px] p-2 shadow-pop">
      <div className="overflow-hidden rounded-[12px] bg-panel">
        {/* header */}
        <div className="flex items-center justify-between gap-3 px-5 pt-4">
          <div className="min-w-0">
            <p className="text-[13px] text-mute">October payroll</p>
            <p className="mt-0.5 text-[15px] text-foreground">5 people, USDG</p>
          </div>
          {done ? (
            <span className="inline-flex h-7 items-center gap-1.5 rounded-full bg-sealed-soft px-3 text-[12.5px] font-medium text-sealed">
              <Lock /> All paid
            </span>
          ) : (
            <span className="tnum inline-flex h-7 items-center gap-1.5 rounded-full bg-surface px-3 text-[12.5px] text-foreground">
              <Spinner /> Paying {Math.min(paidCount + 1, PEOPLE.length)} of {PEOPLE.length}
            </span>
          )}
        </div>

        {/* progress */}
        <div className="mx-5 mt-4 h-1 overflow-hidden rounded-full bg-surface-2">
          <div
            className="h-full rounded-full bg-foreground transition-[width] duration-200 ease-out"
            style={{ width: `${progress * 100}%` }}
          />
        </div>

        {/* view switch */}
        <div className="mx-5 mt-4 flex rounded-full bg-surface p-1 text-[12px]" aria-hidden>
          {["You see", "The public sees"].map((label, i) => {
            const active = (i === 1) === isPublic;
            return (
              <span
                key={label}
                className={`flex h-7 flex-1 items-center justify-center rounded-full transition-colors duration-300 ${
                  active ? "bg-panel text-foreground shadow-card" : "text-mute"
                }`}
              >
                {label}
              </span>
            );
          })}
        </div>

        {/* rows */}
        <ul className="mt-2 divide-y divide-line" aria-label="Payroll run in progress">
          {PEOPLE.map((p, i) => {
            const s = statuses[i]!;
            const busy = s !== "queued" && s !== "paid";
            return (
              <li
                key={p.name}
                className={`flex min-h-[60px] items-center gap-3 px-5 py-2.5 transition-colors duration-300 ${
                  busy && !isPublic ? "bg-surface" : ""
                }`}
              >
                {isPublic ? (
                  <span
                    className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-sealed-soft text-[12px] font-medium text-sealed"
                    aria-hidden
                  >
                    •
                  </span>
                ) : (
                  <Image
                    src={p.face}
                    alt=""
                    width={36}
                    height={36}
                    className="h-9 w-9 shrink-0 rounded-full bg-[#EAEBEF] object-cover ring-1 ring-line"
                  />
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[14px] text-foreground">
                    {isPublic ? "Private transfer" : p.name}
                  </p>
                  <p className="truncate text-[12px] text-mute">
                    {isPublic ? "Sent by Gloam" : p.kind === "gloam" ? "Gloam address" : "Claim link"}
                  </p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <span className="tnum text-[14px] text-foreground">
                    {isPublic ? (
                      <SealDots n={6} className="text-foreground/60" />
                    ) : (
                      <>
                        {fmt(p.amt)} <span className="text-mute">USDG</span>
                      </>
                    )}
                  </span>
                  {!isPublic && (
                    <span
                      className={`inline-flex h-5 items-center gap-1 rounded-full text-[11.5px] font-medium ${
                        s === "queued"
                          ? "px-0 text-faint"
                          : s === "paid"
                            ? "bg-sealed-soft px-2 text-sealed"
                            : "bg-panel px-2 text-foreground shadow-card"
                      }`}
                    >
                      {busy && <Spinner />}
                      {s === "paid" && <Lock />}
                      {LABEL[s]}
                    </span>
                  )}
                  {busy && !isPublic && STEP[s] != null && (
                    <span className="flex gap-1" aria-hidden>
                      {[1, 2, 3].map((k) => (
                        <span
                          key={k}
                          className={`h-1 w-3 rounded-full ${
                            k < STEP[s]! ? "bg-foreground/70" : k === STEP[s] ? "bg-foreground/35" : "bg-surface-2"
                          }`}
                        />
                      ))}
                    </span>
                  )}
                </div>
              </li>
            );
          })}
        </ul>

        {/* footer */}
        <div className="flex items-center justify-between gap-3 border-t border-line bg-surface px-5 py-3 text-[13px]">
          <span className="inline-flex items-center gap-2 text-mute">
            <span className="relative inline-flex h-4 w-7 items-center rounded-full bg-foreground" aria-hidden>
              <span className="absolute right-0.5 h-3 w-3 rounded-full bg-panel" />
            </span>
            Hide my wallet
          </span>
          <span className="tnum text-foreground">
            {isPublic ? (
              <SealDots n={7} className="text-foreground/60" />
            ) : (
              <>
                {fmt(done ? TOTAL : paidSoFar)} <span className="text-mute">of {fmt(TOTAL)} USDG</span>
              </>
            )}
          </span>
        </div>
      </div>
    </div>
  );
}
