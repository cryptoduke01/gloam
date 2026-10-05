/**
 * Private payroll: pay a whole team from your private balance in one run.
 *
 * How it works (v1, no contract changes):
 *   - The transfer circuit spends one private balance entry ("note") into a
 *     payment + change, so a payroll is a chain of private sends: each payment
 *     is taken from the smallest note that covers it, and its change becomes
 *     spendable for the next one once confirmed.
 *   - People with a Gloam address are paid directly: their payment is
 *     encrypted to their address and (where the memo board is live) posted
 *     on-chain so it shows up in their app. Everyone else gets a claim link.
 *   - Through the relay, the employer's wallet never appears next to any of
 *     the payments. The public sees private transfers, never who or how much.
 *
 * Crash safety: before a payment is submitted, its change note and the batch
 * row are persisted. On resume a row that was mid-flight is reconciled against
 * the pool's `spent` map, so a refresh can never lose or double-pay money.
 */
import type { Address, Hex, PublicClient } from "viem";
import { buildTransferWitness } from "@/lib/proverTransfer";
import { fieldToBytes32, proveTransferInBrowser } from "@/lib/proveClient";
import { syncShieldTree, type SyncedTree } from "@/lib/treeSync";
import type { PoseidonMerklePath } from "@/lib/merklePoseidon";
import { buildNotePackage, encodeNotePackage } from "@/lib/notePackage";
import { encryptTicketForTag, isReceiveTag } from "@/lib/receiveTag";
import { ticketToMemoBytes } from "@/lib/payMemo";
import { openJson, sealJson } from "@/lib/noteVault";
import {
  activeSpendableNotes,
  assetDecimals,
  assetLabel,
  formatAssetAmount,
  loadLocalNotes,
  parseAssetAmount,
  saveLocalNote,
  shieldPoolAbi,
  updateLocalNote,
  type LocalNote,
} from "@/lib/shield";

// ------------------------------------------------------------------ types

export type PayeeKind = "gloam" | "link";

export type PayrollRowStatus =
  | "queued"
  | "preparing"
  | "sending"
  | "confirming"
  | "notifying"
  | "paid"
  | "failed";

export type PayrollRow = {
  id: string;
  name: string;
  /** Gloam address (gloamr1…) or "" for a claim link */
  recipient: string;
  kind: PayeeKind;
  /** raw units of the batch asset */
  amount: string;
  status: PayrollRowStatus;
  error?: string;
  attempts?: number;
  // execution record (persisted before submit, for crash-safe resume)
  spendNoteId?: string;
  spendNullifier?: Hex;
  changeNoteId?: string;
  paymentCommitment?: Hex;
  /** encrypted to their Gloam address, or a plain claim code for links */
  ticket?: string;
  txHash?: Hex;
  memoPosted?: boolean;
};

export type PayrollBatch = {
  id: string;
  title: string;
  createdAt: number;
  chainId: number;
  pool: Address;
  asset: Address;
  employer: Address;
  relay: boolean;
  status: "draft" | "running" | "paused" | "needs_funds" | "done";
  rows: PayrollRow[];
  /** Set when the run pays a saved schedule (lib/payrollSchedule): which one, and for which payday. */
  scheduleId?: string;
  payday?: string;
};

export type DraftRow = {
  line: number;
  name: string;
  recipient: string;
  kind: PayeeKind;
  amountInput: string;
  amount: bigint | null;
  error: string | null;
};

// ------------------------------------------------------------------ CSV

export const PAYROLL_MAX_ROWS = 200;

export const PAYROLL_TEMPLATE = [
  "name,gloam_address,amount",
  "Ada Obi,gloamr1.PASTE_THEIR_GLOAM_ADDRESS,1250",
  "Tunde Bello,,980",
].join("\n");

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') {
        quoted = false;
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === "," || ch === "\t" || ch === ";") {
      out.push(cur.trim());
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur.trim());
  return out;
}

const NAME_KEYS = ["name", "payee", "employee", "person", "contractor", "full name"];
const RECIPIENT_KEYS = ["gloam_address", "gloam address", "gloam", "address", "recipient", "to", "wallet"];
const AMOUNT_KEYS = ["amount", "pay", "salary", "usd", "value", "total"];

function findCol(header: string[], keys: string[]): number {
  return header.findIndex((h) => keys.includes(h.toLowerCase().replace(/\s+/g, " ").trim()));
}

