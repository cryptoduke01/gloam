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
import {
  isSealedBackup,
  openWithPassphrase,
  sealWithPassphrase,
} from "@/lib/secretBox";
import {
  CIRCUIT_ARTIFACTS,
  PROVING_CEREMONY,
  assertSealedSwapArtifacts,
  assertTransferArtifacts,
  assertUnshieldArtifacts,
} from "@/lib/circuitArtifacts";
import { resetOnboarding } from "@/lib/onboarding";
import { useTradingSettings } from "@/hooks/useTradingSettings";
import { WalletMenu } from "./WalletMenu";
import { StatusPill } from "./StatusPill";
import { VaultHealth } from "./VaultHealth";

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
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={() => onChange(!on)}
      className="flex h-full w-full flex-col justify-between gap-3 rounded-xl border border-line bg-background/40 p-4 text-left transition-colors hover:border-mute"
    >
      <div>
        <p className="text-sm font-medium text-foreground" aria-hidden>
          {label}
        </p>
        {hint && (
          <p className="mt-1 text-xs leading-relaxed text-mute">{hint}</p>
        )}
      </div>
      <span
        className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${
          on ? "bg-lime" : "bg-line"
        }`}
        aria-hidden
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
      aria-pressed={active}
      onClick={onClick}
      className={`min-h-10 rounded-lg px-3 text-sm font-medium capitalize ${
        active
          ? "bg-lime text-background"
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
  const { settings, setSettings } = useTradingSettings();
  const [copied, setCopied] = useState(false);
  const [netMsg, setNetMsg] = useState<string | null>(null);
  const [backupMsg, setBackupMsg] = useState<string | null>(null);
  const [backupImport, setBackupImport] = useState("");
  const [backupPass, setBackupPass] = useState("");
  const [integrityMsg, setIntegrityMsg] = useState<string | null>(null);
  const [integrityBusy, setIntegrityBusy] = useState(false);

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
          <p className="text-[10px] uppercase tracking-[0.14em] text-mute">
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
              <p className="break-all text-xs text-foreground sm:text-sm">
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

      </div>

      {/* Trading grid */}
      <section className="rounded-2xl border border-line bg-panel p-5 sm:p-6">
        <p className="text-[10px] uppercase tracking-[0.14em] text-mute">
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
          <p className="text-[10px] uppercase tracking-[0.14em] text-mute">
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
            className="mt-4 inline-flex min-h-11 items-center rounded-xl bg-lime px-4 text-sm font-semibold text-background hover:opacity-90"
          >
            Add to wallet
          </button>
          {netMsg && <p className="mt-2 text-sm text-mute">{netMsg}</p>}
        </section>

        <section className="rounded-2xl border border-line bg-panel p-5 sm:p-6">
          <p className="text-[10px] uppercase tracking-[0.14em] text-mute">
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
        <p className="text-[10px] uppercase tracking-[0.14em] text-mute">
          Vault notes backup
        </p>
        <p className="mt-2 text-sm text-mute">
          Secrets live in this browser. Export before clearing site data.
          Prefer a passphrase lock so a stolen file is not free money. Losing
          this backup loses vault access — privacy does not include recovery
          magic.
        </p>
        <p className="mt-2 text-xs text-mute">
          Privacy path: shield → private trade / private send. Cash out
          publishes amount on the explorer by design.
        </p>
        <label
          htmlFor="backup-pass"
          className="mt-4 block text-sm font-medium text-foreground"
        >
          Backup passphrase{" "}
          <span className="font-normal text-mute">(recommended)</span>
        </label>
        <input
          id="backup-pass"
          type="password"
          autoComplete="new-password"
          value={backupPass}
          onChange={(e) => setBackupPass(e.target.value)}
          placeholder="Lock / unlock backup"
          className="mt-2 min-h-11 w-full rounded-md border border-line bg-transparent px-4 text-sm outline-none focus:border-lime"
        />
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={!isConnected}
            onClick={async () => {
              setBackupMsg(null);
              try {
                const backup = exportNotesBackup(address);
                if (!backup.notes.length) {
                  setBackupMsg("No spendable notes to export.");
                  return;
                }
                const json = JSON.stringify(backup, null, 2);
                const text = backupPass.trim()
                  ? await sealWithPassphrase(json, backupPass)
                  : json;
                await navigator.clipboard.writeText(text);
                setBackupMsg(
                  backupPass.trim()
                    ? `Copied locked backup (${backup.notes.length} note(s)).`
                    : `Copied plain backup (${backup.notes.length} note(s)). Anyone with it can spend.`
                );
              } catch (e) {
                setBackupMsg(
                  e instanceof Error ? e.message : "Could not copy backup."
                );
              }
            }}
            className="inline-flex min-h-11 items-center rounded-xl bg-lime px-4 text-sm font-semibold text-background disabled:opacity-50"
          >
            Copy backup
          </button>
          <button
            type="button"
            disabled={!isConnected}
            onClick={async () => {
              setBackupMsg(null);
              try {
                const backup = exportNotesBackup(address);
                const json = JSON.stringify(backup, null, 2);
                const text = backupPass.trim()
                  ? await sealWithPassphrase(json, backupPass)
                  : json;
                const blob = new Blob([text], {
                  type: backupPass.trim()
                    ? "text/plain"
                    : "application/json",
                });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = backupPass.trim()
                  ? `gloam-notes-locked-${Date.now()}.txt`
                  : `gloam-notes-${Date.now()}.json`;
                a.click();
                URL.revokeObjectURL(url);
                setBackupMsg(
                  backup.notes.length
                    ? `Downloaded ${backup.notes.length} note(s)${
                        backupPass.trim() ? " (locked)" : ""
                      }.`
                    : "Empty backup file downloaded."
                );
              } catch (e) {
                setBackupMsg(
                  e instanceof Error ? e.message : "Download failed."
                );
              }
            }}
            className="inline-flex min-h-11 items-center rounded-xl border border-line px-4 text-sm font-medium text-foreground hover:border-lime/50 disabled:opacity-50"
          >
            Download
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
          placeholder='Paste JSON or gloambak1.… locked backup'
          className="mt-2 w-full rounded-md border border-line bg-transparent p-3 text-[11px] outline-none focus:border-lime"
        />
        <button
          type="button"
          disabled={!backupImport.trim() || !isConnected}
          onClick={() => {
            void (async () => {
              setBackupMsg(null);
              try {
                let raw = backupImport.trim();
                if (isSealedBackup(raw)) {
                  if (!backupPass.trim()) {
                    setBackupMsg("Enter the passphrase for this locked backup.");
                    return;
                  }
                  raw = await openWithPassphrase(raw, backupPass);
                }
                const res = importNotesBackup(raw, address);
                if (res.ok) {
                  setBackupMsg(
                    `Restored ${res.count} note(s). Open Portfolio / Move.`
                  );
                  setBackupImport("");
                } else {
                  setBackupMsg(res.error);
                }
              } catch (e) {
                setBackupMsg(
                  e instanceof Error ? e.message : "Import failed."
                );
              }
            })();
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

      <section className="rounded-2xl border border-line bg-panel p-5 sm:p-6">
        <p className="text-[10px] uppercase tracking-[0.14em] text-mute">
          Vault health
        </p>
        <div className="mt-3">
          <VaultHealth />
        </div>
      </section>

      <section className="rounded-2xl border border-line bg-panel p-5 sm:p-6">
        <p className="text-[10px] uppercase tracking-[0.14em] text-mute">
          Proving artifacts
        </p>
        <p className="mt-2 text-sm text-mute">
          Ceremony:{" "}
          <strong className="text-foreground">{PROVING_CEREMONY}</strong>
          {PROVING_CEREMONY === "dev"
            ? " — not for real money."
            : " — production fingerprints."}
        </p>
        <ul className="mt-3 space-y-1 text-[11px] text-mute">
          {(
            [
              ["unshield zkey", CIRCUIT_ARTIFACTS.unshieldZkey.sha256],
              ["transfer zkey", CIRCUIT_ARTIFACTS.transferZkey.sha256],
              ["sealed swap zkey", CIRCUIT_ARTIFACTS.sealedSwapZkey.sha256],
              ["unshield wasm", CIRCUIT_ARTIFACTS.unshieldWasm.sha256],
              ["transfer wasm", CIRCUIT_ARTIFACTS.transferWasm.sha256],
              ["sealed swap wasm", CIRCUIT_ARTIFACTS.sealedSwapWasm.sha256],
            ] as const
          ).map(([label, hash]) => (
            <li key={label}>
              {label}:{" "}
              <span className="text-foreground">
                {hash.slice(0, 12)}…{hash.slice(-8)}
              </span>
            </li>
          ))}
        </ul>
        <button
          type="button"
          disabled={integrityBusy}
          onClick={() => {
            void (async () => {
              setIntegrityBusy(true);
              setIntegrityMsg(null);
              try {
                await assertUnshieldArtifacts();
                await assertTransferArtifacts();
                await assertSealedSwapArtifacts();
                setIntegrityMsg("All six artifacts match expected SHA-256.");
              } catch (e) {
                setIntegrityMsg(
                  e instanceof Error ? e.message : "Integrity check failed"
                );
              } finally {
                setIntegrityBusy(false);
              }
            })();
          }}
          className="mt-4 inline-flex min-h-11 items-center rounded-xl border border-line px-4 text-sm font-medium text-foreground hover:border-lime/50 disabled:opacity-50"
        >
          {integrityBusy ? "Checking…" : "Verify circuit files"}
        </button>
        {integrityMsg && (
          <p className="mt-2 text-sm text-mute" role="status">
            {integrityMsg}
          </p>
        )}
        <p className="mt-4 text-xs text-mute">
          <a href="/docs/production" className="text-lime hover:underline">
            Production gate
          </a>
          {" · "}
          <button
            type="button"
            className="text-lime hover:underline"
            onClick={() => {
              resetOnboarding();
              setIntegrityMsg("Start checklist restored on Portfolio.");
            }}
          >
            Show start checklist
          </button>
        </p>
      </section>
    </div>
  );
}
