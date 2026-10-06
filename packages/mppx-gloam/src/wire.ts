/**
 * The "Payment" HTTP authentication scheme on the wire, framework free.
 *
 * Implements the parts of draft-httpauth-payment that any method needs:
 *
 *   WWW-Authenticate: Payment id="..", realm="..", method="..", intent="..",
 *                     request="<base64url JCS JSON>", expires="..", ...
 *   Authorization:    Payment <base64url JSON { challenge, payload, source? }>
 *   Payment-Receipt:  <base64url JSON { status, method, timestamp, reference }>
 *
 * plus the recommended stateless challenge binding (HMAC-SHA256 over
 * realm|method|intent|request|expires|digest[|header]|opaque). Byte compatible
 * with mppx, so a challenge minted here verifies there and the other way round.
 * Uses WebCrypto, so it runs in Node 20+, browsers, and edge runtimes.
 */

export const PAYMENT_SCHEME = "Payment" as const;
export const PAYMENT_AUTHORIZATION_HEADER = "Payment-Authorization" as const;
export const PAYMENT_RECEIPT_HEADER = "Payment-Receipt" as const;
export const PROBLEM_BASE = "https://paymentauth.org/problems/" as const;

// ── bytes, base64url, canonical JSON ──────────────────────────────────────────

const utf8 = new TextEncoder();
const fromUtf8 = new TextDecoder();

export function bytesToBase64url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function base64urlToBytes(s: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]*={0,2}$/.test(s)) throw new Error("Not base64url.");
  const clean = s.replace(/=+$/, "");
  const pad = clean.length % 4 === 0 ? "" : "=".repeat(4 - (clean.length % 4));
  const bin = atob(clean.replace(/-/g, "+").replace(/_/g, "/") + pad);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export const textToBase64url = (s: string) => bytesToBase64url(utf8.encode(s));
export const base64urlToText = (s: string) => fromUtf8.decode(base64urlToBytes(s));

/**
 * JSON Canonicalization Scheme (RFC 8785) for plain JSON values: object keys
 * sorted by UTF-16 code units, no whitespace, strings and numbers serialized
 * the ECMAScript way. Throws on values JSON cannot carry (bigint, NaN, etc.).
 */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value === "boolean" || typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("Canonical JSON cannot carry a non-finite number.");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map((v) => canonicalJson(v === undefined ? null : v)).join(",")}]`;
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj)
      .filter((k) => obj[k] !== undefined)
      .sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJson(obj[k])}`).join(",")}}`;
  }
  throw new Error(`Canonical JSON cannot carry a ${typeof value}.`);
}

/** JCS, then base64url without padding: the encoding of `request` and `opaque`. */
export const encodeJsonParam = (value: unknown) => textToBase64url(canonicalJson(value));

export function decodeJsonParam<T = Record<string, unknown>>(s: string): T {
  return JSON.parse(base64urlToText(s)) as T;
}

/** Equal-time string comparison, so a challenge id or binding check leaks no timing. */
export function constantTimeEqual(a: string, b: string): boolean {
  const x = utf8.encode(a);
  const y = utf8.encode(b);
  const n = Math.max(x.length, y.length);
  let diff = x.length ^ y.length;
  for (let i = 0; i < n; i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}

async function hmacSha256(key: Uint8Array, message: string): Promise<Uint8Array> {
  const k = await crypto.subtle.importKey("raw", copy(key), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", k, copy(utf8.encode(message))));
}

/** HMAC-SHA256(key, message) as base64url without padding. */
export async function hmacBase64url(key: Uint8Array | string, message: string): Promise<string> {
  return bytesToBase64url(await hmacSha256(typeof key === "string" ? utf8.encode(key) : key, message));
}

function copy(bytes: Uint8Array) {
  const out = new Uint8Array(bytes.byteLength);
  out.set(bytes);
  return out;
}

// ── challenges ───────────────────────────────────────────────────────────────

/** A parsed Payment challenge. `requestB64` is the request exactly as it was on the wire. */
export interface PaymentChallenge<R = Record<string, unknown>> {
  id: string;
  realm: string;
  method: string;
  intent: string;
  request: R;
  requestB64: string;
  expires?: string;
  digest?: string;
  description?: string;
  /** Present only when the challenge selects Payment-Authorization for the credential. */
  header?: string;
  /** Base64url JCS JSON of a flat string map, echoed unchanged. */
  opaque?: string;
}

/** One challenge from a WWW-Authenticate field value: a scheme with auth-params (or a token68). */
export interface AuthChallenge {
  scheme: string;
  params: Record<string, string>;
  token68?: string;
}

const TOKEN = /[!#$%&'*+.^_`|~0-9A-Za-z-]/;

