/**
 * The agent's private notes, kept inside this server.
 *
 * A note is a bearer secret: whoever knows its secret can spend it. So the
 * secrets never go to the agent. Tools hand out short handles ("n-k3x9p2qw7m")
 * plus non-secret facts (network, asset, amount, status, the tx that created
 * it), and take handles back. The secrets live here, in a local JSON file
 * encrypted with AES-256-GCM:
 *
 *   path  GLOAM_NOTE_STORE, or ~/.gloam/notes.<agent>.json
 *   key   GLOAM_NOTE_KEY (32 random bytes in hex), or, when that is unset,
 *         derived from GLOAM_AGENT_PRIVATE_KEY with HKDF-SHA256 under a Gloam
 *         note-store label, so it is never the signing key itself
 *
 * The whole store is one ciphertext (amounts and counts are hidden too), bound
 * to the agent id. Writes take the same kind of lock as the spending log, so two
 * calls or two processes cannot lose each other's notes. A store that does not
 * decrypt is never overwritten: it holds the only copy of the money.
 *
 * Each note is unspent, pending (being created, or the input of a spend in
 * flight), spent, or dead: the chain says its transaction can never land. A dead
 * note keeps its secret, in case that read was wrong, and a refresh brings it
 * back if it shows up. The server also keeps its receive key here, the private
 * half of the gloamr1. tag that x402 payments to this server are sealed to.
 */
import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";
import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { formatUnits, type Address, type Hex } from "viem";
import type { ReceiveKey } from "@gloamtrade/sdk";
import { withFileLock } from "./fileLock.js";
import type { NetworkKey } from "./networks.js";

type Env = Record<string, string | undefined>;

export type NoteStatus = "unspent" | "pending" | "spent" | "dead";
/**
 * Where the note came from: a shield, the change of a payment, or a payment this
 * server received and swept. "payment" is a payment this server sent: the
 * payee's money, kept from before it is sent so a payment that lands is never
 * lost. It is never this server's balance and never pays; once it lands it is
 * marked spent (handed over).
 */
export type NoteOrigin = "shield" | "change" | "received" | "payment";
export type KeySource = "GLOAM_NOTE_KEY" | "signer";

export type StoredNote = {
  handle: string;
  network: NetworkKey;
  chainId: number;
  pool: Address;
  asset: Address;
  symbol: string;
  decimals: number;
  amountWei: string;
  secret: Hex;
  commitment: Hex;
  nullifier: Hex;
  status: NoteStatus;
  /** Only while pending: being created, or the input of a spend in flight. */
  pending?: "create" | "spend";
  origin: NoteOrigin;
  createdTx: Hex | null;
  spentTx?: Hex | null;
  /** Received notes: the nullifier of the payment note this was swept from (stops a replayed payment). */
  sweptFrom?: Hex;
  /**
   * Received notes: whether gloam_verify_payment has granted access for this
   * payment. false from the sweep's send until a verify answers settled, so a
   * sweep that confirms later still serves the payer, once. Absent on notes
   * from before this field: taken as served once confirmed.
   */
  served?: boolean;
  /**
   * Set when a refresh made this note spendable again because its spend never
   * showed up. That spend may still land, so every refresh checks the nullifier
   * again and marks the note spent if it did.
   */
  recheck?: boolean;
  /**
   * Dead notes: when the note was marked dead, and when a refresh last looked for it on chain. The gap
   * between looks doubles up to a week, and something new seen wakes them all.
   */
  deadAt?: string;
  checkedAt?: string;
  /** What the note is for, e.g. the resource a received payment paid for. */
  label?: string;
  createdAt: string;
  updatedAt: string;
};

export type NewNote = Omit<StoredNote, "handle" | "createdAt" | "updatedAt">;

type StoreData = {
  notes: StoredNote[];
  receiveKey: ReceiveKey | null;
  /** MPP pull payments whose payer's transfer this server submitted, until served: payment nullifier (lowercase) to challenge id and when. */
  pulls?: Record<string, { challenge: string; at: string }>;
  /** Payments a verify is settling right now, in any process: payment nullifier (lowercase) to when and by whom ("pid:server"). */
  settling?: Record<string, { at: string; by: string }>;
};

