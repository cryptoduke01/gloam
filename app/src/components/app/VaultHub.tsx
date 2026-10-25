"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState, useSyncExternalStore, type KeyboardEvent } from "react";
import { VaultActionIcon, VaultHome } from "./VaultHome";
import { useNetwork } from "./NetworkProvider";
import { swapOpenTo, vaultSwapRouter } from "@/lib/vaultSwap";
import { useAppAccount } from "@/lib/demo";
import { tabKeyTarget } from "@/lib/tabKeys";
import {
  vaultActionFromUrl,
  vaultActionSearch,
  vaultActionsFor,
  type VaultActionId,
  type VaultActionInfo,
} from "@/lib/vaultHub";

/**
 * The Vault: one place for every private money move. With no action in the
 * URL it opens on the overview (VaultHome), which shows the private balance
 * next to the public wallet and names every action with one line. An action
 * opens under a row that switches between them: Add privately, Pay
 * privately, Receive, Swap and Cash out, then Trade and Public send where the
 * network has them. The URL (?tab=, and ?mode= for Pay's parts) says which,
 * so links and the old /app/shield, /app/move and /app/send redirects keep
 * working (lib/vaultHub).
 */

const noopSubscribe = () => () => {};

function PanelSkeleton() {
  return (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_340px]" aria-busy="true">
      <div className="gl-card h-[420px] motion-safe:animate-pulse" />
      <div className="gl-card h-[220px] motion-safe:animate-pulse" />
    </div>
  );
}

function HomeSkeleton() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading the vault">
      <div className="gl-card h-[260px] motion-safe:animate-pulse" />
      <div className="gl-card h-[380px] motion-safe:animate-pulse xl:h-[190px]" />
    </div>
  );
}

// Each action is its own chunk, fetched when its tab opens. The views only
// render in the browser (see `hydrated` below), so nothing is lost on the
// server, and opening the vault no longer downloads every action's code.
const ShieldView = dynamic(() => import("./ShieldView").then((m) => m.ShieldView), {
  ssr: false,
  loading: PanelSkeleton,
});
const MoveView = dynamic(() => import("./MoveView").then((m) => m.MoveView), {
  ssr: false,
  loading: PanelSkeleton,
});
const TradeView = dynamic(() => import("./TradeView").then((m) => m.TradeView), {
  ssr: false,
  loading: PanelSkeleton,
});
const VaultSwapView = dynamic(() => import("./VaultSwapView").then((m) => m.VaultSwapView), {
  ssr: false,
  loading: PanelSkeleton,
});
const SendView = dynamic(() => import("./SendView").then((m) => m.SendView), {
  ssr: false,
  loading: PanelSkeleton,
});

export function VaultHub() {
  const router = useRouter();
  const sp = useSearchParams();
  const { network, settled } = useNetwork();
  const { address } = useAppAccount();
  // The views read the saved network and wallet, which only exist in the
  // browser: render them once hydrated (this suspends apart from the network
  // provider, which can settle first) so server and client HTML always match.
  const hydrated = useSyncExternalStore(noopSubscribe, () => true, () => false);

  // Tokenized stocks only trade on Robinhood Chain testnet, swaps only where a
  // vault swap router is deployed, and a public send needs a native coin
  // (Tempo has none), so those actions drop out elsewhere.
  const actions = vaultActionsFor({
    swap: vaultSwapRouter(network.chainId) !== null && swapOpenTo(address),
    stocks: Boolean(network.stocks),
    native: network.family !== "tempo",
  });

  // A claim link's fragment (#claim=…) opens Receive; Pay reads and clears it.
  const [hash, setHash] = useState("");
  useEffect(() => {
    const read = () => setHash(window.location.hash);
    read();
    window.addEventListener("hashchange", read);
    return () => window.removeEventListener("hashchange", read);
  }, []);

  const tab = sp.get("tab");
  const action = vaultActionFromUrl(
    tab,
    sp.get("mode"),
    hash,
    actions.map((a) => a.id)
  );
  const current = actions.find((a) => a.id === action) ?? null;

  // Pay reads ?mode= when it opens. Until it follows a change of ?mode= on its
  // own, moving between Pay privately, Receive and Cash out opens it afresh.
  const [payKey, setPayKey] = useState(0);

  function select(id: VaultActionId) {
    const next = actions.find((a) => a.id === id);
    if (!next || id === action) return;
    if (next.tab === "move" && current?.tab === "move") setPayKey((k) => k + 1);
    setHash("");
    router.replace(`/app/vault${vaultActionSearch(id, window.location.search)}`, { scroll: false });
  }

  // The network and wallet only exist in the browser; until they are read,
  // a calm placeholder the shape of what comes.
  if (!hydrated || !settled) {
    return tab ? (
      <div className="space-y-6">
        <div className="h-[68px] w-full rounded-[20px] bg-surface-2 motion-safe:animate-pulse sm:h-12 sm:max-w-[560px] sm:rounded-full" />
        <PanelSkeleton />
      </div>
    ) : (
      <HomeSkeleton />
    );
  }

  if (!current) return <VaultHome actions={actions} />;

  return (
    <div className="space-y-6">
      <ActionRow actions={actions} current={current.id} onSelect={select} />

      {/* Pay keeps its own Send / Receive / Cash out row for other pages; here
          the row above names those, so Pay's is left out. */}
      <div
        id="vault-panel"
        role="tabpanel"
        aria-labelledby={`vault-tab-${current.id}`}
        className="min-w-0 [&_[role=tablist][aria-label=Pay]]:hidden [&_[role=tablist][aria-label=Pay]+*]:mt-0"
      >
        <Suspense fallback={<PanelSkeleton />}>
          {current.id === "shield" && <ShieldView />}
          {current.id === "trade" && <TradeView />}
          {current.id === "swap" && <VaultSwapView />}
          {current.id === "send" && <SendView />}
          {current.tab === "move" && <MoveView key={payKey} />}
        </Suspense>
      </div>
    </div>
  );
}

