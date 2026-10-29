/**
 * The public numbers on /stats: the mainnets only, totals only, read from the
 * same server figures the MCP's gloam_vault_stats and /api/v1/stats serve
 * (lib/onchainMetrics), so no page re-reads a chain on its own.
 *
 * What stays out, on purpose: every wallet address (depositors, cash-out
 * recipients, recent rows), any count of wallets or people, the testnets, and
 * the fee figures. The figures here are counts of on-chain actions and the
 * vaults' live balances, nothing else.
 *
 * Reading: fetchOnchainMetrics serves a snapshot under a minute old from memory
 * or Redis and otherwise makes one shared incremental read. A page waits for
 * that read up to READ_BUDGET_MS, then falls back to the last snapshot of any
 * age and says how old it is. At build time it never reads a chain.
 */

import { PHASE_PRODUCTION_BUILD } from "next/constants";
import { fetchOnchainMetrics, lastOnchainSnapshot, type DayRow, type OnchainMetrics } from "./onchainMetrics";
import { MAINNET_LAUNCH_ISO, MAINNET_LAUNCH_MS } from "./mainnet";
import { getNetwork, isNetworkKey, NETWORK_KEYS, type NetworkKey } from "./networks";
import { utcDay } from "./tractionStore";

export type PublicHolding = {
  symbol: string;
  stable: boolean;
  /** Whole units, as read (stablecoins to 2 decimals, others to 6). */
  held: string;
  /** Null: no dollar price, so left out of the total. */
  heldUsd: number | null;
};

export type PublicCounts = {
  deposits: number;
  transfers: number;
  cashouts: number;
  memos: number;
};

export type PublicNetwork = PublicCounts & {
  key: NetworkKey;
  label: string;
  chainId: number;
  pool: string;
  /** ms: when this vault's deploy block was made. */
  openedMs: number | null;
  /** ms: counts on this network start here (the launch, or the vault's opening if later). */
  countsFromMs: number;
  heldUsd: number;
  unpriced: string[];
  /** What it holds now, largest first; nothing held is left out. */
  holdings: PublicHolding[];
  /** The last read of this network failed, so its figures are from the read before. */
  readFailed: boolean;
  /** A long backlog is still being read; the counts will still go up. */
  catchingUp: boolean;
};

/** One UTC day. Payment messages are counted in total only, not per day. */
export type PublicDay = { day: string; deposits: number; transfers: number; cashouts: number };

export type PublicStats = {
  /** ISO time the figures were read from the chains. */
  asOf: string;
  ageSec: number;
  countedSince: string;
  total: PublicCounts & { heldUsd: number; unpriced: string[] };
  networks: PublicNetwork[];
  /** One row per UTC day since launch, oldest first. */
  daily: PublicDay[];
  /**
   * Deposits, transfers and cash-outs in the totals but in no day yet: their
   * blocks are still being dated. The page says so, so the chart never looks
   * like it adds up when it does not.
   */
  undated: number;
};

/** How long a page waits for a fresh read before showing the last snapshot. */
const READ_BUDGET_MS = 20_000;

const round2 = (n: number) => Math.round(n * 100) / 100;

function sinceLaunchRows(m: OnchainMetrics): DayRow[] {
  const launchDay = utcDay(MAINNET_LAUNCH_MS);
  const rows = m.mainnet?.sinceLaunch ?? (m.mainnet?.daily ?? []).filter((d) => d.day >= launchDay);
  return rows.filter((d) => d.day >= launchDay);
}

/** The public view of a snapshot. Pure, so the self-test can check it. */
export function toPublicStats(m: OnchainMetrics): PublicStats {
  const order = new Map(NETWORK_KEYS.map((k, i) => [k, i]));
  const mainnets = m.networks
    .filter((n) => isNetworkKey(n.key) && !(n.testnet ?? getNetwork(n.key).testnet))
    .sort((a, b) => (order.get(a.key) ?? 99) - (order.get(b.key) ?? 99));

  const networks: PublicNetwork[] = mainnets.map((n) => {
    const openedMs = n.vaultSince ? n.vaultSince * 1000 : null;
    return {
      key: n.key,
      label: n.label,
      chainId: n.chainId,
      pool: n.pool,
      openedMs,
      countsFromMs: Math.max(MAINNET_LAUNCH_MS, openedMs ?? 0),
      deposits: n.deposits,
      transfers: n.transfers,
      cashouts: n.cashouts,
      memos: n.memos,
      heldUsd: round2(n.heldUsd),
      unpriced: n.unpriced,
      holdings: n.assets
        .filter((a) => a.held != null && Number(a.held) > 0)
        .map((a) => ({ symbol: a.symbol, stable: a.stable, held: a.held as string, heldUsd: a.heldUsd == null ? null : round2(a.heldUsd) }))
        .sort((x, y) => (y.heldUsd ?? -1) - (x.heldUsd ?? -1)),
      readFailed: Boolean(n.error),
      catchingUp: n.catchingUp,
    };
  });

  const sum = (f: (n: PublicNetwork) => number) => networks.reduce((a, n) => a + f(n), 0);
  const daily = sinceLaunchRows(m).map((d) => ({ day: d.day, deposits: d.deposits, transfers: d.transfers, cashouts: d.cashouts }));
  const actions = sum((n) => n.deposits + n.transfers + n.cashouts);
  const dated = daily.reduce((a, d) => a + d.deposits + d.transfers + d.cashouts, 0);
  return {
    asOf: m.asOf,
    ageSec: m.ageSec,
    countedSince: MAINNET_LAUNCH_ISO,
    total: {
      // Added up here from the same rows the page lists, so the total always matches them.
      heldUsd: round2(sum((n) => n.heldUsd)),
      unpriced: networks.flatMap((n) => n.unpriced.map((s) => `${s} on ${n.label}`)),
      deposits: sum((n) => n.deposits),
      transfers: sum((n) => n.transfers),
      cashouts: sum((n) => n.cashouts),
      memos: sum((n) => n.memos),
    },
    networks,
    daily,
    undated: Math.max(0, actions - dated),
  };
}

/**
 * The figures for /stats, or null when there are none to show: no fresh read
 * within the budget and no snapshot left. Never throws.
 */
export async function getPublicStats(): Promise<PublicStats | null> {
  let m: OnchainMetrics | null = null;
  if (process.env.NEXT_PHASE !== PHASE_PRODUCTION_BUILD) {
    m = await Promise.race([
      fetchOnchainMetrics(),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), READ_BUDGET_MS)),
    ]).catch(() => null);
  }
  if (!m) m = await lastOnchainSnapshot().catch(() => null);
  return m ? toPublicStats(m) : null;
}