type StoreFile = {
  format: "gloam-note-store";
  version: 1;
  agent: string;
  keySource: KeySource;
  cipher: "aes-256-gcm";
  iv: string;
  tag: string;
  data: string;
};

const SALT = Buffer.from("gloam/note-store");
const INFO = "gloam-note-store-v1";
const HANDLE_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";

export function agentId(env: Env = process.env): string {
  return env.GLOAM_AGENT_ID?.trim() || "default";
}

export function noteStorePath(agent: string, env: Env = process.env): string {
  return env.GLOAM_NOTE_STORE?.trim() || join(homedir(), ".gloam", `notes.${agent.replace(/[^\w.-]+/g, "_")}.json`);
}

/** The store key: GLOAM_NOTE_KEY, else derived from the signer key. Throws with a plain reason when neither works. */
export function noteStoreKey(env: Env = process.env): { key: Buffer; source: KeySource } {
  const raw = env.GLOAM_NOTE_KEY?.trim();
  if (raw) {
    if (!/^(0x)?[0-9a-fA-F]{64}$/.test(raw)) {
      throw new Error("GLOAM_NOTE_KEY must be 32 random bytes in hex (make one with: openssl rand -hex 32).");
    }
    const ikm = Buffer.from(raw.replace(/^0x/, ""), "hex");
    return { key: Buffer.from(hkdfSync("sha256", ikm, SALT, `${INFO}:GLOAM_NOTE_KEY`, 32)), source: "GLOAM_NOTE_KEY" };
  }
  const pk = env.GLOAM_AGENT_PRIVATE_KEY?.trim();
  if (pk && /^(0x)?[0-9a-fA-F]{64}$/.test(pk)) {
    const ikm = Buffer.from(pk.replace(/^0x/, ""), "hex");
    return { key: Buffer.from(hkdfSync("sha256", ikm, SALT, `${INFO}:signer`, 32)), source: "signer" };
  }
  throw new Error(
    "There is no key for the note store. Set GLOAM_NOTE_KEY (32 random bytes in hex: openssl rand -hex 32), or GLOAM_AGENT_PRIVATE_KEY to derive one from the signer."
  );
}

/** Now, from Date.now: the clock every age check reads. */
const stamp = () => new Date(Date.now()).toISOString();

function newHandle(): string {
  const bytes = randomBytes(10);
  return "n-" + Array.from(bytes, (b) => HANDLE_ALPHABET[b % HANDLE_ALPHABET.length]).join("");
}

export class NoteStore {
  constructor(
    readonly path: string,
    readonly agent: string,
    private readonly key: Buffer,
    readonly keySource: KeySource
  ) {}

  private aad(): Buffer {
    return Buffer.from(`${INFO}:${this.agent}`);
  }

  /** Decrypt the store. Missing file: empty. Anything unreadable throws and nothing is written. */
  read(): StoreData {
    if (!existsSync(this.path)) return { notes: [], receiveKey: null };
    const unusable = (why: string) =>
      new Error(
        `The note store at ${this.path} cannot be opened: ${why}. It holds the only copy of this agent's private balance, so it is never overwritten. Restore the key it was written with, or move the file away to start a new store.`
      );
    let file: StoreFile;
    try {
      file = JSON.parse(readFileSync(this.path, "utf8")) as StoreFile;
    } catch {
      throw unusable("it is not valid JSON");
    }
    if (file?.format !== "gloam-note-store" || file.version !== 1) throw unusable("it is not a Gloam note store");
    if (file.agent !== this.agent) throw unusable(`it belongs to agent "${file.agent}", not "${this.agent}"`);
    try {
      const decipher = createDecipheriv("aes-256-gcm", this.key, Buffer.from(file.iv, "base64"));
      decipher.setAAD(this.aad());
      decipher.setAuthTag(Buffer.from(file.tag, "base64"));
      const plain = Buffer.concat([decipher.update(Buffer.from(file.data, "base64")), decipher.final()]);
      const data = JSON.parse(plain.toString("utf8")) as Partial<StoreData>;
      return {
        notes: Array.isArray(data.notes) ? data.notes : [],
        receiveKey: data.receiveKey ?? null,
        ...(data.pulls && typeof data.pulls === "object" ? { pulls: data.pulls } : {}),
        ...(data.settling && typeof data.settling === "object" ? { settling: data.settling } : {}),
      };
    } catch {
      const hint =
        file.keySource !== this.keySource
          ? `it was written with ${file.keySource === "signer" ? "a key derived from the signer" : "GLOAM_NOTE_KEY"}, and the server is now using ${this.keySource === "signer" ? "a key derived from the signer" : "GLOAM_NOTE_KEY"}`
          : "the key does not match (or the file was changed)";
      throw unusable(hint);
    }
  }

