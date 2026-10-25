/**
 * A cross-process lock for the plugin's local JSON files (the spending log and
 * the note store): an exclusive lock file next to the data file. Two function
 * calls at once, or two agent processes sharing a file, take turns. The same
 * lock the Gloam MCP server uses (mcp/src/fileLock.ts).
 */
import { closeSync, mkdirSync, openSync, rmSync, statSync } from "node:fs";
import { dirname } from "node:path";

const sleeper = new Int32Array(new SharedArrayBuffer(4));
function pause(ms: number) {
  Atomics.wait(sleeper, 0, 0, ms);
}

/** Run fn while holding `${path}.lock`. `what` names the file in the error, e.g. "spending log". */
export function withFileLock<T>(path: string, what: string, fn: () => T): T {
  const lock = `${path}.lock`;
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  for (let i = 0; ; i++) {
    try {
      closeSync(openSync(lock, "wx"));
      break;
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e;
      // A lock left by a crashed process is cleared after 10 seconds.
      try {
        if (Date.now() - statSync(lock).mtimeMs > 10_000) rmSync(lock, { force: true });
      } catch {
        /* it went away */
      }
      if (i > 200) throw new Error(`The ${what} is locked (${lock}). Try again.`);
      pause(15);
    }
  }
  try {
    return fn();
  } finally {
    rmSync(lock, { force: true });
  }
}
