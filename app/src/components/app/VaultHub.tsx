"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { ShieldView } from "./ShieldView";
import { TradeView } from "./TradeView";
import { SendView } from "./SendView";
import { MoveView } from "./MoveView";

/**
 * The Vault hub, one surface for every money move, the way Umbra collapses
 * Shield / Swap / Send / Withdraw onto a single card. Plain verbs, no jargon.
 * Each tab reuses the existing action view; the URL (?tab=) drives which shows,
 * so deep links and the views' own params keep working.
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
    <div className="space-y-5">
      {/* action tabs, the one control that runs the whole vault */}
      <div
        role="tablist"
        aria-label="Vault actions"
        className="grid grid-cols-4 gap-1.5 rounded-2xl border border-line bg-panel p-1.5 max-sm:grid-cols-2"
      >
        {TABS.map((t) => {
          const active = t.id === tab;
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => select(t.id)}
              className={`flex min-h-14 flex-col items-start justify-center gap-0.5 rounded-xl px-4 text-left transition-colors ${
                active
                  ? "bg-lime text-background"
                  : "text-mute hover:bg-background hover:text-foreground"
              }`}
            >
              <span className="text-sm font-semibold">{t.label}</span>
              <span className="text-[11px] opacity-80">{t.hint}</span>
            </button>
          );
        })}
      </div>

      {/* active action */}
      <Suspense
        fallback={
          <div className="rounded-xl border border-line bg-panel p-8 text-sm text-mute">
            Loading…
          </div>
        }
      >
        {tab === "shield" && <ShieldView />}
        {tab === "trade" && <TradeView />}
        {tab === "send" && <SendView />}
        {tab === "move" && <MoveView />}
      </Suspense>
    </div>
  );
}