/**
 * The row of actions on every action page. On a phone the five main ones sit
 * side by side, each a mark and a short name; from a tablet up it is one
 * track of names, with Trade and Public send after them where they exist.
 * One tab stop for the row (the open action); the arrows, Home and End move
 * along it, and Enter or Space opens one.
 */
function ActionRow({
  actions,
  current,
  onSelect,
}: {
  actions: readonly VaultActionInfo[];
  current: VaultActionId;
  onSelect: (id: VaultActionId) => void;
}) {
  const row = useRef<HTMLDivElement>(null);
  const core = actions.filter((a) => !a.extra).length;

  function onKey(e: KeyboardEvent<HTMLButtonElement>) {
    const tabs = Array.from(row.current?.querySelectorAll<HTMLElement>('[role="tab"]') ?? []).filter(
      (el) => el.offsetParent !== null
    );
    const i = tabs.indexOf(e.currentTarget);
    const next = i < 0 ? null : tabKeyTarget(e.key, i, tabs.length);
    if (next === null) return;
    e.preventDefault();
    tabs[next]?.focus();
  }

  return (
    <div className="flex items-center gap-2">
      <Link
        href="/app/vault"
        aria-label="Vault overview"
        title="Vault overview"
        className="hidden h-12 w-12 shrink-0 place-items-center rounded-full bg-surface-2 text-mute transition-colors hover:text-foreground sm:grid dark:bg-panel dark:ring-1 dark:ring-line"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
          <rect x="4" y="4" width="6.5" height="6.5" rx="1.8" stroke="currentColor" strokeWidth="1.6" />
          <rect x="13.5" y="4" width="6.5" height="6.5" rx="1.8" stroke="currentColor" strokeWidth="1.6" />
          <rect x="4" y="13.5" width="6.5" height="6.5" rx="1.8" stroke="currentColor" strokeWidth="1.6" />
          <rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.8" stroke="currentColor" strokeWidth="1.6" />
        </svg>
      </Link>
      <div
        ref={row}
        role="tablist"
        aria-label="Vault actions"
        className={`grid w-full gap-1 rounded-[20px] bg-surface-2 p-1 sm:inline-flex sm:w-auto sm:max-w-full sm:rounded-full dark:bg-panel dark:ring-1 dark:ring-line ${
          core >= 5 ? "grid-cols-5" : "grid-cols-4"
        }`}
      >
        {actions.map((a, i) => {
          const active = a.id === current;
          const extraStart = a.extra && !actions[i - 1]?.extra;
          return (
            <button
              key={a.id}
              id={`vault-tab-${a.id}`}
              type="button"
              role="tab"
              aria-selected={active}
              aria-controls="vault-panel"
              tabIndex={active ? 0 : -1}
              title={a.line}
              onClick={() => onSelect(a.id)}
              onKeyDown={onKey}
              className={`flex min-w-0 flex-col items-center justify-center gap-1 rounded-[16px] px-1 text-[12px] leading-tight transition-colors duration-200 max-sm:h-[60px] sm:h-10 sm:flex-row sm:whitespace-nowrap sm:rounded-full sm:px-4 sm:text-[14px] ${
                a.extra ? "max-sm:hidden" : ""
              } ${extraStart ? "sm:ml-2" : ""} ${
                active
                  ? "bg-panel font-medium text-foreground shadow-card dark:bg-surface-2"
                  : "text-mute hover:text-foreground"
              }`}
            >
              <span className="sm:hidden">
                <VaultActionIcon id={a.id} size={18} />
              </span>
              <span className="max-w-full truncate md:hidden">{a.short}</span>
              <span className="hidden md:inline">{a.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
