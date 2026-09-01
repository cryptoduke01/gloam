"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { ShieldView } from "./ShieldView";
import { TradeView } from "./TradeView";
import { SendView } from "./SendView";
import { MoveView } from "./MoveView";

/**
 * The Vault hub, one surface for every money move. Actions live in a quiet
 * vertical rail on the left (sticky on desktop, a horizontal scroller on mobile),
 * and the active action gets the whole main column to breathe. No stacked panes
 * over a boxed form. The URL (?tab=) drives which action shows.
 */
const TABS = [
  { id: "shield", label: "Shield", hint: "Into the vault" },
  { id: "trade", label: "Trade", hint: "Size stays sealed" },
  { id: "send", label: "Send", hint: "To any address" },
  { id: "move", label: "Cash out", hint: "Back to your wallet" },
] as const;

type TabId = (typeof TABS)[number]["id"];

export function VaultHub() {
  const router = useRouter();
  const sp = useSearchParams();
  const raw = sp.get("tab");
  const tab: TabId = (TABS.some((t) => t.id === raw) ? raw : "shield") as TabId;

  function select(id: TabId) {
    const params = new URLSearchParams(Array.from(sp.entries()));
    params.set("tab", id);
    router.replace(`/app/vault?${params.toString()}`, { scroll: false });
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[228px_minmax(0,1fr)] lg:gap-16">
      <nav aria-label="Vault actions" className="vault-rail">
        {TABS.map((t) => {
          const active = t.id === tab;
          return (
            <button
              key={t.id}
              type="button"
              aria-current={active ? "page" : undefined}
              onClick={() => select(t.id)}
              className={`vault-rail-item flex flex-col gap-0.5 rounded-2xl px-4 py-3.5 text-left transition-colors ${
                active
                  ? "bg-lime text-background"
                  : "text-mute hover:bg-panel hover:text-foreground"
              }`}
            >
              <span className="text-[15px] font-semibold tracking-tight">
                {t.label}
              </span>
              <span className="text-[12px] opacity-75">{t.hint}</span>
            </button>
          );
        })}
      </nav>

      <Suspense
        fallback={
          <div className="rounded-2xl border border-line bg-panel p-8 text-sm text-mute">
            Loading…
          </div>
        }
      >
        <div className="min-w-0">
          {tab === "shield" && <ShieldView />}
          {tab === "trade" && <TradeView />}
          {tab === "send" && <SendView />}
          {tab === "move" && <MoveView />}
        </div>
      </Suspense>
    </div>
  );
}