/**
 * Parse a WWW-Authenticate field value into its challenges (RFC 9110 section
 * 11.6.1). Handles several challenges in one value, as `Headers.get` joins
 * repeated fields with ", ", quoted strings with escapes, and token68 forms.
 */
export function parseAuthenticate(value: string | null | undefined): AuthChallenge[] {
  const s = value ?? "";
  const out: AuthChallenge[] = [];
  let i = 0;
  const skipWs = (from: number) => {
    let j = from;
    while (j < s.length && (s[j] === " " || s[j] === "\t")) j++;
    return j;
  };
  const tokenAt = (from: number) => {
    let j = from;
    while (j < s.length && TOKEN.test(s[j]!)) j++;
    return s.slice(from, j);
  };
  const quotedAt = (from: number): [string, number] => {
    let j = from + 1; // past the opening quote
    let v = "";
    while (j < s.length && s[j] !== '"') {
      if (s[j] === "\\" && j + 1 < s.length) j++;
      v += s[j++];
    }
    return [v, j + 1]; // past the closing quote
  };
  while (i < s.length) {
    while (i < s.length && (s[i] === "," || s[i] === " " || s[i] === "\t")) i++;
    if (i >= s.length) break;
    const scheme = tokenAt(i);
    if (!scheme) {
      i++; // a stray character: skip it and resync
      continue;
    }
    i += scheme.length;
    const ch: AuthChallenge = { scheme, params: {} };
    out.push(ch);
    i = skipWs(i);
    // token68 (e.g. `Bearer abc==`): token68 characters, optional '=' padding, then a comma or the end.
    const t68 = s.slice(i).match(/^([A-Za-z0-9\-._~+/]+=*)[ \t]*(?=,|$)/);
    if (t68) {
      ch.token68 = t68[1]!;
      i += t68[0].length;
      continue;
    }
    // auth-params: name BWS "=" BWS ( token / quoted-string ), separated by commas.
    for (;;) {
      i = skipWs(i);
      const name = tokenAt(i);
      if (!name) break;
      const eq = skipWs(i + name.length);
      if (s[eq] !== "=") break; // not a parameter: the next challenge starts here
      let j = skipWs(eq + 1);
      let v: string;
      if (s[j] === '"') [v, j] = quotedAt(j);
      else {
        v = tokenAt(j);
        j += v.length;
      }
      ch.params[name.toLowerCase()] = v;
      i = skipWs(j);
      if (s[i] !== ",") break;
      // Past the comma: another parameter (name =) or a new challenge (scheme ...)?
      const next = skipWs(i + 1);
      const peek = tokenAt(next);
      if (!peek || s[skipWs(next + peek.length)] !== "=") break;
      i = next;
    }
  }
  return out;
}

/**
 * The Payment challenges in a WWW-Authenticate value. Challenges missing a
 * required parameter, with an empty id, or with a request that does not decode
 * are skipped, as the core spec requires.
 */
