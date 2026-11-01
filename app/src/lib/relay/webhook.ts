/**
 * Telling a top-up's owner it failed or is held. A series can carry a webhook:
 * an https URL the owner chose, kept sealed with its job. When a job ends unsent
 * or can't go out on time the relay POSTs `{ status, series, at }` to it, and
 * nothing else: no amount, address, note or proof. The URL is the owner's, so it
 * is treated as hostile, the way mcp/src/safeFetch treats a URL an agent names:
 * every address it resolves to is checked, and the connection is pinned to the
 * address that was checked, so DNS rebinding can't swap a public check for a
 * private connect. A redirect is never followed.
 *
 * A notice never touches its job. It goes out after the run has settled every
 * job, a few tries inside a short limit, and one that can't be delivered is
 * dropped. Logs carry counts only.
 */
import { lookup as dnsLookup } from "node:dns";
import { request } from "node:https";
import { isIP } from "node:net";
import { webhookUrlProblem } from "./webhookUrl";

/** How long one try may take, start to finish. */
const TIMEOUT_MS = 3_000;
/** The pause before each try after the first. A notice is at most 3 tries, so about 10 seconds. */
const BACKOFF_MS = [250, 750];

function v4Private(ip: string): boolean {
  const [a, b] = ip.split(".").map(Number) as [number, number];
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 0) ||
    (a === 198 && (b === 18 || b === 19))
  );
}

/** The 16 bytes of an IPv6 literal, or null when it does not parse. Every spelling of an address gives the same bytes. */
function v6Bytes(ip: string): number[] | null {
  let s = ip.toLowerCase();
  const zone = s.indexOf("%");
  if (zone !== -1) s = s.slice(0, zone);
  const dotted = s.match(/^(.*:)(\d+\.\d+\.\d+\.\d+)$/);
  if (dotted) {
    if (isIP(dotted[2]!) !== 4) return null;
    const [a, b, c, d] = dotted[2]!.split(".").map(Number) as [number, number, number, number];
    s = `${dotted[1]}${((a << 8) | b).toString(16)}:${((c << 8) | d).toString(16)}`;
  }
  const halves = s.split("::");
  if (halves.length > 2) return null;
  const groups = (h: string) => (h === "" ? [] : h.split(":").map((g) => (/^[0-9a-f]{1,4}$/.test(g) ? parseInt(g, 16) : NaN)));
  const head = groups(halves[0]!);
  const rest = halves.length === 2 ? groups(halves[1]!) : [];
  if ([...head, ...rest].some(Number.isNaN)) return null;
  let all: number[];
  if (halves.length === 2) {
    const fill = 8 - head.length - rest.length;
    if (fill < 1) return null;
    all = [...head, ...new Array<number>(fill).fill(0), ...rest];
  } else {
    if (head.length !== 8) return null;
    all = head;
  }
  return all.flatMap((g) => [g >> 8, g & 0xff]);
}

/** An IPv6 address that reaches this host, a private network or metadata, directly or through an IPv4 address inside it. */
function v6Private(b: number[]): boolean {
  const zero = (from: number, to: number) => b.slice(from, to).every((x) => x === 0);
  const v4At = (at: number) => v4Private(b.slice(at, at + 4).join("."));
  if (zero(0, 10) && b[10] === 0xff && b[11] === 0xff) return v4At(12); // ::ffff:a.b.c.d, mapped
  if (zero(0, 8) && b[8] === 0xff && b[9] === 0xff && zero(10, 12)) return v4At(12); // ::ffff:0:a.b.c.d, translated
  if (zero(0, 12)) return true; // ::, ::1 and the retired IPv4-compatible ::a.b.c.d
  if (b[0] === 0x00 && b[1] === 0x64 && b[2] === 0xff && b[3] === 0x9b) {
    return zero(4, 12) ? v4At(12) : true; // 64:ff9b::/96 NAT64, and the local-use 64:ff9b:1::/48
  }
  if (b[0] === 0x20 && b[1] === 0x02) return v4At(2); // 2002::/16, 6to4
  if (b[0] === 0x20 && b[1] === 0x01 && b[2] === 0x00 && b[3] === 0x00) return true; // 2001::/32, Teredo
  if ((b[0]! & 0xfe) === 0xfc) return true; // fc00::/7, unique local
  if (b[0] === 0xfe && (b[1]! & 0xc0) === 0x80) return true; // fe80::/10, link-local
  if (b[0] === 0xfe && (b[1]! & 0xc0) === 0xc0) return true; // fec0::/10, old site-local
  if (b[0] === 0xff) return true; // multicast
  return false;
}

