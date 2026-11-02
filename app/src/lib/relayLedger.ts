/**
 * Gloam's own record of its Relay bridges, for /admin. Server only.
 *
 * Relay's history is one way to count them (lib/relayVolume); this is the
 * other, and it needs no tag and no filter. When a bridge is quoted its request
 * id goes on an open list. /admin later asks Relay about each open quote and
 * moves what finished to a list of finished requests, which is kept for good.
 *
 * What is written, and all that is written:
 *  - open quotes: the request id, the time and, for a bridge to a deposit
 *    address, that address. Relay made the address for this one quote: it is not
 *    the person's wallet, and it is dropped once the quote closes. A quote
 *    nobody pays is dropped when its window ends.
 *  - finished requests: the rows lib/relayVolume keeps, with no wallets.
 *
 * Best effort throughout: a store that is slow or down must never touch a quote,
 * so nothing here throws.
 */
import { kv } from "./partnersKv";

const OPEN_KEY = "gloam:relay:own:open:v1";
const ROWS_KEY = "gloam:relay:own:rows:v1";
/** Open quotes kept; the oldest go first, so a burst of unpaid quotes can't grow the store. */
const MAX_OPEN = 2_000;
/** How long an unpaid quote stays open. An exchange withdrawal can take a while. */
export const OPEN_MS = 7 * 86_400_000;

/** The most a quote waits for the record. */
const WRITE_WAIT_MS = 500;

const REQUEST_ID = /^0x[0-9a-fA-F]{64}$/;
const DEPOSIT_ADDRESS = /^[A-Za-z0-9]{25,64}$/;

export type OpenQuote = {
  requestId: string;
  /** Set for a bridge to a deposit address: the one id that stays true (see lookup in lib/relayVolume). */
  depositAddress: string | null;
  /** Unix ms the quote was made. */
  at: number;
};

/** Stored as one string, so moving it down the queue keeps it whole. */
const member = (q: OpenQuote) => [q.requestId, q.depositAddress ?? "", q.at].join("|");

function parseMember(raw: unknown): (OpenQuote & { raw: string }) | null {
  if (typeof raw !== "string") return null;
  const [requestId = "", depositAddress = "", at = ""] = raw.split("|");
  if (!REQUEST_ID.test(requestId) || !Number.isFinite(Number(at))) return null;
  return { requestId, depositAddress: depositAddress || null, at: Number(at), raw };
}

/** Put a fresh quote on the open list. A quote waits on this for moments at most, and never fails with it. */
export async function noteRelayQuote(requestId: string, depositAddress?: string | null, at = Date.now()): Promise<void> {
  if (!REQUEST_ID.test(requestId)) return;
  const address = depositAddress && DEPOSIT_ADDRESS.test(depositAddress) ? depositAddress : null;
  const write = (async () => {
    await kv([
      ["ZADD", OPEN_KEY, at, member({ requestId, depositAddress: address, at })],
      ["ZREMRANGEBYRANK", OPEN_KEY, 0, -(MAX_OPEN + 1)],
    ]);
  })().catch(() => {});
  await Promise.race([write, new Promise<void>((done) => setTimeout(done, WRITE_WAIT_MS))]);
}

/** The open quotes asked about longest ago, up to `limit`, so each gets a turn. */
export async function dueRelayQuotes(limit: number): Promise<(OpenQuote & { raw: string })[]> {
  try {
    const [raw] = await kv([["ZRANGE", OPEN_KEY, 0, limit - 1]]);
    return (Array.isArray(raw) ? raw : []).map(parseMember).filter((q): q is OpenQuote & { raw: string } => q !== null);
  } catch {
    return [];
  }
}

/** After a round of checks: `closed` leave the list, `waiting` go to the back of the queue. */
export async function settleRelayQuotes(closed: string[], waiting: string[], now = Date.now()): Promise<void> {
  const cmds: (string | number)[][] = [];
  if (closed.length) cmds.push(["ZREM", OPEN_KEY, ...closed]);
  if (waiting.length) cmds.push(["ZADD", OPEN_KEY, ...waiting.flatMap((m) => [now, m])]);
  if (!cmds.length) return;
  try {
    await kv(cmds);
  } catch {
    /* they stay open and are asked about again */
  }
}

/** Every finished request on record, by Relay request id. */
export async function readRelayRows<T>(): Promise<Map<string, T>> {
  const out = new Map<string, T>();
  try {
    const [raw] = await kv([["HGETALL", ROWS_KEY]]);
    const flat = Array.isArray(raw) ? raw : [];
    for (let i = 0; i + 1 < flat.length; i += 2) {
      try {
        out.set(String(flat[i]), JSON.parse(String(flat[i + 1])) as T);
      } catch {
        /* one bad entry never hides the rest */
      }
    }
  } catch {
    /* an empty record: Relay's history still answers */
  }
  return out;
}

/** Add finished requests to the record. Relay's id is the key, so a request is only ever kept once. */
export async function saveRelayRows<T>(rows: readonly (readonly [string, T])[]): Promise<void> {
  if (!rows.length) return;
  try {
    await kv([["HSET", ROWS_KEY, ...rows.flatMap(([id, row]) => [id, JSON.stringify(row)])]]);
  } catch {
    /* the next read tries again */
  }
}
