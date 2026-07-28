"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  useAccount,
  useConnect,
  useDisconnect,
  useSwitchChain,
  useChainId,
} from "wagmi";
import {
  PRODUCT_CHAIN_ID,
  ensureRhTestnetWallet,
  shortAddress,
} from "@/lib/chain";
import { TURNKEY_ENABLED } from "./TurnkeyEmbeddedProvider";
import { TurnkeyHeaderSignIn } from "./TurnkeyHeaderSignIn";
import { ClientOnly } from "./ClientOnly";

export function WalletMenu() {
  const { address, isConnected, isConnecting } = useAccount();
  const { connect, connectors, isPending, error } = useConnect();
  const { disconnect } = useDisconnect();
  const chainId = useChainId();
  const { switchChain, isPending: switching } = useSwitchChain();
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (root.current && !root.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  async function onSwitch() {
    setBusy(true);
    try {
      try {
        await switchChain({ chainId: PRODUCT_CHAIN_ID });
      } catch {
        await ensureRhTestnetWallet();
        await switchChain({ chainId: PRODUCT_CHAIN_ID });
      }
    } catch {
      /* ignore */
    } finally {
      setBusy(false);
    }
  }

  if (!mounted) {
    return (
      <button
        type="button"
        disabled
        className="inline-flex min-h-10 items-center rounded-md border border-line px-4 text-sm text-mute"
      >
        {TURNKEY_ENABLED ? "Sign in" : "Connect"}
      </button>
    );
  }

  if (!isConnected || !address) {
    // Injected wallet (MetaMask, etc.) is the fallback, not the Turnkey connector.
    const walletConnector =
      connectors.find((c) => c.id !== "gloam-turnkey") ?? connectors[0];

    if (TURNKEY_ENABLED) {
      return (
        <div className="flex items-center gap-3">
          <ClientOnly>
            <TurnkeyHeaderSignIn />
          </ClientOnly>
          <button
            type="button"
            onClick={() => walletConnector && connect({ connector: walletConnector })}
            disabled={!walletConnector || isPending || isConnecting}
            className="text-xs text-mute transition-colors hover:text-foreground disabled:opacity-60"
          >
            {isPending || isConnecting ? "Connecting…" : "Use a wallet"}
          </button>
        </div>
      );
    }

    return (
      <div>
        <button
          type="button"
          onClick={() => walletConnector && connect({ connector: walletConnector })}
          disabled={!walletConnector || isPending || isConnecting}
          className="inline-flex min-h-10 items-center rounded-md bg-lime px-4 text-sm font-semibold text-black hover:opacity-90 disabled:opacity-60"
        >
          {isPending || isConnecting ? "Connecting…" : "Connect"}
        </button>
        {error && (
          <p className="mt-1 max-w-[12rem] text-[11px] text-red-400">
            {error.message.slice(0, 80)}
          </p>
        )}
      </div>
    );
  }

  const wrong = chainId !== PRODUCT_CHAIN_ID;

  return (
    <div className="relative" ref={root}>
      {wrong ? (
        <button
          type="button"
          onClick={onSwitch}
          disabled={switching || busy}
          className="inline-flex min-h-10 items-center rounded-md bg-lime px-4 text-sm font-semibold text-black hover:opacity-90 disabled:opacity-60"
        >
          {switching || busy ? "Switching…" : "Switch network"}
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-haspopup="menu"
          className="inline-flex min-h-10 items-center gap-2 rounded-md border border-line bg-panel px-3 text-sm text-foreground hover:border-mute"
        >
          <span className="h-1.5 w-1.5 rounded-full bg-lime" aria-hidden />
          <span className="font-mono text-xs sm:text-sm">
            {shortAddress(address)}
          </span>
          <span className="text-mute" aria-hidden>
            ▾
          </span>
        </button>
      )}

      {open && !wrong && (
        <div
          role="menu"
          className="absolute right-0 z-50 mt-2 w-56 overflow-hidden rounded-xl border border-line bg-panel shadow-[var(--shadow-dock)]"
        >
          <div className="border-b border-line px-3 py-2.5">
            <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-mute">
              Wallet
            </p>
            <p className="mt-1 truncate font-mono text-xs text-foreground">
              {shortAddress(address, 6)}
            </p>
          </div>
          <div className="p-1.5">
            <Link
              href="/app"
              role="menuitem"
              onClick={() => setOpen(false)}
              className="flex min-h-10 items-center rounded-lg px-3 text-sm text-foreground hover:bg-background"
            >
              Portfolio
            </Link>
            <Link
              href="/app/trade?path=sealed"
              role="menuitem"
              onClick={() => setOpen(false)}
              className="flex min-h-10 items-center rounded-lg px-3 text-sm text-foreground hover:bg-background"
            >
              Private trade
            </Link>
            <Link
              href="/app/move"
              role="menuitem"
              onClick={() => setOpen(false)}
              className="flex min-h-10 items-center rounded-lg px-3 text-sm text-foreground hover:bg-background"
            >
              Private send
            </Link>
            <Link
              href="/app/settings"
              role="menuitem"
              onClick={() => setOpen(false)}
              className="flex min-h-10 items-center rounded-lg px-3 text-sm text-foreground hover:bg-background"
            >
              Settings
            </Link>
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                disconnect();
              }}
              className="flex min-h-10 w-full items-center rounded-lg px-3 text-sm text-mute hover:bg-background hover:text-foreground"
            >
              Disconnect
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