/** Parse pasted or uploaded CSV into draft rows (validated, not yet a batch). */
export function parsePayrollCsv(text: string, asset: Address): { rows: DraftRow[]; error: string | null } {
  const lines = text
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((l, i) => ({ l: l.trim(), i: i + 1 }))
    .filter((x) => x.l.length > 0);
  if (!lines.length) return { rows: [], error: null };

  let cols = { name: 0, recipient: 1, amount: 2 };
  let start = 0;
  const first = splitCsvLine(lines[0].l);
  const looksLikeHeader = first.some((c) =>
    [...NAME_KEYS, ...RECIPIENT_KEYS, ...AMOUNT_KEYS].includes(c.toLowerCase().trim())
  );
  if (looksLikeHeader) {
    const n = findCol(first, NAME_KEYS);
    const r = findCol(first, RECIPIENT_KEYS);
    const a = findCol(first, AMOUNT_KEYS);
    if (a < 0) return { rows: [], error: "Add an amount column (name, gloam_address, amount)." };
    cols = { name: n, recipient: r, amount: a };
    start = 1;
  } else if (first.length === 2) {
    cols = { name: 0, recipient: -1, amount: 1 };
  }

  const body = lines.slice(start);
  if (body.length > PAYROLL_MAX_ROWS) {
    return { rows: [], error: `Up to ${PAYROLL_MAX_ROWS} people per run. Split the list into smaller batches.` };
  }

  const rows = body.map(({ l, i }, idx): DraftRow => {
    const c = splitCsvLine(l);
    const name = (cols.name >= 0 ? c[cols.name] : "")?.slice(0, 60) || `Person ${idx + 1}`;
    const recipient = (cols.recipient >= 0 ? c[cols.recipient] : "")?.trim() ?? "";
    const amountInput = (c[cols.amount] ?? "").replace(/[$\s]/g, "");
    let error: string | null = null;
    let kind: PayeeKind = "link";
    if (recipient) {
      if (isReceiveTag(recipient)) {
        kind = "gloam";
      } else if (/^0x[0-9a-fA-F]{40}$/.test(recipient)) {
        error = "That is a public wallet, paying it would show the amount. Use their Gloam address, or leave it blank for a claim link.";
      } else {
        error = "Not a Gloam address (they start with gloamr1). Leave it blank to send a claim link.";
      }
    }
    const amount = parseAssetAmount(amountInput, asset);
    if (!error && amount === null && /^\d*\.\d+$/.test(amountInput.replace(/,/g, ""))) {
      error = `Too many decimals, ${assetLabel(asset)} goes to ${assetDecimals(asset)} places.`;
    } else if (!error && (amount === null || amount <= 0n)) {
      error = "Enter an amount above zero.";
    }
    return { line: i, name, recipient: kind === "gloam" ? recipient : "", kind, amountInput, amount, error };
  });
  return { rows, error: null };
}

export function draftTotal(rows: DraftRow[]): bigint {
  return rows.reduce((s, r) => s + (r.error || r.amount == null ? 0n : r.amount), 0n);
}

// ------------------------------------------------------------------ funding

/** Spendable notes for this asset on the active network, with tree positions. */
export function fundingNotes(address: string, asset: Address, tree: SyncedTree | null): LocalNote[] {
  return activeSpendableNotes(loadLocalNotes(address))
    .filter((n) => n.asset.toLowerCase() === asset.toLowerCase() && n.scheme !== "keccak")
    .map((n) => {
      if (n.leafIndex != null) return n;
      const idx = tree?.indexByCommitment.get(n.commitment.toLowerCase());
      return idx != null ? { ...n, leafIndex: idx } : n;
    })
    .filter((n) => n.leafIndex != null);
}

/**
 * Can the current notes pay these amounts, given each payment must come out of
 * one note (with its change reused)? Returns how much more to add, as a single
 * deposit, to cover the rows that do not fit.
 */
export function fundingPlan(amounts: bigint[], notes: bigint[]): { covered: number; shortfall: bigint } {
  const pool = notes.filter((n) => n > 0n).sort((a, b) => (a < b ? -1 : 1));
  let covered = 0;
  let shortfall = 0n;
  for (const amt of amounts) {
    const i = pool.findIndex((n) => n >= amt);
    if (i < 0) {
      shortfall += amt;
      continue;
    }
    covered++;
    const change = pool[i] - amt;
    pool.splice(i, 1);
    if (change > 0n) {
      const j = pool.findIndex((n) => n > change);
      pool.splice(j < 0 ? pool.length : j, 0, change);
    }
  }
  return { covered, shortfall };
}

