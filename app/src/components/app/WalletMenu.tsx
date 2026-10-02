"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  useAccount,
  useConnect,
  useDisconnect,
  useSwitchChain,
  useChainId,
} from "wagmi";
import { ensureRhTestnetWallet, shortAddress } from "@/lib/chain";
import { useNetwork } from "./NetworkProvider";
import { TURNKEY_ENABLED } from "./TurnkeyEmbeddedProvider";
import { TurnkeyHeaderSignIn } from "./TurnkeyHeaderSignIn";
import { ClientOnly } from "./ClientOnly";

/**
 * Where the wallet control sits, which sets its shape:
 * - `sidebar`: full-width block at the foot of the desktop sidebar; the
 *   connected state is an account row whose menu opens upward.
 * - `compact`: a small pill for the 56px mobile top bar; menu drops down.
 * - `inline`: inside a form or card, where it stands in for the submit
 *   button, so the connect state is a full-width primary pill.
 * Left unset, it reads its surroundings after mount (`.gl-sidebar` means
 * sidebar, `.gl-mobilebar` means compact, anything else is inline).
 */
export type WalletMenuVariant = "sidebar" | "compact" | "inline";

function detectVariant(el: HTMLElement | null): WalletMenuVariant {
  if (!el) return "inline";
  if (el.closest(".gl-sidebar")) return "sidebar";
  if (el.closest(".gl-mobilebar")) return "compact";
  return "inline";
}

