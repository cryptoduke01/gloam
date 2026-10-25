import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { BASE_SEPOLIA_USDC, makeBoundNotePoseidon } from "@gloamtrade/sdk";
import { NoteStore, balances, noteStoreKey, noteView, type NewNote } from "../src/noteStore.ts";

const POOL = "0x39e28cde55cab798874746ac52cb4b5cc99a0194" as const;

async function note(amount: bigint, origin: NewNote["origin"], status: NewNote["status"] = "unspent"): Promise<NewNote> {
  const n = await makeBoundNotePoseidon(amount, BASE_SEPOLIA_USDC);
  return {
    network: "base",
    chainId: 84532,
    pool: POOL,
    asset: BASE_SEPOLIA_USDC,
    symbol: "USDC",
    decimals: 6,
    amountWei: amount.toString(),
    secret: n.secret,
    commitment: n.commitment,
    nullifier: n.nullifier,
    status,
    origin,
    createdTx: null,
  };
}

test("the store is one ciphertext, opens only with its key, and is never overwritten when it does not", async () => {
  const dir = mkdtempSync(join(tmpdir(), "gloam-game-store-"));
  const path = join(dir, "notes.json");
  const env = { GLOAM_NOTE_KEY: randomBytes(32).toString("hex") };
  const { key, source } = noteStoreKey(env);
  const store = new NoteStore(path, "agent-1", key, source);
  const a = store.add(await note(5_000_000n, "shield"));
  const file = readFileSync(path, "utf8");
  assert.ok(!file.includes(a.secret.slice(2)), "no secret in the file");
  assert.ok(!file.includes("5000000"), "no amount in the file either");
  assert.equal(store.get(a.handle)?.secret, a.secret);

  const other = noteStoreKey({ GLOAM_NOTE_KEY: randomBytes(32).toString("hex") });
  const wrong = new NoteStore(path, "agent-1", other.key, other.source);
  assert.throws(() => wrong.list(), /never overwritten/);
  assert.throws(() => wrong.add({ ...(a as NewNote) }), /never overwritten/);
  assert.equal(readFileSync(path, "utf8"), file, "the unreadable store was left as it was");
  const otherAgent = new NoteStore(path, "agent-2", key, source);
  assert.throws(() => otherAgent.list(), /belongs to agent "agent-1"/);

  writeFileSync(join(dir, "junk.json"), "{");
  assert.throws(() => new NoteStore(join(dir, "junk.json"), "agent-1", key, source).list(), /not valid JSON/);
});

test("a key derived from the agent's key is not the agent's key, and a bad key is refused", () => {
  const pk = `0x${randomBytes(32).toString("hex")}`;
  const { key, source } = noteStoreKey({ GLOAM_AGENT_PRIVATE_KEY: pk });
  assert.equal(source, "signer");
  assert.notEqual(key.toString("hex"), pk.slice(2));
  assert.throws(() => noteStoreKey({}), /no key for the note store/);
  assert.throws(() => noteStoreKey({ GLOAM_NOTE_KEY: "short" }), /32 random bytes/);
});

test("reserving a note is exclusive; balances count only the agent's own notes", async () => {
  const dir = mkdtempSync(join(tmpdir(), "gloam-game-store-"));
  const { key, source } = noteStoreKey({ GLOAM_NOTE_KEY: randomBytes(32).toString("hex") });
  const store = new NoteStore(join(dir, "n.json"), "a", key, source);
  const mine = store.add(await note(7_000_000n, "shield"));
  store.add(await note(2_000_000n, "change"));
  store.add(await note(3_000_000n, "received"));
  store.add(await note(9_000_000n, "payment", "spent"));
  store.add(await note(4_000_000n, "claim"));
  store.add(await note(1_000_000n, "shield", "pending"));
  const [usdc] = balances(store.list(), 84532);
  assert.equal(usdc!.spendable, "12");
  assert.equal(usdc!.confirming, "1");
  assert.equal(usdc!.largestPayment, "7");
  store.reserveForSpend(mine.handle);
  assert.throws(() => store.reserveForSpend(mine.handle), /in use/);
  const view = JSON.stringify(store.list().map(noteView));
  for (const n of store.list()) {
    assert.ok(!view.includes(n.secret.slice(2)), "a note view never carries the secret");
    assert.ok(!view.includes(n.nullifier.slice(2)), "nor the nullifier");
  }
});