// ------------------------------------------------------------------ storage

const STORE_KEY = "gloam.payroll.v1";

async function readAll(): Promise<PayrollBatch[]> {
  if (typeof window === "undefined") return [];
  const all = await openJson<PayrollBatch[]>(window.localStorage.getItem(STORE_KEY));
  return Array.isArray(all) ? all : [];
}

async function writeAll(batches: PayrollBatch[]): Promise<void> {
  // Claim links are money: stored encrypted under the same device key as notes.
  window.localStorage.setItem(STORE_KEY, await sealJson(batches.slice(0, 30)));
}

export async function loadBatches(chainId: number, pool: Address): Promise<PayrollBatch[]> {
  return (await readAll())
    .filter((b) => b.chainId === chainId && b.pool.toLowerCase() === pool.toLowerCase())
    .sort((a, b) => b.createdAt - a.createdAt);
}

let writeQueue: Promise<void> = Promise.resolve();
export function saveBatch(batch: PayrollBatch): Promise<void> {
  writeQueue = writeQueue.then(async () => {
    const all = await readAll();
    await writeAll([batch, ...all.filter((b) => b.id !== batch.id)]);
  });
  return writeQueue;
}

export async function deleteBatch(id: string): Promise<void> {
  writeQueue = writeQueue.then(async () => {
    await writeAll((await readAll()).filter((b) => b.id !== id));
  });
  return writeQueue;
}

export function newBatch(args: {
  title: string;
  chainId: number;
  pool: Address;
  asset: Address;
  employer: Address;
  relay: boolean;
  rows: DraftRow[];
  /** The schedule this run pays, and the payday (YYYY-MM-DD) it covers. */
  schedule?: { id: string; payday: string };
}): PayrollBatch {
  const stamp = Date.now();
  return {
    ...(args.schedule ? { scheduleId: args.schedule.id, payday: args.schedule.payday } : {}),
    id: `pr-${stamp}`,
    title: args.title,
    createdAt: stamp,
    chainId: args.chainId,
    pool: args.pool,
    asset: args.asset,
    employer: args.employer,
    relay: args.relay,
    status: "draft",
    rows: args.rows
      .filter((r) => !r.error && r.amount != null)
      .map((r, i) => ({
        id: `${stamp}-${i}`,
        name: r.name,
        recipient: r.recipient,
        kind: r.kind,
        amount: r.amount!.toString(),
        status: "queued" as const,
      })),
  };
}

// ------------------------------------------------------------------ links + export

export function claimLink(origin: string, networkKey: string, code: string): string {
  // The code rides in the URL fragment, which browsers never send to a server.
  return `${origin}/app/vault?tab=move&net=${encodeURIComponent(networkKey)}#claim=${encodeURIComponent(code)}`;
}

