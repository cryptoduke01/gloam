"use client";

import Link from "next/link";
import { useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { useSignMessage } from "wagmi";
import { useAppAccount } from "@/lib/demo";
import { WALLET_BROWSER_NOTE, inWalletBrowser, passkeySupport } from "@/lib/passkey";
import {
  RecoveryError,
  backupNow,
  bringInOlderBackup,
  connectRecovery,
  keysFromSecret,
  passkeySecret,
  recoveryServerState,
  recoveryState,
  restoreWithWallet,
  startRecoverySync,
  subscribeRecovery,
  turnOffRecovery,
  turnOnWithWallet,
  updateRecoveryKey,
  type RecoverySource,
  type RecoveryWallet,
} from "@/lib/recovery";
import { isTempoWallet } from "@/lib/tempoWallet";

type Busy = "on-wallet" | "on-passkey" | "restore-wallet" | "restore-passkey" | "save" | "off" | "update" | "older" | null;
/** "wait": nothing went wrong and nothing is finished yet, so it is not shown as done. */
type Message = { tone: "ok" | "wait" | "error"; text: string } | null;

function errorText(e: unknown): string {
  const name = (e as { name?: string } | null)?.name ?? "";
  const text = e instanceof Error ? e.message : "";
  if (name === "UserRejectedRequestError" || /reject|denied|cancel/i.test(text)) {
    return "Signing was cancelled. Nothing changed.";
  }
  return e instanceof RecoveryError ? e.message : "Something went wrong. Nothing changed. Try again.";
}

function plural(n: number, word: string) {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

function ago(ts: number | null): string {
  if (!ts) return "not backed up yet";
  const s = Math.max(0, Math.round((Date.now() - ts) / 1000));
  if (s < 60) return "backed up just now";
  if (s < 3600) return `backed up ${Math.round(s / 60)} min ago`;
  if (s < 86_400) return `backed up ${Math.round(s / 3600)} h ago`;
  return `backed up ${new Date(ts).toLocaleDateString()}`;
}

/** When this browser tries again by itself. */
function nextTry(ts: number | null): string {
  if (!ts) return "soon";
  const min = Math.round((ts - Date.now()) / 60_000);
  if (min < 2) return "in a moment";
  return min < 90 ? `in about ${min} min` : `in about ${Math.round(min / 60)} h`;
}

const NO_BACKUP_YET = "Your private balance is only in this browser for now.";

/** What to say after turning on: "backed up" only when that is true. */
function turnedOn(added: number): Exclude<Message, null> {
  const s = recoveryState();
  const back = added ? `${plural(added, "balance")} came back from your backup.` : "";
  if (!s.savedAt) {
    const text = `Recovery is set up, but there's no backup yet. ${NO_BACKUP_YET} This browser keeps trying on its own.`;
    return { tone: "wait", text: back ? `${back} ${text}` : text };
  }
  if (s.error) return { tone: "wait", text: `Recovery is on. ${back ? `${back} ` : ""}The latest save didn't go through, so this browser keeps trying.` };
  return { tone: "ok", text: `Recovery is on. ${back || "Your private balance is backed up."}` };
}

/** What to say after a restore, including where the backup's key ended up. */
function restored(added: number, key: Awaited<ReturnType<typeof restoreWithWallet>>["key"]): string {
  const done = added
    ? `Restored ${plural(added, "balance")}. Recovery is on for this browser too.`
    : "Your backup is connected. This browser already had everything in it.";
  if (key === "waiting") return `${done} The backup moves to the newer recovery key on its own as soon as it can.`;
  if (key === "older") return `${done} The backup stays on the older recovery key for now. You can update it in Settings.`;
  return done;
}

/** Shared state and actions for the settings card and the portfolio nudge. */
function useRecovery() {
  const state = useSyncExternalStore(subscribeRecovery, recoveryState, recoveryServerState);
  const { address, isConnected, connector, demo } = useAppAccount();
  const { signMessageAsync } = useSignMessage();
  const [passkeyOk, setPasskeyOk] = useState(false);
  const [walletBrowser, setWalletBrowser] = useState(false);
  const [busy, setBusy] = useState<Busy>(null);
  const [message, setMessage] = useState<Message>(null);

  useEffect(() => {
    startRecoverySync();
    let live = true;
    void passkeySupport().then((s) => {
      if (!live) return;
      setPasskeyOk(s !== "no");
      setWalletBrowser(inWalletBrowser());
    });
    return () => {
      live = false;
    };
  }, []);

  const active = isConnected && !demo;
  // Tempo Wallet signs with a passkey, differently every time: it can't hold a key.
  const walletOk = active && !isTempoWallet(connector);

  const wallet = (): RecoveryWallet => ({ address: address as string, sign: (message) => signMessageAsync({ message }) });

  async function run(kind: Exclude<Busy, null>, task: () => Promise<string | Exclude<Message, null>>) {
    if (busy) return;
    setBusy(kind);
    setMessage(null);
    try {
      const done = await task();
      setMessage(typeof done === "string" ? { tone: "ok", text: done } : done);
    } catch (e) {
      setMessage({ tone: "error", text: errorText(e) });
    } finally {
      setBusy(null);
    }
  }

  const turnOn = (source: RecoverySource) =>
    run(source === "wallet" ? "on-wallet" : "on-passkey", async () =>
      turnedOn(
        source === "wallet"
          ? await turnOnWithWallet(wallet())
          : await connectRecovery(await keysFromSecret("passkey", await passkeySecret("create")), address),
      ),
    );

  const restore = (source: RecoverySource) =>
    run(source === "wallet" ? "restore-wallet" : "restore-passkey", async () => {
      if (source === "wallet") {
        const { added, key } = await restoreWithWallet(wallet());
        return restored(added, key);
      }
      const keys = await keysFromSecret("passkey", await passkeySecret("use"));
      return restored(await connectRecovery(keys, address, { mustExist: true }), "newest");
    });

  const save = () =>
    run("save", async () => {
      await backupNow();
      return "Backed up.";
    });

  const off = () =>
    run("off", async () => {
      await turnOffRecovery({ deleteBackup: true });
      return "Recovery is off and the backup is deleted. Your balance stays in this browser.";
    });

  const update = () =>
    run("update", async () =>
      (await updateRecoveryKey(wallet())) === "newest"
        ? "Recovery key updated. Your backup moved across."
        : { tone: "wait", text: "Your backup stays on the older key for now and keeps saving. It moves on its own as soon as it can." },
    );

  const older = () =>
    run("older", async () => {
      const added = await bringInOlderBackup(wallet());
      return added
        ? `Brought in ${plural(added, "balance")} from your older backup.`
        : "Your older backup is merged in. This browser already had everything in it.";
    });

  return { state, active, walletOk, passkeyOk, walletBrowser, busy, message, turnOn, restore, save, off, update, older };
}

function Note({ message }: { message: Message }) {
  if (!message) return null;
  return (
    <p
      role={message.tone === "error" ? "alert" : "status"}
      className={`mt-3 text-[13px] leading-relaxed ${message.tone === "error" ? "text-danger" : message.tone === "wait" ? "text-warn" : "text-sealed"}`}
    >
      {message.text}
    </p>
  );
}

function Choice({
  label,
  hint,
  children,
}: {
  label: string;
  hint: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 py-4">
      <div className="min-w-0 max-w-[52ch]">
        <p className="text-[14px] text-foreground">{label}</p>
        <p className="mt-0.5 text-[13px] leading-relaxed text-mute">{hint}</p>
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-2">{children}</div>
    </div>
  );
}

/** Settings: turn recovery on, restore from it, or turn it off. */
export function RecoverySettingsCard() {
  const r = useRecovery();
  const [confirmOff, setConfirmOff] = useState(false);
  const { state, busy } = r;
  const noBackup = state.on && !state.savedAt;

  return (
    <section id="recovery" className="gl-card scroll-mt-24">
      <header className="max-sm:px-5 max-sm:pt-5 sm:px-6 sm:pt-6">
        <h2 className="text-[17px] text-foreground">Recovery</h2>
        <p className="mt-1 max-w-[62ch] text-[13.5px] leading-relaxed text-mute">
          Get your private balance back on any device, just by signing in. Your browser encrypts a copy before it leaves,
          and only your wallet or passkey can open it. We can&apos;t read it.
        </p>
        <p className="mt-2 max-w-[62ch] text-[13px] leading-relaxed text-faint">
          The copy holds your private notes, your receive keys, payment links you sent that haven&apos;t been claimed
          yet (with their codes) and payroll runs still on their way. It stays until you turn recovery off, which
          deletes it. Anyone with your recovery signature or passkey could open it, so only sign on gloam.trade.
        </p>
      </header>
      <div className="mt-2 divide-y divide-line pb-1 max-sm:px-5 max-sm:pb-4 sm:px-6 sm:pb-5">
        {!r.active ? (
          <Choice label="Recovery" hint="Connect a wallet to set up recovery.">
            {null}
          </Choice>
        ) : state.on ? (
          <div className="py-4">
            <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
              <div className="min-w-0">
                <p className="flex items-center gap-2 text-[14px] text-foreground">
                  <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${noBackup ? "bg-warn" : "bg-sealed"}`} />
                  {noBackup ? "No backup yet" : "Recovery is on"}
                </p>
                <p className="mt-0.5 text-[13px] text-mute">
                  {state.source === "passkey" ? "With a passkey" : "With your wallet"} · {state.busy ? "backing up…" : ago(state.savedAt)}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button type="button" onClick={r.save} disabled={Boolean(busy) || state.busy} className="btn btn-ghost btn-sm">
                  {busy === "save" ? "Backing up…" : noBackup ? "Try now" : "Back up now"}
                </button>
                {!confirmOff ? (
                  <button type="button" onClick={() => setConfirmOff(true)} disabled={Boolean(busy)} className="btn btn-ghost btn-sm">
                    Turn off
                  </button>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        setConfirmOff(false);
                        r.off();
                      }}
                      disabled={Boolean(busy)}
                      className="btn btn-ink btn-sm"
                    >
                      {busy === "off" ? "Turning off…" : "Turn off and delete backup"}
                    </button>
                    <button type="button" onClick={() => setConfirmOff(false)} className="btn btn-ghost btn-sm">
                      Keep it on
                    </button>
                  </>
                )}
              </div>
            </div>
            {noBackup && (
              <p className="mt-3 max-w-[62ch] text-[13px] leading-relaxed text-mute">
                {NO_BACKUP_YET} This browser tries again on its own {nextTry(state.retryAt)}, or the next time you open Gloam after that.
              </p>
            )}
            {state.error && r.message?.tone !== "error" && <p className="mt-3 text-[13px] text-danger">{state.error}</p>}
            <Note message={r.message} />
          </div>
        ) : (
          <>
            <Choice
              label="Turn on recovery"
              hint={
                r.walletOk
                  ? "Your wallet asks you to sign twice. It's free and sends nothing."
                  : "Tempo Wallet can't sign a recovery key, so use a passkey."
              }
            >
              {r.walletOk && (
                <button type="button" onClick={() => r.turnOn("wallet")} disabled={Boolean(busy)} className="btn btn-ink btn-sm">
                  {busy === "on-wallet" ? "Check your wallet…" : "With your wallet"}
                </button>
              )}
              {r.passkeyOk && (
                <button
                  type="button"
                  onClick={() => r.turnOn("passkey")}
                  disabled={Boolean(busy)}
                  className={r.walletOk ? "btn btn-ghost btn-sm" : "btn btn-ink btn-sm"}
                >
                  {busy === "on-passkey" ? "Check your passkey…" : "With a passkey"}
                </button>
              )}
            </Choice>
            <Choice
              label="Restore from your backup"
              hint={`On a new device? Sign in the same way you did when you turned recovery on.${r.walletOk ? " Your wallet may ask you to sign up to three times." : ""}`}
            >
              {r.walletOk && (
                <button type="button" onClick={() => r.restore("wallet")} disabled={Boolean(busy)} className="btn btn-ghost btn-sm">
                  {busy === "restore-wallet" ? "Check your wallet…" : "With your wallet"}
                </button>
              )}
              {r.passkeyOk && (
                <button type="button" onClick={() => r.restore("passkey")} disabled={Boolean(busy)} className="btn btn-ghost btn-sm">
                  {busy === "restore-passkey" ? "Check your passkey…" : "With a passkey"}
                </button>
              )}
            </Choice>
            {r.walletBrowser && !r.passkeyOk && (
              <p className="py-2 text-[12px] leading-relaxed text-mute">{WALLET_BROWSER_NOTE}</p>
            )}
            {r.message && (
              <div className="py-3">
                <Note message={r.message} />
              </div>
            )}
          </>
        )}
        {state.olderKey && r.walletOk && (
          <Choice
            label={state.gone ? "This backup moved" : "Newer recovery key"}
            hint={
              state.moving
                ? "Your backup is moving to the newer key. It finishes on its own and keeps saving until then."
                : state.gone
                  ? "Another device moved or removed this backup. Update here so your devices share one backup again. Your wallet asks you to sign three times."
                  : "It names this site, so wallets that check can warn you if another site asks for it. Your wallet asks you to sign three times. It's free and sends nothing."
            }
          >
            {!state.moving && (
              <button type="button" onClick={r.update} disabled={Boolean(busy) || state.busy} className="btn btn-ghost btn-sm">
                {busy === "update" ? "Check your wallet…" : "Update key"}
              </button>
            )}
          </Choice>
        )}
        {state.newerKey && r.walletOk && (
          <Choice label="Older backup" hint="Used recovery on another device before? Bring that backup in here.">
            <button type="button" onClick={r.older} disabled={Boolean(busy) || state.busy} className="btn btn-ghost btn-sm">
              {busy === "older" ? "Check your wallet…" : "Look for it"}
            </button>
          </Choice>
        )}
      </div>
    </section>
  );
}

const NUDGE_KEY = "gloam.recovery.nudge.v1";
const NUDGE_SNOOZE_MS = 7 * 86_400_000;

const nudgeListeners = new Set<() => void>();

function subscribeNudge(fn: () => void): () => void {
  nudgeListeners.add(fn);
  return () => {
    nudgeListeners.delete(fn);
  };
}

/** "hidden" while snoozed (or before the browser can say), else "shown". */
function nudgeSnapshot(): "hidden" | "shown" {
  try {
    return Date.now() - Number(localStorage.getItem(NUDGE_KEY) ?? 0) < NUDGE_SNOOZE_MS ? "hidden" : "shown";
  } catch {
    return "shown";
  }
}

const nudgeServerSnapshot = () => "hidden" as const;

function snoozeNudge() {
  try {
    localStorage.setItem(NUDGE_KEY, String(Date.now()));
  } catch {
    /* private mode */
  }
  for (const fn of nudgeListeners) fn();
}

/**
 * Portfolio: asks people with a private balance to turn recovery on, offers a
 * restore to people whose wallet made deposits this browser can't see, and
 * stays up (no snooze) while recovery is on with no backup to show for it.
 */
export function RecoveryNudge({ hasBalance, hasDeposits }: { hasBalance: boolean; hasDeposits: boolean }) {
  const r = useRecovery();
  const hidden = useSyncExternalStore(subscribeNudge, nudgeSnapshot, nudgeServerSnapshot) === "hidden";

  const restoreMode = !hasBalance && hasDeposits;
  const noBackup = r.state.on && !r.state.savedAt;
  const done = r.message?.tone === "ok" && !noBackup;
  if (!r.active || !r.state.ready || (r.state.on && !done && !noBackup) || (hidden && !noBackup) || (!hasBalance && !hasDeposits)) return null;

  const source: RecoverySource | null = r.walletOk ? "wallet" : r.passkeyOk ? "passkey" : null;
  const busy = Boolean(r.busy);
  const action = restoreMode ? r.restore : r.turnOn;
  const label = noBackup
    ? "Try now"
    : restoreMode
    ? source === "wallet"
      ? "Restore with your wallet"
      : "Restore with a passkey"
    : source === "wallet"
      ? "Turn on with your wallet"
      : "Turn on with a passkey";

  return (
    <section aria-labelledby="recovery-nudge-title" className="gl-card flex gap-4 max-sm:items-start max-sm:p-5 sm:items-center sm:py-4 sm:pl-6 sm:pr-4">
      <span aria-hidden className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-sealed-soft text-sealed">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
          <path d="M20 12a8 8 0 1 1-2.34-5.66M20 4v4.5h-4.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
      <div className="flex min-w-0 flex-1 max-sm:flex-col max-sm:gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
        <div className="min-w-0">
          <h2 id="recovery-nudge-title" className="text-[15px] text-foreground">
            {noBackup ? "No backup yet" : restoreMode ? "Restore your private balance" : "Don't lose your private balance"}
          </h2>
          {done ? (
            <p className="mt-0.5 max-w-[62ch] text-[13px] leading-relaxed text-sealed" role="status">
              {r.message?.text}
            </p>
          ) : (
            <p className="mt-0.5 max-w-[62ch] text-[13px] leading-relaxed text-mute">
              {noBackup
                ? `${NO_BACKUP_YET} This browser keeps trying on its own.`
                : restoreMode
                  ? "This wallet made deposits this browser can't see. Sign in to bring them back from your backup."
                  : "Turn on recovery and you can get it back on any device by signing in."}
              {noBackup && r.state.error && r.message?.tone !== "error" && <span className="mt-1 block text-danger">{r.state.error}</span>}
              {r.message?.tone === "error" && <span className="mt-1 block text-danger">{r.message.text}</span>}
            </p>
          )}
        </div>
        {!done && (
          <div className="flex shrink-0 flex-wrap items-center gap-2 max-sm:self-start">
            {noBackup ? (
              <button type="button" onClick={r.save} disabled={busy || r.state.busy} className="btn btn-ink btn-sm">
                {busy || r.state.busy ? "Backing up…" : label}
              </button>
            ) : source ? (
              <button type="button" onClick={() => action(source)} disabled={busy} className="btn btn-ink btn-sm">
                {busy ? (source === "wallet" ? "Check your wallet…" : "Check your passkey…") : label}
              </button>
            ) : null}
            <Link href={!noBackup && restoreMode ? "/app/settings#backup" : "/app/settings#recovery"} className="btn btn-ghost btn-sm">
              {noBackup ? "See recovery" : restoreMode ? "Use a backup file" : "Other ways"}
            </Link>
          </div>
        )}
      </div>
      {!noBackup && (
        <button
          type="button"
          onClick={snoozeNudge}
          aria-label="Hide for a week"
          title="Hide for a week"
          className="-mr-1.5 grid h-9 w-9 shrink-0 place-items-center rounded-full text-mute transition-colors hover:bg-surface hover:text-foreground max-sm:-mt-1.5"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
          </svg>
        </button>
      )}
    </section>
  );
}