export function parsePaymentChallenges(value: string | null | undefined): PaymentChallenge[] {
  const out: PaymentChallenge[] = [];
  for (const c of parseAuthenticate(value)) {
    if (c.scheme.toLowerCase() !== PAYMENT_SCHEME.toLowerCase()) continue;
    const p = c.params;
    if (!p.id || !p.realm || !p.method || !p.intent || !p.request) continue;
    if (!/^[a-z]+$/.test(p.method)) continue;
    if (p.header !== undefined && p.header !== PAYMENT_AUTHORIZATION_HEADER) continue;
    let request: Record<string, unknown>;
    try {
      request = decodeJsonParam(p.request);
      if (!request || typeof request !== "object" || Array.isArray(request)) continue;
    } catch {
      continue;
    }
    out.push({
      id: p.id,
      realm: p.realm,
      method: p.method,
      intent: p.intent,
      request,
      requestB64: p.request,
      ...(p.expires !== undefined ? { expires: p.expires } : {}),
      ...(p.digest !== undefined ? { digest: p.digest } : {}),
      ...(p.description !== undefined ? { description: p.description } : {}),
      ...(p.header !== undefined ? { header: p.header } : {}),
      ...(p.opaque !== undefined ? { opaque: p.opaque } : {}),
    });
  }
  return out;
}