  private write(data: StoreData) {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.key, iv);
    cipher.setAAD(this.aad());
    const enc = Buffer.concat([cipher.update(JSON.stringify(data), "utf8"), cipher.final()]);
    const file: StoreFile = {
      format: "gloam-note-store",
      version: 1,
      agent: this.agent,
      keySource: this.keySource,
      cipher: "aes-256-gcm",
      iv: iv.toString("base64"),
      tag: cipher.getAuthTag().toString("base64"),
      data: enc.toString("base64"),
    };
    const tmp = `${this.path}.${process.pid}.tmp`;
    writeFileSync(tmp, JSON.stringify(file, null, 2), { mode: 0o600 });
    renameSync(tmp, this.path);
  }

  /** Read, change and write back under the lock. */
  private mutate<T>(fn: (data: StoreData) => T): T {
    return withFileLock(this.path, "note store", () => {
      const data = this.read();
      const out = fn(data);
      this.write(data);
      return out;
    });
  }

  list(): StoredNote[] {
    return this.read().notes;
  }

  get(handle: string): StoredNote | undefined {
    return this.list().find((n) => n.handle === handle);
  }

  add(note: NewNote): StoredNote {
    return this.mutate((d) => {
      const now = stamp();
      let handle = newHandle();
      while (d.notes.some((n) => n.handle === handle)) handle = newHandle();
      const stored: StoredNote = { ...note, handle, createdAt: now, updatedAt: now };
      d.notes.push(stored);
      return stored;
    });
  }

  /** Change one note. Returns the updated note, or undefined if the handle is unknown. */
  update(handle: string, patch: Partial<Omit<StoredNote, "handle" | "secret" | "commitment" | "nullifier">>): StoredNote | undefined {
    return this.mutate((d) => {
      const i = d.notes.findIndex((n) => n.handle === handle);
      if (i < 0) return undefined;
      const next: StoredNote = { ...d.notes[i]!, ...patch, updatedAt: stamp() };
      if (next.status !== "pending") delete next.pending;
      d.notes[i] = next;
      return next;
    });
  }

  /**
   * Mark a note dead: by the chain's reads its transaction can never land. The secret stays, since
   * reads can come from a node behind; a refresh brings the note back if it shows up.
   */
  markDead(handle: string): StoredNote | undefined {
    const now = stamp();
    return this.update(handle, { status: "dead", deadAt: now, checkedAt: now });
  }

  /** Something new was seen (a send that landed late): every dead note is looked at on the next refresh. */
  wakeDead() {
    this.mutate((d) => {
      for (const n of d.notes) if (n.status === "dead") delete n.checkedAt;
    });
  }

  /** Forget a note whose creating transaction never happened (a rollback). */
  remove(handle: string) {
    this.mutate((d) => {
      d.notes = d.notes.filter((n) => n.handle !== handle);
    });
  }

  /**
   * Take an unspent note for a spend: under the lock, check it is still unspent
   * and passes `check`, then mark it pending so a second call cannot spend it too.
   */
  reserveForSpend(handle: string, check: (n: StoredNote) => string | null = () => null): StoredNote {
    return this.mutate((d) => {
      const i = d.notes.findIndex((n) => n.handle === handle);
      const note = d.notes[i];
      if (!note) throw new Error(`There is no note "${handle}". Call gloam_list_notes for this agent's notes.`);
      if (note.status !== "unspent") {
        const why = { pending: "in use by a transaction that has not confirmed", spent: "already spent", dead: "dead: its transaction never landed" }[note.status];
        throw new Error(`Note ${handle} is ${why}.`);
      }
      const why = check(note);
      if (why) throw new Error(why);
      const next: StoredNote = { ...note, status: "pending", pending: "spend", updatedAt: stamp() };
      d.notes[i] = next;
      return next;
    });
  }

  /**
   * Serve a received payment from this note, once: under the lock, mark it served
   * (with `patch`) only if no note swept from the same payment was served before.
   * Of any verifies at once, exactly one gets claimed: true.
   */
  claimServed(
    handle: string,
    patch: Partial<Pick<StoredNote, "status" | "createdTx">> = {}
  ): { claimed: true; note: StoredNote } | { claimed: false; servedBy: string | null } {
    return this.mutate((d) => {
      const i = d.notes.findIndex((n) => n.handle === handle);
      const note = d.notes[i];
      if (!note?.sweptFrom) return { claimed: false, servedBy: null };
      const from = note.sweptFrom.toLowerCase();
      const before = d.notes.find((n) => n.sweptFrom?.toLowerCase() === from && servedPayment(n));
      if (before) return { claimed: false, servedBy: before.handle };
      // Only a note still being created (or marked dead) takes the new status: one already confirmed,
      // mid-spend or spent keeps its own (the patch comes from a read made before the lock).
      const promote = note.status === "dead" || (note.status === "pending" && note.pending === "create");
      const next: StoredNote = {
        ...note,
        ...(patch.createdTx !== undefined ? { createdTx: patch.createdTx } : {}),
        ...(promote && patch.status ? { status: patch.status } : {}),
        served: true,
        updatedAt: stamp(),
      };
      if (next.status !== "pending") delete next.pending;
      d.notes[i] = next;
      return { claimed: true, note: next };
    });
  }

  /** MPP pull payments this server submitted the payer's transfer for and has not served yet, by payment nullifier (lowercase). */
  pulls(): Record<string, { challenge: string; at: string }> {
    return this.read().pulls ?? {};
  }

  /** Record, before it is submitted, that the payer's transfer for this payment and challenge goes out. Records over 30 days old go. */
  markPull(paymentNullifier: Hex, challengeId: string) {
    this.mutate((d) => {
      const pulls = (d.pulls ??= {});
      for (const [k, v] of Object.entries(pulls)) if (Date.now() - Date.parse(v.at) > PULL_KEEP_MS) delete pulls[k];
      pulls[paymentNullifier.toLowerCase()] = { challenge: challengeId, at: stamp() };
    });
  }

  /** The payment was served: its pull record is no longer needed. */
  dropPull(paymentNullifier: Hex) {
    this.mutate((d) => {
      if (d.pulls) delete d.pulls[paymentNullifier.toLowerCase()];
    });
  }

  /**
   * Take a payment for settling, under the lock, as `by` ("pid:server"): false while another verify (in
   * this process or another sharing the store) settles it. A claim is taken back when it is `by`'s own
   * (left behind by a release that could not be written), its process is gone, or it is `staleMs` old.
   */
  claimSettle(paymentNullifier: Hex, staleMs: number, by: string): boolean {
    const key = paymentNullifier.toLowerCase();
    return this.mutate((d) => {
      const held = d.settling?.[key];
      if (held && held.by !== by && processAlive(held.by) && Date.now() - Date.parse(held.at) < staleMs) return false;
      (d.settling ??= {})[key] = { at: stamp(), by };
      return true;
    });
  }

  /** Done settling a payment (whatever the outcome). */
  releaseSettle(paymentNullifier: Hex) {
    this.mutate((d) => {
      if (d.settling) delete d.settling[paymentNullifier.toLowerCase()];
    });
  }

  receiveKey(): ReceiveKey | null {
    return this.read().receiveKey;
  }

  /** Save a receive key unless one is already there; returns the one in the store. */
  keepReceiveKey(key: ReceiveKey): ReceiveKey {
    return this.mutate((d) => {
      if (!d.receiveKey) d.receiveKey = key;
      return d.receiveKey;
    });
  }
}

