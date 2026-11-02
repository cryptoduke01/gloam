/**
 * The private-balance backup (lib/recovery) for a Gloam wallet, kept on by itself.
 *
 * A Gloam wallet opens on any device with the same email or passkey. The private
 * balance lives in the browser, so it has to follow too. Recovery already does
 * that with a wallet signature: the same wallet signing the same fixed message
 * rebuilds the same key, which finds and opens the encrypted backup. Turnkey
 * signs with the same key from any device, so after each sign-in this:
 *  - does nothing when this browser already backs up (with any wallet or passkey),
 *    or when the person turned recovery off here (lib/recovery recoveryTurnedOffHere)
 *  - otherwise turns recovery on with the Gloam wallet: two signatures, compared,
 *    so a wallet that signs differently each time is caught before any backup is
 *    made under a key nobody could rebuild. Turning on merges a backup that is
 *    already there, so on a new device this is also the restore.
 *
 * Signing in a Gloam wallet is silent (Turnkey's session signs, no prompt), so
 * none of this asks the person anything. When the wallet's signature turns out
 * not to be steady, nothing is saved and Settings offers a passkey instead.
 *
 * Checked by scripts/selftest-embedded-recovery.mts, with a deterministic signer
 * going through the wallet's own provider.
 */
import {
  RecoveryError,
  recoveryState,
  recoveryTurnedOffHere,
  startRecoverySync,
  subscribeRecovery,
  turnOnWithWallet,
  type RecoveryWallet,
} from "./recovery";

export type EmbeddedRecoveryResult =
  /** Turned on now; `restored` notes came back from a backup made on another device. */
  | { kind: "on"; restored: number }
  /** This browser already backs up. */
  | { kind: "already" }
  /** The person turned recovery off on this browser: left off. */
  | { kind: "declined" }
  /** The wallet signs differently each time: no backup was made. Use a passkey in Settings. */
  | { kind: "unsupported" }
  | { kind: "failed"; message: string };

export type EmbeddedRecoveryDeps = {
  state: typeof recoveryState;
  subscribe: typeof subscribeRecovery;
  start: typeof startRecoverySync;
  turnOn: typeof turnOnWithWallet;
  turnedOff: typeof recoveryTurnedOffHere;
  /** How long to wait for the saved settings to be read. */
  readyMs?: number;
};

const DEFAULT_DEPS: EmbeddedRecoveryDeps = {
  state: recoveryState,
  subscribe: subscribeRecovery,
  start: startRecoverySync,
  turnOn: turnOnWithWallet,
  turnedOff: recoveryTurnedOffHere,
};

/** One run per wallet per page: a signer that is rebuilt (or a strict-mode effect) asks nothing twice. */
const runs = new Map<string, Promise<EmbeddedRecoveryResult>>();
const listeners = new Set<() => void>();
let last: { address: string; result: EmbeddedRecoveryResult } | null = null;

/** The last result on this page, for the wallet sheet to say whether the backup is on. */
export function embeddedRecoveryResult(): typeof last {
  return last;
}

export function onEmbeddedRecovery(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function settingsRead(deps: EmbeddedRecoveryDeps): Promise<boolean> {
  if (deps.state().ready) return Promise.resolve(true);
  return new Promise((resolve) => {
    const stop = deps.subscribe(() => {
      if (!deps.state().ready) return;
      stop();
      clearTimeout(t);
      resolve(true);
    });
    const t = setTimeout(() => {
      stop();
      resolve(deps.state().ready);
    }, deps.readyMs ?? 10_000);
  });
}

export function syncEmbeddedRecovery(wallet: RecoveryWallet, deps: EmbeddedRecoveryDeps = DEFAULT_DEPS): Promise<EmbeddedRecoveryResult> {
  const key = wallet.address.toLowerCase();
  const running = runs.get(key);
  if (running) return running;
  const run = (async (): Promise<EmbeddedRecoveryResult> => {
    deps.start();
    if (!(await settingsRead(deps))) return { kind: "failed", message: "This browser's backup settings didn't load." };
    if (deps.state().on) return { kind: "already" };
    if (deps.turnedOff()) return { kind: "declined" };
    try {
      return { kind: "on", restored: await deps.turnOn(wallet) };
    } catch (e) {
      if (e instanceof RecoveryError && e.code === "unsupported") return { kind: "unsupported" };
      return { kind: "failed", message: e instanceof Error ? e.message : "The backup didn't turn on." };
    }
  })().then((result) => {
    // A failure may pass (a server that was down): the next sign-in tries again.
    if (result.kind === "failed") runs.delete(key);
    last = { address: wallet.address, result };
    listeners.forEach((fn) => fn());
    return result;
  });
  runs.set(key, run);
  return run;
}

/** For the self-tests: forget every run, as a new page would. */
export function resetEmbeddedRecovery() {
  runs.clear();
  last = null;
}