export function WalletMenu({ variant }: { variant?: WalletMenuVariant } = {}) {
  const { address, isConnected, isConnecting } = useAccount();
  const { connect, connectors, isPending, error } = useConnect();
  const { disconnect } = useDisconnect();
  const { network } = useNetwork();
  const chainId = useChainId();
  const { switchChain, isPending: switching } = useSwitchChain();
  const [env, setEnv] = useState<{ mounted: boolean; auto: WalletMenuVariant }>(
    { mounted: false, auto: "inline" }
  );
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const mounted = env.mounted;

  useEffect(
    () => setEnv({ mounted: true, auto: detectVariant(root.current) }),
    []
  );

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
        await switchChain({ chainId: network.chainId });
      } catch {
        await ensureRhTestnetWallet();
        await switchChain({ chainId: network.chainId });
      }
    } catch {
      /* ignore */
    } finally {
      setBusy(false);
    }
  }

  function onCopy() {
    if (!address) return;
    void navigator.clipboard?.writeText(address).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    });
  }

  const v: WalletMenuVariant = variant ?? env.auto;
  const compact = v === "compact";
  const sidebar = v === "sidebar";
  // Primary pill sizing per placement. Inline stands in for a form's submit
  // button, so it matches that height.
  const primary = compact
    ? "btn btn-ink btn-sm"
    : sidebar
      ? "btn btn-ink btn-block"
      : "btn btn-ink btn-lg btn-block";

  if (!mounted) {
    // Holds the space without guessing the label. Ancestor selectors size it
    // for the top bar before the variant is known.
    return (
      <div ref={root} className={compact ? "inline-flex" : undefined}>
        <span
          aria-hidden
          className={`block rounded-full bg-surface ${
            compact
              ? "h-9 w-[92px]"
              : variant
                ? sidebar
                  ? "h-11 w-full"
                  : "h-12 w-full"
                : "h-12 w-full [.gl-sidebar_&]:h-11 [.gl-mobilebar_&]:h-9 [.gl-mobilebar_&]:w-[92px]"
          }`}
        />
      </div>
    );
  }

  if (!isConnected || !address) {
    // Injected wallet (MetaMask, etc.) is the fallback, not the Turnkey connector.
    const walletConnector =
      connectors.find((c) => c.id !== "gloam-turnkey") ?? connectors[0];
    const connecting = isPending || isConnecting;

    if (TURNKEY_ENABLED) {
      return (
        <div
          ref={root}
          className={
            compact
              ? "flex items-center gap-2"
              : "flex flex-col items-stretch gap-1"
          }
        >
          <ClientOnly>
            <TurnkeyHeaderSignIn className={primary} />
          </ClientOnly>
          <button
            type="button"
            onClick={() => walletConnector && connect({ connector: walletConnector })}
            disabled={!walletConnector || connecting}
            className={`text-[13px] text-mute transition-colors hover:text-foreground disabled:opacity-60 ${
              compact ? "h-9 px-1" : "h-9 w-full rounded-full hover:bg-surface"
            }`}
          >
            {connecting ? "Connecting…" : "Use a wallet"}
          </button>
        </div>
      );
    }

    return (
      <div ref={root} className={compact ? "inline-flex" : undefined}>
        <button
          type="button"
          onClick={() => walletConnector && connect({ connector: walletConnector })}
          disabled={!walletConnector || connecting}
          className={primary}
        >
          {!compact && <WalletGlyph />}
          {connecting ? "Connecting…" : compact ? "Connect" : "Connect wallet"}
        </button>
        {error && !compact && (
          <p className="mt-2 text-[12px] leading-snug text-danger">
            {error.message.slice(0, 80)}
          </p>
        )}
      </div>
    );
  }

  const wrong = chainId !== network.chainId;

  if (wrong) {
    return (
      <div ref={root} className={compact ? "inline-flex" : undefined}>
        <button
          type="button"
          onClick={onSwitch}
          disabled={switching || busy}
          className={primary}
        >
          {switching || busy
            ? "Switching…"
            : compact
              ? "Switch network"
              : `Switch to ${network.label}`}
        </button>
      </div>
    );
  }

  return (
    <div ref={root} className={`relative ${sidebar ? "w-full" : "inline-flex"}`}>
      {sidebar ? (
        <button
          type="button"
          onClick={() => setOpen((x) => !x)}
          aria-expanded={open}
          aria-haspopup="menu"
          className={`flex min-h-[52px] w-full items-center gap-3 rounded-[14px] px-2 py-2 text-left transition-colors hover:bg-surface ${
            open ? "bg-surface" : ""
          }`}
        >
          <AddressSeal address={address} size={34} />
          <span className="min-w-0 flex-1">
            <span className="tnum block truncate text-[14px] font-medium leading-tight text-foreground">
              {shortAddress(address)}
            </span>
            <span className="mt-0.5 block truncate text-[12px] leading-tight text-mute">
              {network.label}
            </span>
          </span>
          <UpDownGlyph className="shrink-0 text-faint" />
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setOpen((x) => !x)}
          aria-expanded={open}
          aria-haspopup="menu"
          className={`inline-flex h-10 items-center gap-2 rounded-full border bg-panel pl-1 pr-3 text-foreground transition-colors hover:border-line-strong ${
            open ? "border-line-strong" : "border-line"
          }`}
        >
          <AddressSeal address={address} size={32} />
          <span className="tnum text-[13px] font-medium">
            {shortAddress(address)}
          </span>
          <ChevronGlyph
            className={`text-faint transition-transform ${open ? "rotate-180" : ""}`}
          />
        </button>
      )}

      {open && (
        <div
          role="menu"
          aria-label="Wallet"
          className={`absolute z-50 rounded-[18px] border border-line bg-panel p-1.5 shadow-pop ${
            sidebar
              ? "bottom-0 left-full ml-5 w-[288px]"
              : "right-0 top-full mt-2 w-[288px] max-w-[calc(100vw-32px)]"
          }`}
        >
          <div className="flex items-center gap-3 px-2.5 pb-3 pt-2.5">
            <AddressSeal address={address} size={38} />
            <div className="min-w-0 flex-1">
              <p className="tnum truncate text-[14px] font-medium text-foreground">
                {shortAddress(address, 6)}
              </p>
              <p className="mt-0.5 truncate text-[12px] text-mute">
                {network.label} testnet
              </p>
            </div>
            <button
              type="button"
              onClick={onCopy}
              className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-mute transition-colors hover:bg-surface hover:text-foreground"
              aria-label={copied ? "Address copied" : "Copy address"}
              title={copied ? "Copied" : "Copy address"}
            >
              {copied ? <CheckGlyph /> : <CopyGlyph />}
            </button>
          </div>
          <div className="mx-1 h-px bg-line" />
          <div className="py-1">
            <MenuLink href="/app" onClick={() => setOpen(false)} icon={<GridGlyph />}>
              Portfolio
            </MenuLink>
            <MenuLink
              href="/app/trade?path=sealed"
              onClick={() => setOpen(false)}
              icon={<TradeGlyph />}
            >
              Private trade
            </MenuLink>
            <MenuLink
              href="/app/move"
              onClick={() => setOpen(false)}
              icon={<SendGlyph />}
            >
              Private send
            </MenuLink>
            <MenuLink
              href="/app/settings"
              onClick={() => setOpen(false)}
              icon={<GearGlyph />}
            >
              Settings
            </MenuLink>
          </div>
          <div className="mx-1 h-px bg-line" />
          <div className="pt-1">
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                disconnect();
              }}
              className="flex h-10 w-full items-center gap-3 rounded-xl px-2.5 text-[14px] text-mute transition-colors hover:bg-surface hover:text-foreground"
            >
              <ExitGlyph />
              Disconnect
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function MenuLink({
  href,
  onClick,
  icon,
  children,
}: {
  href: string;
  onClick: () => void;
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      role="menuitem"
      onClick={onClick}
      className="flex h-10 items-center gap-3 rounded-xl px-2.5 text-[14px] text-foreground transition-colors hover:bg-surface"
    >
      <span className="text-mute">{icon}</span>
      {children}
    </Link>
  );
}