/** A received note that gloam_verify_payment granted access for. One from before the served flag counts once it confirmed. */
export function servedPayment(n: StoredNote): boolean {
  return n.served === true || (n.served === undefined && (n.status === "unspent" || n.status === "spent"));
}

/** Whether the process named in a "pid:server" claim still runs on this machine (unreadable: assume it does). */
function processAlive(by: string): boolean {
  const pid = Number(by.split(":")[0]);
  if (!Number.isInteger(pid) || pid <= 0) return true;
  if (pid === process.pid) return true;
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return (e as NodeJS.ErrnoException).code !== "ESRCH";
  }
}

const DAY_MS = 24 * 60 * 60 * 1000;
const PULL_KEEP_MS = 30 * DAY_MS;
const DEAD_CHECK_MIN_MS = 60 * 1000;
const DEAD_CHECK_MAX_MS = 7 * DAY_MS;

/**
 * Whether a refresh should look for a dead note on chain now: a minute after it died, then each time after
 * as long again as it had been dead at the last look, but at least once a week for good, and always once woken.
 */
export function deadCheckDue(n: StoredNote, now = Date.now()): boolean {
  if (!n.checkedAt) return true;
  const last = Date.parse(n.checkedAt);
  const died = Date.parse(n.deadAt ?? n.checkedAt);
  return now - last >= Math.min(DEAD_CHECK_MAX_MS, Math.max(DEAD_CHECK_MIN_MS, last - died));
}