const quote = (v: string) => `"${v.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;

/** Format a challenge as a WWW-Authenticate field value. */
export function formatPaymentChallenge(ch: PaymentChallenge): string {
  const parts = [
    `id=${quote(ch.id)}`,
    `realm=${quote(ch.realm)}`,
    `method=${quote(ch.method)}`,
    `intent=${quote(ch.intent)}`,
    `request=${quote(ch.requestB64)}`,
  ];
  if (ch.description !== undefined) parts.push(`description=${quote(ch.description)}`);
  if (ch.digest !== undefined) parts.push(`digest=${quote(ch.digest)}`);
  if (ch.expires !== undefined) parts.push(`expires=${quote(ch.expires)}`);
  if (ch.header !== undefined) parts.push(`header=${quote(ch.header)}`);
  if (ch.opaque !== undefined) parts.push(`opaque=${quote(ch.opaque)}`);
  return `${PAYMENT_SCHEME} ${parts.join(", ")}`;
}

/** The HMAC input for the recommended challenge binding (the slot layout of the core spec). */
export function challengeBindingInput(ch: Omit<PaymentChallenge, "id" | "request" | "description">): string {
  const slots = [ch.realm, ch.method, ch.intent, ch.requestB64, ch.expires ?? "", ch.digest ?? ""];
  if (ch.header !== undefined) slots.push(ch.header);
  slots.push(ch.opaque ?? "");
  return slots.join("|");
}

/** The challenge id a server with `secretKey` issues for these parameters. */
export async function computeChallengeId(
  ch: Omit<PaymentChallenge, "id" | "request" | "description">,
  secretKey: string | Uint8Array
): Promise<string> {
  return hmacBase64url(secretKey, challengeBindingInput(ch));
}

/** True when `ch.id` is the id this server would have issued: the challenge is ours and unmodified. */
export async function verifyChallengeId(ch: PaymentChallenge, secretKey: string | Uint8Array): Promise<boolean> {
  return constantTimeEqual(ch.id, await computeChallengeId(ch, secretKey));
}

export interface CreateChallengeParams<R> {
  secretKey: string | Uint8Array;
  realm: string;
  method: string;
  intent: string;
  request: R;
  /** RFC 3339 timestamp, or a Date. */
  expires?: string | Date;
  description?: string;
  digest?: string;
  /** Set true to select Payment-Authorization for the credential. */
  paymentAuthorizationHeader?: boolean;
  opaque?: Record<string, string>;
}

/** Mint an HMAC-bound challenge (the same id mppx would compute). */
export async function createPaymentChallenge<R extends Record<string, unknown>>(
  p: CreateChallengeParams<R>
): Promise<PaymentChallenge<R>> {
  if (!/^[a-z]+$/.test(p.method)) throw new Error("A payment method identifier is lowercase ASCII letters.");
  const base = {
    realm: p.realm,
    method: p.method,
    intent: p.intent,
    request: p.request,
    requestB64: encodeJsonParam(p.request),
    ...(p.expires !== undefined ? { expires: toRfc3339(p.expires) } : {}),
    ...(p.digest !== undefined ? { digest: p.digest } : {}),
    ...(p.description !== undefined ? { description: p.description } : {}),
    ...(p.paymentAuthorizationHeader ? { header: PAYMENT_AUTHORIZATION_HEADER } : {}),
    ...(p.opaque !== undefined ? { opaque: encodeJsonParam(p.opaque) } : {}),
  };
  return { id: await computeChallengeId(base, p.secretKey), ...base };
}

/** RFC 3339 with milliseconds, so two challenges issued for the same terms get different ids. */
export function toRfc3339(d: string | Date): string {
  return typeof d === "string" ? d : d.toISOString();
}

/** True when the challenge carries an `expires` that has passed (or does not parse). */
export function isExpired(ch: { expires?: string }, nowMs = Date.now()): boolean {
  if (ch.expires === undefined) return false;
  const t = Date.parse(ch.expires);
  return !Number.isFinite(t) || t <= nowMs;
}

/** Seconds left before `expires`, or Infinity without one. */
export function secondsLeft(ch: { expires?: string }, nowMs = Date.now()): number {
  if (ch.expires === undefined) return Number.POSITIVE_INFINITY;
  const t = Date.parse(ch.expires);
  return Number.isFinite(t) ? (t - nowMs) / 1000 : 0;
}

/** The HTTP field a credential for this challenge must travel in. */
export const credentialField = (ch: { header?: string }) =>
  ch.header === PAYMENT_AUTHORIZATION_HEADER ? PAYMENT_AUTHORIZATION_HEADER : "Authorization";

// ── credentials ──────────────────────────────────────────────────────────────

/** A credential: the echoed challenge, the method payload, and an optional payer DID. */
export interface PaymentCredential<P = unknown, R = Record<string, unknown>> {
  challenge: PaymentChallenge<R>;
  payload: P;
  source?: string;
}

/** Serialize to the `Payment <base64url JSON>` field value. The challenge is echoed as it was issued. */
export function serializeCredential(c: PaymentCredential): string {
  const ch = c.challenge;
  const wire = {
    challenge: {
      id: ch.id,
      realm: ch.realm,
      method: ch.method,
      intent: ch.intent,
      request: ch.requestB64,
      ...(ch.description !== undefined ? { description: ch.description } : {}),
      ...(ch.digest !== undefined ? { digest: ch.digest } : {}),
      ...(ch.expires !== undefined ? { expires: ch.expires } : {}),
      ...(ch.header !== undefined ? { header: ch.header } : {}),
      ...(ch.opaque !== undefined ? { opaque: ch.opaque } : {}),
    },
    payload: c.payload,
    ...(c.source ? { source: c.source } : {}),
  };
  return `${PAYMENT_SCHEME} ${textToBase64url(JSON.stringify(wire))}`;
}

/** Pick the `Payment ...` credential out of a field value that may carry several schemes. */
export function extractPaymentCredential(fieldValue: string | null | undefined): string | null {
  if (!fieldValue) return null;
  const m = fieldValue.match(/(?:^|,)\s*(Payment\s+[A-Za-z0-9_-]+={0,2})\s*(?:,|$)/i);
  return m ? m[1]! : null;
}

export class MalformedCredentialError extends Error {
  readonly code = "malformed-credential" as const;
  constructor(reason: string) {
    super(reason);
    this.name = "MalformedCredentialError";
  }
}

/** Parse a `Payment <base64url JSON>` credential. Throws MalformedCredentialError on any shape problem. */
export function parseCredential<P = unknown>(value: string): PaymentCredential<P> {
  const m = value.trim().match(/^Payment\s+([A-Za-z0-9_-]+={0,2})$/i);
  if (!m) throw new MalformedCredentialError("Not a Payment credential.");
  let wire: { challenge?: Record<string, unknown>; payload?: unknown; source?: unknown };
  try {
    wire = JSON.parse(base64urlToText(m[1]!));
  } catch {
    throw new MalformedCredentialError("The credential is not base64url JSON.");
  }
  const c = wire?.challenge;
  if (!c || typeof c !== "object") throw new MalformedCredentialError("The credential has no challenge.");
  const str = (k: string) => (typeof c[k] === "string" ? (c[k] as string) : undefined);
  const id = str("id");
  const realm = str("realm");
  const method = str("method");
  const intent = str("intent");
  const requestB64 = str("request");
  if (!id || !realm || !method || !intent || !requestB64) {
    throw new MalformedCredentialError("The echoed challenge is missing id, realm, method, intent or request.");
  }
  let opaque = str("opaque");
  if (opaque === undefined && c.opaque && typeof c.opaque === "object") opaque = encodeJsonParam(c.opaque);
  let request: Record<string, unknown>;
  try {
    request = decodeJsonParam(requestB64);
  } catch {
    throw new MalformedCredentialError("The echoed request does not decode.");
  }
  if (wire.payload === undefined || wire.payload === null || typeof wire.payload !== "object") {
    throw new MalformedCredentialError("The credential has no payload.");
  }
  const optional = (k: string) => (str(k) !== undefined ? { [k]: str(k) } : {});
  return {
    challenge: {
      id,
      realm,
      method,
      intent,
      request,
      requestB64,
      ...optional("expires"),
      ...optional("digest"),
      ...optional("description"),
      ...optional("header"),
      ...(opaque !== undefined ? { opaque } : {}),
    },
    payload: wire.payload as P,
    ...(typeof wire.source === "string" && wire.source ? { source: wire.source } : {}),
  };
}

// ── receipts and problems ────────────────────────────────────────────────────

export interface PaymentReceipt {
  status: "success";
  method: string;
  timestamp: string;
  reference: string;
  [field: string]: unknown;
}

export const serializeReceipt = (r: PaymentReceipt) => textToBase64url(JSON.stringify(r));

export function parseReceipt(value: string): PaymentReceipt {
  const r = JSON.parse(base64urlToText(value.trim())) as PaymentReceipt;
  if (!r || r.status !== "success" || typeof r.method !== "string" || typeof r.reference !== "string") {
    throw new Error("Not a Payment receipt.");
  }
  return r;
}

export type ProblemCode =
  | "payment-required"
  | "payment-insufficient"
  | "payment-expired"
  | "verification-failed"
  | "method-unsupported"
  | "malformed-credential"
  | "invalid-challenge"
  | "bad-request"
  | "invalid-payload"
  | "internal-payment-error"
  | "payment-action-required";

const PROBLEM_TITLES: Record<ProblemCode, string> = {
  "payment-required": "Payment Required",
  "payment-insufficient": "Payment Insufficient",
  "payment-expired": "Payment Expired",
  "verification-failed": "Payment Verification Failed",
  "method-unsupported": "Payment Method Unsupported",
  "malformed-credential": "Malformed Credential",
  "invalid-challenge": "Invalid Challenge",
  "bad-request": "Bad Request",
  "invalid-payload": "Invalid Payload",
  "internal-payment-error": "Internal Payment Error",
  "payment-action-required": "Payment Action Required",
};

/** Problem Details (RFC 9457) body for a payment error. */
export function problem(code: ProblemCode, detail: string, extra: Record<string, unknown> = {}) {
  const status = code === "method-unsupported" || code === "bad-request" ? 400 : code === "internal-payment-error" ? 500 : 402;
  return { type: `${PROBLEM_BASE}${code}`, title: PROBLEM_TITLES[code], status, detail, ...extra };
}