/** Loopback, private, link-local, carrier-grade NAT, metadata, multicast or unspecified. Anything malformed counts, so this fails closed. */
export function isPrivateAddress(ip: string): boolean {
  const kind = isIP(ip);
  if (kind === 4) return v4Private(ip);
  if (kind !== 6) return true;
  const bytes = v6Bytes(ip);
  return bytes === null ? true : v6Private(bytes);
}

type LookupDone = (err: NodeJS.ErrnoException | null, address: string | { address: string; family: number }[], family?: number) => void;

/**
 * The connection's own DNS lookup: every resolved address is checked and any
 * private one refuses the lot, then the connection goes to what was checked. TLS
 * still verifies the host name.
 */
export function guardedLookup(hostname: string, options: { all?: boolean }, done: LookupDone): void {
  dnsLookup(hostname, { all: true, verbatim: true }, (err, addresses) => {
    if (err) return done(err, "", 0);
    if (!addresses.length) return done(new Error("It did not resolve."), "", 0);
    if (addresses.some((a) => isPrivateAddress(a.address))) return done(new Error("It resolves to a private address."), "", 0);
    if (options.all) return done(null, addresses);
    done(null, addresses[0]!.address, addresses[0]!.family);
  });
}

type PostOptions = { lookup?: typeof guardedLookup; ca?: string | Buffer };

/** One try: the status the host answered with. Throws on a failed connection or the time limit. */
export function postOnce(url: string, body: string, opts: PostOptions = {}): Promise<number> {
  return new Promise((resolve, reject) => {
    const req = request(
      url,
      {
        method: "POST",
        lookup: (opts.lookup ?? guardedLookup) as never,
        ...(opts.ca ? { ca: opts.ca } : {}),
        agent: false,
        headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body), "User-Agent": "gloam-relay" },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      },
      (res) => {
        // the status is all that matters: no body is read, and a redirect is not followed
        resolve(res.statusCode ?? 0);
        res.destroy();
      }
    );
    req.on("error", reject);
    req.end(body);
  });
}

export type NoticeBody = {
  status: "failed" | "expired" | "held";
  /** The series' id, which says nothing but which series this is. */
  series: string;
  /** When the relay noticed, as an ISO time. */
  at: string;
};

export type JobNotice = { url: string; body: NoticeBody };

type Post = (url: string, body: string) => Promise<number>;

const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** True once the host took it. A refusal that won't change (a 4xx, a redirect) is not tried again. */
async function deliver(n: JobNotice, post: Post, wait: (ms: number) => Promise<unknown>): Promise<boolean> {
  if (webhookUrlProblem(n.url)) return false;
  // spelled out, so nothing added to a job can ever reach a webhook by accident
  const body = JSON.stringify({ status: n.body.status, series: n.body.series, at: n.body.at });
  for (let attempt = 0; attempt <= BACKOFF_MS.length; attempt++) {
    if (attempt > 0) await wait(BACKOFF_MS[attempt - 1]!);
    try {
      const status = await post(n.url, body);
      if (status >= 200 && status < 300) return true;
      if (status < 500 && status !== 429) return false;
    } catch {
      /* a passing failure: the next try, if there is one */
    }
  }
  return false;
}

/** Sends every notice at once. Never throws: whatever happens here, the jobs are already settled. */
export async function deliverNotices(notices: JobNotice[], post: Post = postOnce, wait: (ms: number) => Promise<unknown> = pause): Promise<{ delivered: number; dropped: number }> {
  const outcomes = await Promise.allSettled(notices.map((n) => deliver(n, post, wait)));
  const delivered = outcomes.filter((o) => o.status === "fulfilled" && o.value).length;
  return { delivered, dropped: notices.length - delivered };
}
