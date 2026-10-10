"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { SealDots } from "@/components/ui/SealDots";

/**
 * The three live product cards on the landing, with a toggle between what the
 * person using Gloam sees and what anyone looking at the chain sees. Each
 * card's button opens the real screen in the app.
 */

type View = "you" | "public";

function Token({ src }: { src: string }) {
  return <Image src={src} alt="" width={20} height={20} className="h-5 w-5 shrink-0 rounded-full" />;
}

function Amount({ value, hidden, label }: { value: string; hidden: boolean; label: string }) {
  return hidden ? (
    <p className="mt-2 flex h-[26px] items-center text-foreground/60">
      <SealDots n={6} label={label} />
    </p>
  ) : (
    <p className="tnum mt-2 text-[26px] font-light leading-none tracking-[-0.02em]">{value}</p>
  );
}

function Hidden() {
  return (
    <span className="inline-flex items-center gap-1.5 font-medium text-sealed">
      <span className="h-1.5 w-1.5 rounded-full bg-sealed" /> Hidden
    </span>
  );
}

function AddCard({ view }: { view: View }) {
  const pub = view === "public";
  return (
    <div className="flex h-full flex-col rounded-[16px] bg-panel p-4 shadow-card">
      <div className="rounded-[12px] bg-surface p-3.5">
        <div className="flex items-center justify-between text-[12px] text-mute">
          <span>{pub ? "Deposit from 0x7a3…f21" : "You add"}</span>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-panel px-2 py-0.5 text-foreground">
            <Token src="/brand/logos/usdg.png" /> USDG
          </span>
        </div>
        <Amount value="1,000" hidden={false} label="Amount" />
      </div>
      <div className="relative z-10 -my-2 mx-auto grid h-7 w-7 place-items-center rounded-full border-4 border-panel bg-sealed-soft text-sealed">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden>
          <path d="M12 5v14m0 0l-5-5m5 5l5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
      <div className="rounded-[12px] bg-surface p-3.5">
        <div className="flex items-center justify-between text-[12px] text-mute">
          <span>Private balance</span>
          {pub ? (
            <Hidden />
          ) : (
            <span className="inline-flex items-center gap-1.5 font-medium text-sealed">
              <span className="h-1.5 w-1.5 rounded-full bg-sealed" /> Only you
            </span>
          )}
        </div>
        <Amount value="1,000" hidden={pub} label="Balance hidden" />
      </div>
      <Link href="/app/vault?tab=shield" className="btn btn-ink btn-sm btn-block mt-auto">
        Add privately
      </Link>
    </div>
  );
}

function SendCard({ view }: { view: View }) {
  const pub = view === "public";
  return (
    <div className="flex h-full flex-col rounded-[16px] bg-panel p-4 shadow-card">
      <div className="rounded-[12px] bg-surface p-3.5">
        <div className="flex items-center justify-between text-[12px] text-mute">
          <span>Send to</span>
          {pub && <Hidden />}
        </div>
        {pub ? (
          <p className="mt-1.5 flex h-[22px] items-center text-foreground/60">
            <SealDots n={8} label="Recipient hidden" />
          </p>
        ) : (
          <p className="mt-1.5 truncate text-[15px] text-foreground">gloamr1.7fQk…x9Wd</p>
        )}
      </div>
      <div className="mt-2 rounded-[12px] bg-surface p-3.5">
        <div className="flex items-center justify-between text-[12px] text-mute">
          <span>Amount</span>
          {pub ? (
            <Hidden />
          ) : (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-panel px-2 py-0.5 text-foreground">
              <Token src="/brand/logos/pathusd.svg" /> PathUSD
            </span>
          )}
        </div>
        <Amount value="250" hidden={pub} label="Amount hidden" />
      </div>
      <div className="mt-2 flex items-center justify-between px-1 py-2 text-[12px]">
        <span className="text-mute">The explorer shows</span>
        <span className="text-foreground">
          Private transfer <SealDots n={4} className="ml-1 text-foreground/60" />
        </span>
      </div>
      <Link href="/app/vault?tab=move&mode=pay" className="btn btn-ink btn-sm btn-block mt-auto">
        Send privately
      </Link>
    </div>
  );
}

function ProveCard({ view }: { view: View }) {
  const pub = view === "public";
  return (
    <div className="flex h-full flex-col rounded-[16px] bg-panel p-4 shadow-card">
      <div className="flex flex-1 flex-col items-center justify-center rounded-[12px] bg-surface px-4 py-5 text-center">
        <span className="grid h-9 w-9 place-items-center rounded-full bg-sealed-soft text-sealed">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path d="M5 12.5l4.2 4.2L19 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
        <p className="mt-3 text-[16px] text-foreground">Holds at least $10,000</p>
        {pub ? (
          <>
            <p className="mt-1 text-[12px] text-mute">Verified. Exact balance not shared.</p>
            <p className="mt-3 text-foreground/60">
              <SealDots n={8} label="Exact balance hidden" />
            </p>
          </>
        ) : (
          <>
            <p className="mt-1 text-[12px] text-mute">Your balance behind it</p>
            <p className="tnum mt-2 text-[20px] font-light leading-none tracking-[-0.02em]">12,480 USDG</p>
          </>
        )}
      </div>
      <Link href="/app/disclose" className="btn btn-ink btn-sm btn-block mt-3">
        Share proof
      </Link>
    </div>
  );
}

const CARDS = [
  {
    Card: AddCard,
    label: "Private balance",
    body: "Move USDG, PathUSD or ETH into a balance only you can see.",
    href: "/docs/product",
  },
  {
    Card: SendCard,
    label: "Private pay",
    body: "Send to a Gloam address or a claim link. The explorer never sees how much.",
    href: "/docs/private-pay",
  },
  {
    Card: ProveCard,
    label: "Prove",
    body: "Show a lender, an auditor or a counterparty exactly what they need. Nothing more.",
    href: "/docs/sdk/disclosure",
  },
];

const VIEWS: { key: View; label: string }[] = [
  { key: "you", label: "What you see" },
  { key: "public", label: "What the public sees" },
];

export function LiveProduct() {
  const [view, setView] = useState<View>("you");
  return (
    <>
      <div className="relative mt-8 flex justify-center">
        <div role="group" aria-label="Switch the view" className="inline-flex rounded-full bg-panel p-1 shadow-card">
          {VIEWS.map((v) => (
            <button
              key={v.key}
              type="button"
              aria-pressed={view === v.key}
              onClick={() => setView(v.key)}
              className={`h-10 rounded-full px-4 text-[14px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sealed ${
                view === v.key ? "bg-foreground text-panel" : "text-mute hover:text-foreground"
              }`}
            >
              {v.label}
            </button>
          ))}
        </div>
      </div>
      <div className="relative mx-auto mt-8 grid max-w-[1080px] gap-4 md:grid-cols-3">
        {CARDS.map(({ Card, label, body, href }) => (
          <div key={label} className="flex flex-col">
            <div className="gl-glass h-[320px] p-2">
              <Card view={view} />
            </div>
            <Link
              href={href}
              className="t-label mt-5 inline-flex items-center gap-1.5 text-foreground transition-colors hover:text-sealed"
            >
              {label} <span aria-hidden>→</span>
            </Link>
            <p className="mt-2 text-[14px] leading-relaxed text-mute">{body}</p>
          </div>
        ))}
      </div>
    </>
  );
}
