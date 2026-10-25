/**
 * The agent's spending log: a local JSON file the owner can read. Same rules as
 * the Gloam MCP server's (mcp/src/spendLog.ts).
 *
 * Every spend is written as "pending" before it is signed, so the check and
 * the reservation happen together under a lock and two calls at once cannot
 * both squeeze under the daily cap. The entry is then settled: "sent",
 * "unconfirmed" (broadcast, receipt unknown), "reverted" or "failed" (nothing
 * moved). Pending, sent and unconfirmed count against the cap; refusals are
 * logged too, so the owner can see what an agent tried. No secrets are written
 * here: amounts, assets, recipients (Gloam addresses or 0x addresses) and hashes.
 */
import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import type { Address } from "viem";
import { withFileLock } from "./fileLock.js";
import { DAY_MS, type CountedSpend, type SpendAction } from "./limits.js";

export type SpendStatus = "pending" | "sent" | "unconfirmed" | "reverted" | "failed" | "refused";

export const COUNTED_STATUSES: SpendStatus[] = ["pending", "sent", "unconfirmed"];

export type SpendEntry = {
  id: string;
  agent: string;
  action: SpendAction;
  network: string;
  chainId: number;
  asset: Address;
  symbol: string;
  /** raw units */
  amountWei: string;
  /** display units */
  amount: string;
  recipient: string | null;
  status: SpendStatus;
  reason?: string;
  hash?: string;
  at: string;
  settledAt?: string;
};

type LogFile = { version: 1; entries: SpendEntry[] };

const KEEP_MS = 30 * 24 * 60 * 60 * 1000;
const KEEP_MAX = 2000;

export class SpendLog {
  constructor(readonly path: string) {}

  private locked<T>(fn: () => T): T {
    return withFileLock(this.path, "spending log", fn);
  }

  read(): SpendEntry[] {
    if (!existsSync(this.path)) return [];
    try {
      const parsed = JSON.parse(readFileSync(this.path, "utf8")) as Partial<LogFile>;
      return Array.isArray(parsed.entries) ? parsed.entries : [];
    } catch {
      // A damaged log must not let spending through: refuse until the owner looks.
      throw new Error(`The spending log at ${this.path} cannot be read. Fix or move it before the agent spends again.`);
    }
  }

  private write(entries: SpendEntry[], now: number) {
    const cutoff = now - KEEP_MS;
    const recent = entries.filter((e) => Date.parse(e.at) > cutoff);
    // Over the cap, drop the oldest entries that no longer count. A spend that
    // still counts against today's cap is never dropped.
    let drop = recent.length - KEEP_MAX;
    const counts = (e: SpendEntry) => COUNTED_STATUSES.includes(e.status) && Date.parse(e.at) > now - 2 * DAY_MS;
    const kept = drop > 0 ? recent.filter((e) => (drop > 0 && !counts(e) ? (drop--, false) : true)) : recent;
    const tmp = `${this.path}.${process.pid}.tmp`;
    writeFileSync(tmp, JSON.stringify({ version: 1, entries: kept } satisfies LogFile, null, 2), { mode: 0o600 });
    renameSync(tmp, this.path);
  }

  /** Check and reserve in one step: `decide` sees what counts now and returns a refusal, or null to reserve. */
  reserve(
    entry: Omit<SpendEntry, "status">,
    decide: (counted: CountedSpend[]) => string | null,
    now: number = Date.now()
  ): { ok: true } | { ok: false; reason: string } {
    return this.locked(() => {
      const entries = this.read();
      const reason = decide(counted(entries, entry.agent));
      entries.push(reason ? { ...entry, status: "refused", reason } : { ...entry, status: "pending" });
      this.write(entries, now);
      return reason ? { ok: false as const, reason } : { ok: true as const };
    });
  }

  /** Record a refusal made before any check could reserve. */
  note(entry: SpendEntry, now: number = Date.now()) {
    this.locked(() => this.write([...this.read(), entry], now));
  }

  settle(id: string, status: Exclude<SpendStatus, "pending" | "refused">, extra: { hash?: string; reason?: string } = {}) {
    const now = Date.now();
    this.locked(() => {
      const entries = this.read().map((e) => (e.id === id ? { ...e, status, ...extra, settledAt: new Date(now).toISOString() } : e));
      this.write(entries, now);
    });
  }
}

/** The entries that count against an agent's caps: payments and cash outs, not adds to its own balance. */
export function counted(entries: SpendEntry[], agent: string): CountedSpend[] {
  return entries
    .filter((e) => e.agent === agent && e.action !== "add" && COUNTED_STATUSES.includes(e.status))
    .map((e) => ({ chainId: e.chainId, asset: e.asset, amountWei: BigInt(e.amountWei), at: Date.parse(e.at) }));
}