/**
 * The account mark: a 3x3 mirrored dot grid read from the address bytes. It
 * borrows the sealed-dots motif, so each wallet gets a stable, quiet identity.
 */
function AddressSeal({ address, size = 32 }: { address: string; size?: number }) {
  const hex = address.slice(2).toLowerCase();
  const nib = (i: number) => parseInt(hex[i] ?? "0", 16) || 0;
  const cells: boolean[] = [];
  for (let r = 0; r < 3; r++) {
    const side = nib(r * 2 + 3) % 2 === 0;
    const mid = nib(r * 2 + 4) % 2 === 0;
    cells.push(side, mid, side);
  }
  if (cells.filter(Boolean).length < 3) {
    cells[1] = cells[4] = cells[7] = true;
  }
  const dot = Math.max(3, Math.round(size / 8.5));
  const gap = Math.max(2, Math.round(size / 12));
  return (
    <span
      aria-hidden
      className="grid shrink-0 place-items-center rounded-full bg-ink"
      style={{ width: size, height: size }}
    >
      <span className="grid grid-cols-3" style={{ gap }}>
        {cells.map((on, i) => (
          <i
            key={i}
            className={`block rounded-full bg-on-ink ${on ? "opacity-95" : "opacity-25"}`}
            style={{ width: dot, height: dot }}
          />
        ))}
      </span>
    </span>
  );
}

const glyph = {
  width: 16,
  height: 16,
  viewBox: "0 0 24 24",
  fill: "none",
  "aria-hidden": true,
} as const;

function WalletGlyph() {
  return (
    <svg {...glyph}>
      <path
        d="M4 7.5A2.5 2.5 0 0 1 6.5 5h10A1.5 1.5 0 0 1 18 6.5V8M4 7.5v9A2.5 2.5 0 0 0 6.5 19h11a1.5 1.5 0 0 0 1.5-1.5v-8A1.5 1.5 0 0 0 17.5 8H6.5A2.5 2.5 0 0 1 4 7.5Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <circle cx="15.5" cy="13.5" r="1.2" fill="currentColor" />
    </svg>
  );
}
function UpDownGlyph({ className = "" }: { className?: string }) {
  return (
    <svg {...glyph} className={className}>
      <path
        d="M8.5 9.5 12 6l3.5 3.5M8.5 14.5 12 18l3.5-3.5"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
function ChevronGlyph({ className = "" }: { className?: string }) {
  return (
    <svg {...glyph} width={14} height={14} className={className}>
      <path
        d="m7 10 5 5 5-5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
function CopyGlyph() {
  return (
    <svg {...glyph}>
      <rect x="8.5" y="8.5" width="11" height="11" rx="2.5" stroke="currentColor" strokeWidth="1.6" />
      <path d="M15.5 8.5V6.5a2 2 0 0 0-2-2h-7a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h2" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}
function CheckGlyph() {
  return (
    <svg {...glyph}>
      <path d="m5.5 12.5 4 4 9-9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function GridGlyph() {
  return (
    <svg {...glyph}>
      <rect x="4" y="4" width="6.5" height="6.5" rx="1.8" stroke="currentColor" strokeWidth="1.6" />
      <rect x="13.5" y="4" width="6.5" height="6.5" rx="1.8" stroke="currentColor" strokeWidth="1.6" />
      <rect x="4" y="13.5" width="6.5" height="6.5" rx="1.8" stroke="currentColor" strokeWidth="1.6" />
      <rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.8" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}
function TradeGlyph() {
  return (
    <svg {...glyph}>
      <path d="M7 4.5v15M7 4.5 4 7.5M7 4.5l3 3M17 19.5v-15M17 19.5l-3-3M17 19.5l3-3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function SendGlyph() {
  return (
    <svg {...glyph}>
      <path d="M5 12h13M13 6.5 18.5 12 13 17.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function GearGlyph() {
  return (
    <svg {...glyph}>
      <circle cx="12" cy="12" r="2.75" stroke="currentColor" strokeWidth="1.6" />
      <path
        d="M12 3.75v2M12 18.25v2M20.25 12h-2M5.75 12h-2M17.83 6.17l-1.41 1.41M7.58 16.42l-1.41 1.41M17.83 17.83l-1.41-1.41M7.58 7.58L6.17 6.17"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}
function ExitGlyph() {
  return (
    <svg {...glyph}>
      <path d="M14 5.5H7A1.5 1.5 0 0 0 5.5 7v10A1.5 1.5 0 0 0 7 18.5h7M11 12h9M17 9l3 3-3 3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
