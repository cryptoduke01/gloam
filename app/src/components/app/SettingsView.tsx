"use client";

import { useEffect, useState } from "react";
import { useAccount, useDisconnect, useChainId } from "wagmi";
import {
  EXPLORER_ADDRESS,
  PRODUCT_CHAIN_ID,
  RH_TESTNET_WALLET_PARAMS,
} from "@/lib/chain";
import { FAUCET_BLURB, FAUCET_URL } from "@/lib/faucet";
import {
  exportNotesBackup,
  importNotesBackup,
} from "@/lib/shield";
import { useTheme } from "@/components/ThemeProvider";
import { useTradingSettings } from "@/hooks/useTradingSettings";
import { WalletMenu } from "./WalletMenu";
import { StatusPill } from "./StatusPill";

function Toggle({
  on,
  onChange,
  label,
  hint,
}: {
  on: boolean;
  onChange: (v: boolean) => void;
  label: string;
  hint?: string;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!on)}
      className="flex h-full w-full flex-col justify-between gap-3 rounded-xl border border-line bg-background/40 p-4 text-left transition-colors hover:border-mute"
    >
      <div>
        <p className="text-sm font-medium text-foreground">{label}</p>
        {hint && <p className="mt-1 text-xs leading-relaxed text-mute">{hint}</p>}
      </div>
      <span
        className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${
          on ? "bg-lime" : "bg-line"
        }`}
      >
        <span
          className={`absolute top-0.5 h-6 w-6 rounded-full bg-background shadow transition-transform ${
            on ? "translate-x-5" : "translate-x-0.5"
          }`}
        />
      </span>
    </button>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`min-h-10 rounded-lg px-3 text-sm font-medium capitalize ${
        active
          ? "bg-lime text-black"
          : "border border-line text-mute hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}

export function SettingsView() {
  const { address, isConnected } = useAccount();
  const { disconnect } = useDisconnect();
  const chainId = useChainId();
  const { theme, setTheme } = useTheme();
  const { settings, setSettings, ready } = useTradingSettings();
  const [copied, setCopied] = useState(false);
  const [netMsg, setNetMsg] = useState<string | null>(null);
  const [backupMsg, setBackupMsg] = useState<string | null>(null);
  const [backupImport, setBackupImport] = useState("");

  useEffect(() => {
    if (!copied) return;
    const t = window.setTimeout(() => setCopied(false), 1500);
    return () => window.clearTimeout(t);
  }, [copied]);

  async function copyAddr() {
    if (!address) return;
    await navigator.clipboard.writeText(address);
    setCopied(true);
  }

  async function addNetwork() {
    setNetMsg(null);
    const eth = (
      window as Window & {
        ethereum?: {
          request: (a: {
            method: string;
            params?: unknown[];
          }) => Promise<unknown>;
        };
      }
    ).ethereum;
    if (!eth?.request) {
      setNetMsg("No wallet found.");
      return;
    }
    try {
      await eth.request({
        method: "wallet_addEthereumChain",
        params: [RH_TESTNET_WALLET_PARAMS],
      });
      setNetMsg("Network ready.");
    } catch (e) {
      setNetMsg(
        e instanceof Error ? e.message.slice(0, 120) : "Could not add network"
      );
    }
  }

  const onProduct = chainId === PRODUCT_CHAIN_ID;

  return (
    <div className="space-y-6">
      {/* Top row: wallet + appearance */}
      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-2xl border border-line bg-panel p-5 sm:p-6">
          <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-mute">
            Wallet
          </p>
          {!isConnected || !address ? (
            <div className="mt-4">
              <p className="text-sm text-mute">Connect to manage your session.</p>
              <div className="mt-3">
                <WalletMenu />
              </div>
            </div>
          ) : (
            <div className="mt-4 space-y-3">
              <p className="break-all font-mono text-xs text-foreground sm:text-sm">
                {address}
              </p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={copyAddr}
                  className="inline-flex min-h-10 items-center rounded-lg border border-line px-3 text-sm text-foreground hover:border-mute"
                >
                  {copied ? "Copied" : "Copy"}
                </button>
                <a
                  href={EXPLORER_ADDRESS(address)}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex min-h-10 items-center rounded-lg border border-line px-3 text-sm text-foreground hover:border-mute"
                >
                  Explorer
                </a>
                <button
                  type="button"
                  onClick={() => disconnect()}
                  className="inline-flex min-h-10 items-center rounded-lg border border-line px-3 text-sm text-mute hover:text-foreground"
                >
                  Disconnect
                </button>
              </div>
              {onProduct ? (
                <StatusPill tone="lime">Testnet</StatusPill>
              ) : (
                <StatusPill tone="warn">Wrong network</StatusPill>
              )}
            </div>
          )}
        </section>

        <section className="rounded-2xl border border-line bg-panel p-5 sm:p-6">
          <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-mute">
            Appearance
          </p>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <Chip active={theme === "dark"} onClick={() => setTheme("dark")}>
              Dark
            </Chip>
            <Chip active={theme === "light"} onClick={() => setTheme("light")}>
              Light
            </Chip>
          </div>
          <p className="mt-4 text-xs text-mute">
            {ready ? "Preferences save on this device." : "Loading…"}
          </p>
        </section>
      </div>

      {/* Trading grid */}
      <section className="rounded-2xl border border-line bg-panel p-5 sm:p-6">
        <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-mute">
          Trading
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div>
            <p className="mb-2 text-xs font-medium text-mute">Default side</p>
            <div className="grid grid-cols-2 gap-2">
              <Chip
                active={settings.defaultSide === "buy"}
                onClick={() => setSettings({ defaultSide: "buy" })}
              >
                Buy
              </Chip>
              <Chip
                active={settings.defaultSide === "sell"}
                onClick={() => setSettings({ defaultSide: "sell" })}
              >
                Sell
              </Chip>
            </div>
          </div>
          <div>
            <p className="mb-2 text-xs font-medium text-mute">Markets filter</p>
            <div className="grid grid-cols-3 gap-2">
              {(
                [
                  ["all", "All"],
                  ["onchain", "Onchain"],
                  ["stocks", "Stocks"],
                ] as const
              ).map(([k, label]) => (
                <Chip
                  key={k}
                  active={settings.marketFilter === k}
                  onClick={() => setSettings({ marketFilter: k })}
                >
                  {label}
                </Chip>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Toggle
            on={settings.showUsd}
            onChange={(v) => setSettings({ showUsd: v })}
            label="Show USD"
            hint="Dollar values on portfolio and trade"
          />
          <Toggle
            on={settings.hideZeroBalances}
            onChange={(v) => setSettings({ hideZeroBalances: v })}
            label="Hide empty"
            hint="Only tokens you hold"
          />
          <Toggle
            on={settings.confirmSends}
            onChange={(v) => setSettings({ confirmSends: v })}
            label="Success modal"
            hint="Celebrate after a send settles"
          />
          <Toggle
            on={settings.compactCharts}
            onChange={(v) => setSettings({ compactCharts: v })}
            label="Compact charts"
            hint="Smaller charts on trade"
          />
          <Toggle
            on={settings.fastSend}
            onChange={(v) => setSettings({ fastSend: v })}
            label="Fast send"
            hint="Skip review — still one wallet confirm. We never hold keys."
          />
        </div>
      </section>

      {/* Network + faucet */}
      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-2xl border border-line bg-panel p-5 sm:p-6">
          <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-mute">
            Network
          </p>
          <p className="mt-2 font-display text-xl text-foreground">
            Robinhood testnet
          </p>
          <p className="mt-2 text-sm text-mute">
            Faucet stocks: TSLA · AMZN · PLTR · NFLX · AMD
          </p>
          <button
            type="button"
            onClick={addNetwork}
            className="mt-4 inline-flex min-h-11 items-center rounded-xl bg-lime px-4 text-sm font-semibold text-black hover:opacity-90"
          >
            Add to wallet
          </button>
          {netMsg && <p className="mt-2 text-sm text-mute">{netMsg}</p>}
        </section>

        <section className="rounded-2xl border border-line bg-panel p-5 sm:p-6">
          <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-mute">
            Faucet
          </p>
          <p className="mt-2 font-display text-xl text-foreground">
            Free testnet ETH
          </p>
          <p className="mt-2 text-sm text-mute">{FAUCET_BLURB}</p>
          <a
            href={FAUCET_URL}
            target="_blank"
            rel="noreferrer"
            className="mt-4 inline-flex min-h-11 items-center rounded-xl border border-line px-4 text-sm font-medium text-foreground hover:border-lime/50"
          >
            Open faucet →
          </a>
        </section>
      </div>

      {/* Vault note backup — secrets leave this browser only when you export */}
      <section className="rounded-2xl border border-line bg-panel p-5 sm:p-6">
        <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-mute">
          Vault notes backup
        </p>
        <p className="mt-2 text-sm text-mute">
          Secrets live in this browser. Export a JSON backup before clearing
          site data — anyone with the file can spend those notes.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={!isConnected}
            onClick={async () => {
              setBackupMsg(null);
              try {
                const backup = exportNotesBackup(address);
                const text = JSON.stringify(backup, null, 2);
                await navigator.clipboard.writeText(text);
                setBackupMsg(
                  backup.notes.length
                    ? `Copied ${backup.notes.length} note(s) to clipboard.`
                    : "No spendable notes to export."
                );
              } catch {
                setBackupMsg("Could not copy backup.");
              }
            }}
            className="inline-flex min-h-11 items-center rounded-xl bg-lime px-4 text-sm font-semibold text-black disabled:opacity-50"
          >
            Copy backup
          </button>
          <button
            type="button"
            disabled={!isConnected}
            onClick={() => {
              setBackupMsg(null);
              const backup = exportNotesBackup(address);
              const blob = new Blob([JSON.stringify(backup, null, 2)], {
                type: "application/json",
              });
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url;
              a.download = `gloam-notes-${Date.now()}.json`;
              a.click();
              URL.revokeObjectURL(url);
              setBackupMsg(
                backup.notes.length
                  ? `Downloaded ${backup.notes.length} note(s).`
                  : "Empty backup file downloaded."
              );
            }}
            className="inline-flex min-h-11 items-center rounded-xl border border-line px-4 text-sm font-medium text-foreground hover:border-lime/50 disabled:opacity-50"
          >
            Download JSON
          </button>
        </div>
        <label
          htmlFor="backup-import"
          className="mt-5 block text-sm font-medium text-foreground"
        >
          Restore backup
        </label>
        <textarea
          id="backup-import"
          value={backupImport}
          onChange={(e) => setBackupImport(e.target.value)}
          rows={3}
          placeholder='Paste {"v":1,"type":"gloam-notes-backup",…}'
          className="mt-2 w-full rounded-md border border-line bg-transparent p-3 font-mono text-[11px] outline-none focus:border-lime"
        />
        <button
          type="button"
          disabled={!backupImport.trim() || !isConnected}
          onClick={() => {
            const res = importNotesBackup(backupImport, address);
            if (res.ok) {
              setBackupMsg(`Restored ${res.count} note(s). Refresh Portfolio.`);
              setBackupImport("");
            } else {
              setBackupMsg(res.error);
            }
          }}
          className="mt-3 inline-flex min-h-11 items-center rounded-xl border border-lime/40 px-4 text-sm font-medium text-lime hover:bg-lime/10 disabled:opacity-50"
        >
          Import notes
        </button>
        {backupMsg && (
          <p className="mt-2 text-sm text-mute" role="status">
            {backupMsg}
          </p>
        )}
      </section>
    </div>
  );
}
