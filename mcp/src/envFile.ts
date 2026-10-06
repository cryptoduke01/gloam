/**
 * Settings file for the server: ~/.gloam/agent.env (or GLOAM_ENV_FILE).
 *
 * MCP clients start this server with whatever environment their config gives
 * it, and a plugin config should not carry keys. So the server also reads a
 * plain KEY=VALUE file of its own. Only GLOAM_* settings are taken from it, and
 * a variable already set in the environment always wins over the file.
 */
import { chmodSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

type Env = Record<string, string | undefined>;

export function defaultEnvFilePath(env: Env = process.env): string {
  return env.GLOAM_ENV_FILE?.trim() || join(homedir(), ".gloam", "agent.env");
}

const KEY = /^GLOAM_[A-Z0-9_]+$/;

/** Parse KEY=VALUE lines. Blank lines and # comments are skipped; `export ` and matching quotes are allowed. */
export function parseEnvFile(text: string): { values: Record<string, string>; ignored: string[] } {
  const values: Record<string, string> = {};
  const ignored: string[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const m = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (!m) continue;
    const [, key, rest] = m;
    let value = rest.trim();
    const quoted = /^(["'])(.*)\1$/.exec(value);
    if (quoted) value = quoted[2];
    else value = value.replace(/\s+#.*$/, "");
    if (!KEY.test(key)) {
      ignored.push(key);
      continue;
    }
    values[key] = value;
  }
  return { values, ignored };
}

export interface EnvFileResult {
  path: string;
  found: boolean;
  /** Keys taken from the file (not already set in the environment). */
  loaded: string[];
  warnings: string[];
}

/** Load the settings file into `env` without overriding anything already set. Never throws. */
export function loadEnvFile(env: Env = process.env): EnvFileResult {
  const path = defaultEnvFilePath(env);
  const explicit = Boolean(env.GLOAM_ENV_FILE?.trim());
  const result: EnvFileResult = { path, found: false, loaded: [], warnings: [] };
  if (!existsSync(path)) {
    if (explicit) result.warnings.push(`GLOAM_ENV_FILE points at ${path}, which does not exist.`);
    return result;
  }
  try {
    const st = statSync(path);
    if (process.platform !== "win32" && (st.mode & 0o077) !== 0) {
      result.warnings.push(`${path} can be read by other users of this machine and may hold a key. Run: chmod 600 ${path}`);
    }
    const { values, ignored } = parseEnvFile(readFileSync(path, "utf8"));
    result.found = true;
    for (const [key, value] of Object.entries(values)) {
      if (env[key] !== undefined) continue;
      env[key] = value;
      result.loaded.push(key);
    }
    if (ignored.length) result.warnings.push(`${path}: ignored ${ignored.join(", ")} (only GLOAM_* settings are read from this file).`);
  } catch (e) {
    result.warnings.push(`Could not read ${path}: ${e instanceof Error ? e.message : String(e)}`);
  }
  return result;
}

/**
 * Add settings to the file, creating it (mode 0600, directory 0700) if needed.
 * Existing keys are never replaced: those are returned in `kept`.
 */
export function appendEnvFile(
  path: string,
  entries: { key: string; value: string; comment?: string }[],
  header?: string
): { written: string[]; kept: string[] } {
  const existing = existsSync(path) ? readFileSync(path, "utf8") : "";
  const present = parseEnvFile(existing).values;
  const written: string[] = [];
  const kept: string[] = [];
  const lines: string[] = [];
  for (const e of entries) {
    if (!KEY.test(e.key)) throw new Error(`Not a Gloam setting: ${e.key}`);
    if (/[\r\n]/.test(e.value)) throw new Error(`Value for ${e.key} has a line break.`);
    if (e.key in present) {
      kept.push(e.key);
      continue;
    }
    if (e.comment) lines.push(`# ${e.comment}`);
    lines.push(`${e.key}=${e.value}`);
    written.push(e.key);
  }
  if (!lines.length) return { written, kept };
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const block = [header ? `# ${header}` : null, ...lines].filter(Boolean).join("\n");
  const sep = existing && !existing.endsWith("\n") ? "\n" : "";
  writeFileSync(path, `${existing}${sep}${existing ? "\n" : ""}${block}\n`, { mode: 0o600 });
  chmodSync(path, 0o600);
  return { written, kept };
}
