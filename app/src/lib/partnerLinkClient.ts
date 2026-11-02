"use client";

/**
 * Partner links, browser side. A pay or swap link from a partner carries their
 * link code as `p=` (lib/partnerCode). This module:
 *  - asks the server which partner a code is from, so the app can show
 *    "From Motion" with the name from the partner's own Gloam account
 *    (usePartnerName); a name typed into a link is never shown as a partner;
 *  - once a payment, cash out or swap opened from that link lands, reports its
 *    hash and the code (reportPartnerTx), and the server checks it on chain
 *    (lib/partnerAttribution);
 *  - for a cash out sent later by the relay, keeps the relay's job id and the
 *    code in this browser until the job has gone out, then reports its hash
 *    (queuePartnerJobs, processPartnerQueue). Nothing else is kept, and an
 *    entry is dropped once reported, ended, or four days old.
 *
 * None of this ever holds up a payment or a swap: every call is fire and forget,
 * and a failure is silent. What is sent is the code, the chain, the hash and the
 * flow: never an amount, an address or a note.
 */
import type { Hex } from "viem";
import { useEffect, useState } from "react";
import { isLinkCodeShape } from "./partnerCode";
import { readDemo } from "./demoFlag";

export type LinkFlow = "pay" | "swap";

const names = new Map<string, Promise<string | null>>();

/** The partner name for a live code, null for a code that is not live; cached per page. */
export function lookupPartnerName(code: string): Promise<string | null> {
  const hit = names.get(code);
  if (hit) return hit;
  const p = fetch(`/api/partners/link-code?code=${encodeURIComponent(code)}`, { cache: "no-store", credentials: "same-origin" })
    .then(async (res) => {
      if (!res.ok) return null;
      const json = (await res.json().catch(() => null)) as { ok?: boolean; data?: { name?: unknown } } | null;
      return json?.ok && typeof json.data?.name === "string" && json.data.name.trim() ? json.data.name : null;
    })
    .catch(() => {
      // a network blip: ask again next time rather than remember "nobody"
      names.delete(code);
      return null;
    });
  names.set(code, p);
  return p;
}

/** The partner a link's code is from, once the server says the code is live; null otherwise. */
export function usePartnerName(code: string | null | undefined): string | null {
  const [found, setFound] = useState<{ code: string; name: string | null } | null>(null);
  useEffect(() => {
    if (!code || !isLinkCodeShape(code) || readDemo()) return;
    let live = true;
    void lookupPartnerName(code).then((name) => {
      if (live) setFound({ code, name });
    });
    return () => {
      live = false;
    };
  }, [code]);
  return code && found?.code === code ? found.name : null;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
/** Waits before each try: the chain's node may be a block or two behind the app. */
const RETRY_WAITS_MS = [0, 4_000, 10_000, 25_000, 60_000];
const reported = new Set<string>();

/**
 * Reports one landed transaction from a partner's link. Never throws, never
 * waits: it retries in the background while the node catches up, and gives up
 * quietly on any refusal.
 */
export function reportPartnerTx(r: { code: string; chainId: number; txHash: Hex | string; flow: LinkFlow }): void {
  if (typeof window === "undefined" || readDemo()) return;
  if (!isLinkCodeShape(r.code) || !Number.isSafeInteger(r.chainId) || !/^0x[0-9a-fA-F]{64}$/.test(r.txHash)) return;
  const key = `${r.chainId}:${r.txHash.toLowerCase()}`;
  if (reported.has(key)) return;
  reported.add(key);
  const body = JSON.stringify({ code: r.code, chainId: r.chainId, txHash: r.txHash, flow: r.flow });
  void (async () => {
    for (const wait of RETRY_WAITS_MS) {
      if (wait) await sleep(wait);
      try {
        const res = await fetch("/api/partners/attribute", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body,
          credentials: "same-origin",
          cache: "no-store",
          keepalive: true,
        });
        if (res.ok) return;
        const json = (await res.json().catch(() => null)) as { error?: { code?: string } } | null;
        // not on the node yet, busy, or down: try again; anything else is a final answer
        if (res.status === 404 && json?.error?.code === "tx_not_found") continue;
        if (res.status === 429 || res.status >= 500) continue;
        return;
      } catch {
        /* offline for a moment: try again */
      }
    }
  })();
}

// ---------------------------------------------------------------- cash outs sent later

const QUEUE_KEY = "gloam.partner-pending.v1";
const QUEUE_MAX_AGE_MS = 4 * 86_400_000;
const QUEUE_MAX = 50;

type Pending = { job: string; chainId: number; code: string; at: number };

function readQueue(): Pending[] {
  try {
    const raw = JSON.parse(window.localStorage.getItem(QUEUE_KEY) ?? "[]") as unknown;
    if (!Array.isArray(raw)) return [];
    return raw.filter(
      (e): e is Pending =>
        Boolean(e) &&
        typeof e.job === "string" &&
        e.job.length <= 80 &&
        typeof e.chainId === "number" &&
        isLinkCodeShape(e.code) &&
        typeof e.at === "number"
    );
  } catch {
    return [];
  }
}

function writeQueue(q: Pending[]) {
  try {
    if (q.length) window.localStorage.setItem(QUEUE_KEY, JSON.stringify(q.slice(-QUEUE_MAX)));
    else window.localStorage.removeItem(QUEUE_KEY);
  } catch {
    /* storage off: those cash outs just aren't counted */
  }
}

/** Keeps relay job ids of cash outs sent later from a partner's link, to report once they go out. */
export function queuePartnerJobs(code: string, chainId: number, jobIds: string[]): void {
  if (typeof window === "undefined" || readDemo() || !isLinkCodeShape(code) || jobIds.length === 0) return;
  const now = Date.now();
  const q = readQueue().filter((e) => !jobIds.includes(e.job));
  for (const job of jobIds) q.push({ job, chainId, code, at: now });
  writeQueue(q);
}

let processing = false;

/** Reports every queued job that has gone out; drops the ended and the old. Quiet on any failure. */
export async function processPartnerQueue(): Promise<void> {
  if (typeof window === "undefined" || processing || readDemo()) return;
  const queue = readQueue();
  if (queue.length === 0) return;
  processing = true;
  try {
    const { cashOutJobStatus } = await import("./cashOutLater");
    const keep: Pending[] = [];
    const now = Date.now();
    for (const e of queue) {
      if (now - e.at > QUEUE_MAX_AGE_MS) continue;
      const view = await cashOutJobStatus(e.job).catch(() => null);
      if (view === null) {
        keep.push(e); // the relay couldn't be asked: next time
        continue;
      }
      if (view === "gone" || ["cancelled", "failed", "expired", "spent"].includes(view.status)) continue;
      if (view.status === "sent" && view.hash) {
        reportPartnerTx({ code: e.code, chainId: e.chainId, txHash: view.hash, flow: "pay" });
        continue;
      }
      keep.push(e);
    }
    // entries queued while this ran are kept too
    const added = readQueue().filter((e) => !queue.some((x) => x.job === e.job));
    writeQueue([...keep, ...added]);
  } finally {
    processing = false;
  }
}
