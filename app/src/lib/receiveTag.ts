/**
 * Sticky Gloam receive tags — “direct” private pay like a shielded address.
 *
 * Recipient publishes:  gloamr1.<b64url SPKI>
 * Sender encrypts ticket to tag → gloam2t.<b64url payload>
 * Only the tag owner can open the ticket (ECDH P-256 + AES-GCM).
 *
 * On-chain transfer is unchanged; ciphertext is still handed off off-chain
 * (QR/share) until we add an on-chain memo field. UX is address-like for the sender.
 */

const ID_KEY = "gloam.receive.identity.v1";
export const RECEIVE_TAG_PREFIX = "gloamr1.";
export const PAY_TO_TAG_PREFIX = "gloam2t.";

function b64urlEncode(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlDecode(s: string): Uint8Array {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + pad;
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function buf(bytes: Uint8Array): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(bytes.byteLength);
  out.set(bytes);
  return out;
}

export type ReceiveIdentity = {
  /** Share this — like a shielded receive address */
  tag: string;
  createdAt: number;
};

type StoredIdentity = {
  v: 1;
  createdAt: number;
  privateJwk: JsonWebKey;
  publicSpkiB64: string;
};

async function generateIdentity(): Promise<StoredIdentity> {
  const pair = await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveBits"]
  );
  const privateJwk = await crypto.subtle.exportKey("jwk", pair.privateKey);
  const spki = new Uint8Array(
    await crypto.subtle.exportKey("spki", pair.publicKey)
  );
  return {
    v: 1,
    createdAt: Date.now(),
    privateJwk,
    publicSpkiB64: b64urlEncode(spki),
  };
}

function loadStored(): StoredIdentity | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(ID_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as StoredIdentity;
    if (s?.v !== 1 || !s.privateJwk || !s.publicSpkiB64) return null;
    return s;
  } catch {
    return null;
  }
}

function saveStored(s: StoredIdentity) {
  if (typeof window === "undefined") return;
  localStorage.setItem(ID_KEY, JSON.stringify(s));
}

/** Load or create sticky receive identity for this browser. */
export async function getOrCreateReceiveIdentity(): Promise<ReceiveIdentity> {
  let s = loadStored();
  if (!s) {
    s = await generateIdentity();
    saveStored(s);
  }
  return {
    tag: RECEIVE_TAG_PREFIX + s.publicSpkiB64,
    createdAt: s.createdAt,
  };
}

/** Force new tag (old tag stops receiving encrypted pays). */
export async function rotateReceiveIdentity(): Promise<ReceiveIdentity> {
  const s = await generateIdentity();
  saveStored(s);
  return {
    tag: RECEIVE_TAG_PREFIX + s.publicSpkiB64,
    createdAt: s.createdAt,
  };
}

export function isReceiveTag(input: string): boolean {
  return input.trim().startsWith(RECEIVE_TAG_PREFIX);
}

export function isPayToTagPackage(input: string): boolean {
  return input.trim().startsWith(PAY_TO_TAG_PREFIX);
}

function parseTagSpki(tag: string): Uint8Array {
  const t = tag.trim();
  if (!t.startsWith(RECEIVE_TAG_PREFIX)) {
    throw new Error("Not a Gloam receive tag (expected gloamr1…).");
  }
  const body = t.slice(RECEIVE_TAG_PREFIX.length);
  if (body.length < 40) throw new Error("Receive tag looks truncated.");
  return b64urlDecode(body);
}

async function importRecipientPublic(spki: Uint8Array): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "spki",
    buf(spki),
    { name: "ECDH", namedCurve: "P-256" },
    false,
    []
  );
}

async function importOurPrivate(jwk: JsonWebKey): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "jwk",
    jwk,
    { name: "ECDH", namedCurve: "P-256" },
    false,
    ["deriveBits"]
  );
}

async function ecdhAesKey(
  privateKey: CryptoKey,
  publicKey: CryptoKey
): Promise<CryptoKey> {
  const bits = await crypto.subtle.deriveBits(
    { name: "ECDH", public: publicKey },
    privateKey,
    256
  );
  // HKDF for domain separation
  const base = await crypto.subtle.importKey("raw", bits, "HKDF", false, [
    "deriveKey",
  ]);
  return crypto.subtle.deriveKey(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: new Uint8Array(0),
      info: buf(new TextEncoder().encode("gloam-pay-to-tag-v1")),
    },
    base,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

/**
 * Encrypt a payment ticket JSON string for a receive tag.
 * Returns gloam2t.… for handoff (QR/share) — only tag owner can open.
 */
export async function encryptTicketForTag(
  plainTicketJsonOrGloam1: string,
  recipientTag: string
): Promise<string> {
  const theirSpki = parseTagSpki(recipientTag);
  const theirPub = await importRecipientPublic(theirSpki);

  const ephem = await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveBits"]
  );
  const ephemSpki = new Uint8Array(
    await crypto.subtle.exportKey("spki", ephem.publicKey)
  );
  const aes = await ecdhAesKey(ephem.privateKey, theirPub);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipher = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "AES-GCM", iv: buf(iv) },
      aes,
      buf(new TextEncoder().encode(plainTicketJsonOrGloam1))
    )
  );

  // layout: ephemLen(2 BE) | ephemSpki | iv(12) | cipher
  if (ephemSpki.length > 0xffff) throw new Error("ephem key too large");
  const out = new Uint8Array(2 + ephemSpki.length + 12 + cipher.length);
  out[0] = (ephemSpki.length >> 8) & 0xff;
  out[1] = ephemSpki.length & 0xff;
  out.set(ephemSpki, 2);
  out.set(iv, 2 + ephemSpki.length);
  out.set(cipher, 2 + ephemSpki.length + 12);
  return PAY_TO_TAG_PREFIX + b64urlEncode(out);
}

/**
 * Decrypt gloam2t.… using this browser’s receive identity.
 */
export async function decryptTicketWithLocalTag(
  sealed: string
): Promise<string> {
  const s = sealed.trim();
  if (!s.startsWith(PAY_TO_TAG_PREFIX)) {
    throw new Error("Not a pay-to-tag package (gloam2t…).");
  }
  const stored = loadStored();
  if (!stored) {
    throw new Error("No receive tag in this browser — generate one under Claim.");
  }
  const raw = b64urlDecode(s.slice(PAY_TO_TAG_PREFIX.length));
  if (raw.length < 2 + 12 + 16) throw new Error("Corrupt pay-to-tag package.");
  const ephemLen = (raw[0]! << 8) | raw[1]!;
  if (raw.length < 2 + ephemLen + 12 + 1) throw new Error("Corrupt package length.");
  const ephemSpki = raw.slice(2, 2 + ephemLen);
  const iv = raw.slice(2 + ephemLen, 2 + ephemLen + 12);
  const cipher = raw.slice(2 + ephemLen + 12);

  const ourPriv = await importOurPrivate(stored.privateJwk);
  const ephemPub = await importRecipientPublic(ephemSpki);
  const aes = await ecdhAesKey(ourPriv, ephemPub);
  try {
    const plain = new Uint8Array(
      await crypto.subtle.decrypt(
        { name: "AES-GCM", iv: buf(iv) },
        aes,
        buf(cipher)
      )
    );
    return new TextDecoder().decode(plain);
  } catch {
    throw new Error(
      "Could not open this ticket with your tag — it was encrypted for someone else."
    );
  }
}

export function shortTag(tag: string, head = 14, tail = 8): string {
  const t = tag.trim();
  if (t.length <= head + tail + 1) return t;
  return `${t.slice(0, head)}…${t.slice(-tail)}`;
}