/** Open this agent's note store (throws with a plain reason when there is no usable key). */
export function openNoteStore(env: Env = process.env): NoteStore {
  const agent = agentId(env);
  const { key, source } = noteStoreKey(env);
  return new NoteStore(noteStorePath(agent, env), agent, key, source);
}

// ------------------------------------------------------------------ what the agent may see

/** A note as the agent sees it: a handle and public facts, never the secret, commitment or nullifier. */
export function noteView(n: StoredNote) {
  return {
    handle: n.handle,
    network: n.network,
    asset: n.asset,
    symbol: n.symbol,
    amount: formatUnits(BigInt(n.amountWei), n.decimals),
    amountWei: n.amountWei,
    status: n.status,
    ...(n.pending ? { pending: n.pending } : {}),
    origin: n.origin,
    createdTx: n.createdTx,
    ...(n.spentTx ? { spentTx: n.spentTx } : {}),
    ...(n.label ? { label: n.label } : {}),
    createdAt: n.createdAt,
  };
}

/** Private balance per network and asset: what is spendable now and what is still confirming. */
export function balances(notes: StoredNote[]) {
  const by = new Map<string, { network: string; asset: Address; symbol: string; decimals: number; unspent: bigint; pending: bigint; notes: number }>();
  for (const n of notes) {
    if (n.status === "spent" || n.status === "dead" || n.origin === "payment") continue;
    if (n.status === "pending" && n.pending === "spend") continue;
    const k = `${n.chainId}:${n.asset.toLowerCase()}`;
    const cur = by.get(k) ?? { network: n.network, asset: n.asset, symbol: n.symbol, decimals: n.decimals, unspent: 0n, pending: 0n, notes: 0 };
    if (n.status === "unspent") {
      cur.unspent += BigInt(n.amountWei);
      cur.notes += 1;
    } else cur.pending += BigInt(n.amountWei);
    by.set(k, cur);
  }
  return [...by.values()].map((b) => ({
    network: b.network,
    asset: b.asset,
    symbol: b.symbol,
    spendable: formatUnits(b.unspent, b.decimals),
    confirming: formatUnits(b.pending, b.decimals),
    notes: b.notes,
  }));
}