function csvCell(v: string): string {
  return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

export function exportResultsCsv(
  batch: PayrollBatch,
  opts: { origin: string; networkKey: string; assetLabel: string; explorerTx: (h: string) => string }
): string {
  const head = ["name", "paid_to", "amount", "asset", "status", "claim_link", "payment_code", "transaction"];
  const lines = batch.rows.map((r) => {
    const link = r.kind === "link" && r.ticket ? claimLink(opts.origin, opts.networkKey, r.ticket) : "";
    // Direct payees whose notification did not post need their encrypted code.
    const code = r.kind === "gloam" && r.ticket && !r.memoPosted ? r.ticket : "";
    return [
      r.name,
      r.kind === "gloam" ? r.recipient : "claim link",
      formatAssetAmount(r.amount, batch.asset, 6),
      opts.assetLabel,
      r.status,
      link,
      code,
      r.txHash ? opts.explorerTx(r.txHash) : "",
    ]
      .map(csvCell)
      .join(",");
  });
  return [head.join(","), ...lines].join("\n");
}

// ------------------------------------------------------------------ engine

export type SubmitTransfer = (args: {
  proof: Hex;
  root: Hex;
  nullifier: Hex;
  commitments: readonly [Hex, Hex];
}) => Promise<Hex>;

export type SubmitMemo = (args: { paymentCommitment: Hex; memo: Hex }) => Promise<Hex>;

export type PayrollEngineDeps = {
  client: PublicClient;
  submitTransfer: SubmitTransfer;
  /** null when no memo board is live on this network */
  submitMemo: SubmitMemo | null;
  waitForTx: (hash: Hex) => Promise<"success" | "reverted">;
  onUpdate: (batch: PayrollBatch) => void;
  shouldStop: () => boolean;
};

export class PayrollStop extends Error {}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function syncUntil(client: PublicClient, commitment?: string, tries = 8): Promise<SyncedTree | null> {
  let tree: SyncedTree | null = null;
  for (let i = 0; i < tries; i++) {
    tree = await syncShieldTree(client);
    if (!commitment || tree?.indexByCommitment.has(commitment.toLowerCase())) return tree;
    await sleep(1_250);
  }
  return tree;
}

async function isSpent(client: PublicClient, pool: Address, nullifier: Hex): Promise<boolean> {
  return (await client.readContract({
    address: pool,
    abi: shieldPoolAbi,
    functionName: "isSpent",
    args: [nullifier],
  })) as boolean;
}

/**
 * Run (or resume) a payroll batch. Mutates and persists `batch` as it goes and
 * reports every change through deps.onUpdate. Resolves when every row is paid
 * or failed, or when stopped / out of funds (batch.status says which).
 */
export async function runPayroll(batch: PayrollBatch, deps: PayrollEngineDeps): Promise<PayrollBatch> {
  const { client } = deps;
  const emit = async () => {
    deps.onUpdate({ ...batch, rows: batch.rows.map((r) => ({ ...r })) });
    await saveBatch(batch);
  };
  batch.status = "running";
  await emit();

  try {
    for (const row of batch.rows) {
      if (row.status === "paid" || row.status === "failed") continue;
      if (deps.shouldStop()) throw new PayrollStop();

      // Resume: a row that was mid-flight either landed or it did not.
      if (row.spendNullifier && (row.status === "sending" || row.status === "confirming" || row.status === "notifying")) {
        const landed = await isSpent(client, batch.pool, row.spendNullifier);
        if (landed) {
          await finalizeTransfer(batch, row, client);
          await notify(batch, row, deps, emit);
          row.status = "paid";
          await emit();
          continue;
        }
        discardPending(row);
        row.status = "queued";
      }

      await payRow(batch, row, deps, emit);
    }
    batch.status = "done";
  } catch (e) {
    if (e instanceof PayrollStop) {
      if (batch.status === "running") batch.status = "paused";
    } else {
      batch.status = "paused";
      throw e;
    }
  } finally {
    await emit();
  }
  return batch;
}

function discardPending(row: PayrollRow) {
  // The change note never reached the pool; hide it so it is not counted.
  if (row.changeNoteId) updateLocalNote(row.changeNoteId, { status: "recovered" });
  row.spendNoteId = undefined;
  row.spendNullifier = undefined;
  row.changeNoteId = undefined;
  row.paymentCommitment = undefined;
  row.ticket = undefined;
  row.txHash = undefined;
}

async function payRow(
  batch: PayrollBatch,
  row: PayrollRow,
  deps: PayrollEngineDeps,
  emit: () => Promise<void>
) {
  const amount = BigInt(row.amount);
  for (let attempt = 1; attempt <= 3; attempt++) {
    if (deps.shouldStop()) throw new PayrollStop();
    row.attempts = attempt;
    row.status = "preparing";
    row.error = undefined;
    await emit();

    const tree = await syncUntil(deps.client);
    const notes = fundingNotes(batch.employer, batch.asset, tree)
      .filter((n) => BigInt(n.amountWei) >= amount)
      .sort((a, b) => (BigInt(a.amountWei) < BigInt(b.amountWei) ? -1 : 1));
    const note = notes[0];
    if (!note) {
      batch.status = "needs_funds";
      row.status = "queued";
      row.error = "Not enough in one private balance entry for this payment. Add money privately, then resume.";
      await emit();
      throw new PayrollStop();
    }

    try {
      const path = (await tree!.pathForLeaf(note.leafIndex!)) as PoseidonMerklePath | null;
      if (!path) throw new Error("Could not read the vault. Try again.");
      const w = await buildTransferWitness({
        secretHex: note.secret,
        amountIn: BigInt(note.amountWei),
        amountPay: amount,
        asset: batch.asset,
        path,
      });
      if (w.blocker) throw new Error(w.blocker);
      const { proofBytes } = await proveTransferInBrowser(w.circomInput);

      const pack = buildNotePackage({
        pool: batch.pool,
        asset: batch.asset,
        amountWei: w.paymentNote.amountWei,
        secret: w.paymentNote.secret,
        commitment: w.paymentNote.commitment,
      });
      const plain = encodeNotePackage(pack);
      const ticket = row.kind === "gloam" ? await encryptTicketForTag(plain, row.recipient) : plain;

      // Persist the change note and the row BEFORE submitting (crash safety).
      let changeNoteId: string | undefined;
      if (BigInt(w.changeNote.amountWei) > 0n) {
        changeNoteId = `chg-pr-${row.id}-${attempt}`;
        saveLocalNote({
          id: changeNoteId,
          chainId: batch.chainId,
          pool: batch.pool,
          asset: batch.asset,
          amountWei: w.changeNote.amountWei,
          commitment: w.changeNote.commitment,
          secret: w.changeNote.secret,
          nullifier: w.changeNote.nullifier,
          bound: true,
          scheme: "poseidon",
          from: batch.employer,
          createdAt: Date.now(),
          status: "open",
          source: "local",
        });
      }
      row.spendNoteId = note.id;
      row.spendNullifier = fieldToBytes32(w.publicInputs.nullifier);
      row.changeNoteId = changeNoteId;
      row.paymentCommitment = fieldToBytes32(w.publicInputs.newCommitment0);
      row.ticket = ticket;
      row.status = "sending";
      await emit();

      const hash = await deps.submitTransfer({
        proof: proofBytes,
        root: fieldToBytes32(w.publicInputs.root),
        nullifier: row.spendNullifier,
        commitments: [row.paymentCommitment, fieldToBytes32(w.publicInputs.newCommitment1)],
      });
      row.txHash = hash;
      row.status = "confirming";
      await emit();

      const outcome = await deps.waitForTx(hash);
      if (outcome !== "success") throw new Error("The payment was rejected on-chain.");

      await finalizeTransfer(batch, row, deps.client);
      await notify(batch, row, deps, emit);
      row.status = "paid";
      await emit();
      return;
    } catch (e) {
      if (e instanceof PayrollStop) throw e;
      const msg = e instanceof Error ? e.message : "Payment failed";
      // If it actually landed despite the error (e.g. receipt timeout), keep it.
      if (row.spendNullifier && (await isSpent(deps.client, batch.pool, row.spendNullifier).catch(() => false))) {
        await finalizeTransfer(batch, row, deps.client);
        await notify(batch, row, deps, emit);
        row.status = "paid";
        await emit();
        return;
      }
      discardPending(row);
      row.error = msg;
      if (attempt === 3 || /rejected|denied|cancel/i.test(msg)) {
        row.status = "failed";
        await emit();
        if (/denied|cancel/i.test(msg)) throw new PayrollStop();
        return;
      }
      await sleep(1_500);
    }
  }
}

async function finalizeTransfer(batch: PayrollBatch, row: PayrollRow, client: PublicClient) {
  if (row.spendNoteId) updateLocalNote(row.spendNoteId, { status: "recovered", txHash: row.txHash });
  if (row.changeNoteId) {
    const notes = loadLocalNotes(batch.employer);
    const change = notes.find((n) => n.id === row.changeNoteId);
    const tree = await syncUntil(client, change?.commitment);
    const idx = change ? tree?.indexByCommitment.get(change.commitment.toLowerCase()) : undefined;
    updateLocalNote(row.changeNoteId, { leafIndex: idx, txHash: row.txHash });
  }
}

async function notify(batch: PayrollBatch, row: PayrollRow, deps: PayrollEngineDeps, emit: () => Promise<void>) {
  if (row.kind !== "gloam" || row.memoPosted || !deps.submitMemo || !row.ticket || !row.paymentCommitment) return;
  row.status = "notifying";
  await emit();
  try {
    const h = await deps.submitMemo({
      paymentCommitment: row.paymentCommitment,
      memo: ticketToMemoBytes(row.ticket),
    });
    row.memoPosted = (await deps.waitForTx(h)) === "success";
  } catch {
    // The money already landed; they can still claim with the payment code.
    row.memoPosted = false;
  }
}
