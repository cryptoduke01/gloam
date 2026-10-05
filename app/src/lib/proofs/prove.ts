/**
 * Browser provers for proof of funds, proof of payment and the payroll total.
 * Witnesses come from @gloamtrade/sdk (buildFundsWitness / buildReceiptWitness
 * with Merkle paths from the synced vault tree; buildPayrollWitness from the
 * run's own records, no tree needed); snarkjs proves against the hash-checked
 * dev artifacts in /circuits (./artifacts).
 *
 * Context: each proof's `context` public signal is
 *   keccak256(abi.encode("gloam.proof.v1", kind, chainId, pool, expiresAt, verifier)) mod p
 * (proofContext in the SDK). The verifier recomputes it from the plain fields.
 */
import {
  buildFundsWitness,
  buildPayrollWitness,
  buildReceiptWitness,
  fieldToHex,
  hexToField,
  noteNullifierPoseidon,
  payrollParts,
  proofContext,
  type PoseidonMerklePath,
} from "@gloamtrade/sdk";
import type { Address, PublicClient } from "viem";
import { readDemo } from "@/lib/demoFlag";
import { demoHolderProof, demoRoot } from "@/lib/demo/proof";
import { getActiveNetwork } from "@/lib/networks";
import type { LocalNote } from "@/lib/shield";
import type { SyncedTree } from "@/lib/treeSync";
import { provingArtifacts, type ProofCircuit } from "./artifacts";
import { isSpent, networkForChain } from "./chain";
import {
  FUNDS_MAX_NOTES,
  type FundsProof,
  type PaymentProof,
  type PayrollProof,
  type ProveFundsArgs,
  type ProvePaymentArgs,
  type ProvePayrollArgs,
} from "./types";

const DEFAULT_TTL_S = 7 * 24 * 3600;
const MAX_LABEL = 80;
/** A payroll proof carries every payment; past this it stops being a thing to paste. */
const PAYROLL_MAX_PAYMENTS_TOTAL = 256;

/** The label exactly as it is sealed into the proof: trimmed, single spaced. */
export function cleanVerifierLabel(label: string): string {
  const v = label.trim().replace(/\s+/g, " ");
  if (!v) throw new Error("Say who this proof is for.");
  if (v.length > MAX_LABEL) throw new Error(`Keep the name under ${MAX_LABEL} characters.`);
  return v;
}

function expiryOf(expiresAt: number | undefined): number {
  const now = Math.floor(Date.now() / 1000);
  const at = expiresAt ?? now + DEFAULT_TTL_S;
  if (!Number.isSafeInteger(at) || at <= now) throw new Error("Pick an expiry in the future.");
  return at;
}

/** A note can back a proof only if its secret is here and it is a Poseidon note of this vault. */
function assertUsable(note: LocalNote, chainId: number, pool: Address) {
  if (!note.secret || note.secret === "0x" || note.secret.length < 10) {
    throw new Error("This balance has no key on this device, so it cannot back a proof.");
  }
  if (note.scheme === "keccak") throw new Error("Older balances cannot back a proof. Move them first.");
  if (note.chainId !== chainId || note.pool.toLowerCase() !== pool.toLowerCase()) {
    throw new Error("These balances are from another network or an older vault.");
  }
}

/** The active network's synced tree; proofs are made on the network the app is on. */
async function vaultTree(chainId: number, pool: Address): Promise<{ client: PublicClient; tree: SyncedTree }> {
  const net = getActiveNetwork();
  if (net.chainId !== chainId || !net.pool || net.pool.toLowerCase() !== pool.toLowerCase()) {
    throw new Error(`Switch to ${networkForChain(chainId)?.label ?? "that network"} to prove with these balances.`);
  }
  const [{ syncShieldTree }, { getRhPublicClient }] = await Promise.all([
    import("@/lib/treeSync"),
    import("@/lib/rhClient"),
  ]);
  const client = getRhPublicClient();
  const tree = await syncShieldTree(client);
  if (!tree || tree.scheme !== "poseidon") throw new Error("Could not read the vault. Try again.");
  return { client, tree };
}

async function leafOf(tree: SyncedTree, note: LocalNote): Promise<{ index: number; path: PoseidonMerklePath }> {
  // The synced tree is authoritative; a note's own leafIndex can be missing or stale.
  const index = tree.indexByCommitment.get(note.commitment.toLowerCase());
  if (index === undefined) {
    throw new Error("A balance is not in the vault yet. Wait for it to confirm, then try again.");
  }
  const path = (await tree.pathForLeaf(index)) as PoseidonMerklePath | null;
  if (!path) throw new Error("Could not read the vault. Try again.");
  return { index, path };
}

async function prove(circuit: ProofCircuit, input: Record<string, unknown>, expected: string[]) {
  const { wasm, zkey } = await provingArtifacts(circuit);
  const snarkjs = await import("snarkjs");
  const { proof, publicSignals } = await snarkjs.groth16.fullProve(input, wasm, zkey);
  if (publicSignals.length !== expected.length || publicSignals.some((s, i) => s !== expected[i])) {
    throw new Error("The proof did not come out as expected. Refresh and try again.");
  }
  return { proof: proof as unknown, publicSignals };
}

export async function proveFunds(args: ProveFundsArgs): Promise<FundsProof> {
  const verifier = cleanVerifierLabel(args.verifier);
  const expiresAt = expiryOf(args.expiresAt);
  const { chainId, pool, asset, threshold, notes } = args;
  if (threshold <= 0n) throw new Error("Enter an amount above zero.");
  if (notes.length < 1 || notes.length > FUNDS_MAX_NOTES) {
    throw new Error(`A proof of funds uses 1 to ${FUNDS_MAX_NOTES} balances.`);
  }
  for (const n of notes) {
    assertUsable(n, chainId, pool);
    if (n.asset.toLowerCase() !== asset.toLowerCase()) throw new Error("All balances must be the same asset.");
  }
  const context = proofContext({ kind: "funds", chainId, pool, verifier, expiresAt });
  const base = { v: 1 as const, kind: "funds" as const, chainId, pool, verifier, expiresAt, asset, threshold: threshold.toString() };

  // Recording demo: real context and nullifiers, a pretend root, no proof.
  if (readDemo()) {
    const total = notes.reduce((s, n) => s + BigInt(n.amountWei), 0n);
    if (total < threshold) throw new Error("These balances add up to less than the amount you want to prove.");
    const nullifiers = await Promise.all(
      notes.map((n) => noteNullifierPoseidon(hexToField(n.secret), hexToField(n.commitment)))
    );
    const root = demoRoot();
    const padded = [...nullifiers, ...Array<bigint>(FUNDS_MAX_NOTES - nullifiers.length).fill(0n)];
    const signals = [hexToField(root), BigInt(asset), threshold, context, ...padded].map(String);
    const { proof, publicSignals } = await demoHolderProof(signals);
    return { ...base, root, nullifiers: nullifiers.map(fieldToHex), proof, publicSignals };
  }

  const { client, tree } = await vaultTree(chainId, pool);
  const leaves = await Promise.all(notes.map((n) => leafOf(tree, n)));
  const w = await buildFundsWitness({
    asset,
    threshold,
    context,
    notes: notes.map((n, i) => ({ secretHex: n.secret, amount: BigInt(n.amountWei), path: leaves[i]!.path })),
  });
  if (w.blocker) throw new Error(w.blocker);

  // A spent note would fail at the verifier; say so now instead of making a dud.
  const nullifiers = w.publicInputs.nullifiers.filter((n) => n !== 0n).map(fieldToHex);
  const spent = await Promise.all(nullifiers.map((n) => isSpent(client, pool, n)));
  if (spent.some(Boolean)) {
    throw new Error("One of these balances was already spent. Refresh and try again.");
  }

  const { proof, publicSignals } = await prove("funds", w.circomInput, w.publicSignals);
  return { ...base, root: fieldToHex(w.publicInputs.root), nullifiers, proof, publicSignals };
}

export async function provePayment(args: ProvePaymentArgs): Promise<PaymentProof> {
  const verifier = cleanVerifierLabel(args.verifier);
  const expiresAt = expiryOf(args.expiresAt);
  const { chainId, pool, note, reveal } = args;
  assertUsable(note, chainId, pool);
  const amount = BigInt(note.amountWei);
  const minAmount = reveal ? amount : (args.minAmount ?? amount);
  if (minAmount < 0n || minAmount > amount) throw new Error("The minimum must be between zero and the payment.");
  const context = proofContext({ kind: "payment", chainId, pool, verifier, expiresAt });
  const base = {
    v: 1 as const,
    kind: "payment" as const,
    chainId,
    pool,
    verifier,
    expiresAt,
    asset: note.asset,
    amount: reveal ? amount.toString() : null,
    minAmount: minAmount.toString(),
  };

  if (readDemo()) {
    const commitment = hexToField(note.commitment);
    const signals = [
      hexToField(demoRoot()),
      commitment,
      BigInt(note.asset),
      minAmount,
      reveal ? 1n : 0n,
      reveal ? amount : 0n,
      context,
    ].map(String);
    const { proof, publicSignals } = await demoHolderProof(signals);
    return { ...base, commitment: fieldToHex(commitment), txHash: note.txHash ?? null, proof, publicSignals };
  }

  const { tree } = await vaultTree(chainId, pool);
  const { index, path } = await leafOf(tree, note);
  const w = await buildReceiptWitness({
    secretHex: note.secret,
    amount,
    asset: note.asset,
    path,
    reveal,
    minAmount,
    context,
  });
  if (w.blocker) throw new Error(w.blocker);
  const { proof, publicSignals } = await prove("receipt", w.circomInput, w.publicSignals);
  // The tree knows which transaction inserted each leaf; fall back to the note's own record.
  const leaf = tree.leaves[index];
  const txHash = (leaf?.leafIndex === index ? leaf.txHash : undefined) ?? note.txHash ?? null;
  return { ...base, commitment: fieldToHex(w.publicInputs.commitment), txHash, proof, publicSignals };
}

/**
 * Payroll total: one part per up to 32 payments (split evenly, payrollParts),
 * each proving its payments' sum and count under the run's list hash. Needs no
 * vault sync: the payments are pinned on chain by the verifier, through the
 * transactions that made them.
 */
export async function provePayrollTotal(args: ProvePayrollArgs): Promise<PayrollProof> {
  const verifier = cleanVerifierLabel(args.verifier);
  const expiresAt = expiryOf(args.expiresAt);
  const { chainId, pool, asset, payments } = args;
  if (payments.length < 1) throw new Error("This run has no finished payments to prove.");
  if (payments.length > PAYROLL_MAX_PAYMENTS_TOTAL) {
    throw new Error(`A payroll proof covers up to ${PAYROLL_MAX_PAYMENTS_TOTAL} payments.`);
  }
  const seen = new Set<string>();
  for (const pay of payments) {
    for (const k of [`c${pay.commitment.toLowerCase()}`, `n${pay.nullifier.toLowerCase()}`]) {
      if (seen.has(k)) throw new Error("The same payment is listed twice in this run.");
      seen.add(k);
    }
  }
  const context = proofContext({ kind: "payroll", chainId, pool, verifier, expiresAt });
  // Recording demo: real witness and signals from the demo run's notes, a pretend proof per part.
  const demo = readDemo();

  const sizes = payrollParts(payments.length);
  const parts: PayrollProof["parts"] = [];
  const listed: PayrollProof["payments"] = [];
  let offset = 0;
  for (const size of sizes) {
    const slice = payments.slice(offset, offset + size);
    offset += size;
    const w = await buildPayrollWitness({
      asset,
      context,
      payments: slice.map((pay) => ({
        secretHex: pay.secret,
        amount: pay.amount,
        spendSecretHex: pay.spendSecret,
        spendAmount: pay.spendAmount,
        commitment: pay.commitment,
        nullifier: pay.nullifier,
      })),
    });
    if (w.blocker) throw new Error(w.blocker);
    const { proof, publicSignals } = demo
      ? await demoHolderProof(w.publicSignals)
      : await prove("payroll", w.circomInput, w.publicSignals);
    parts.push({ proof, publicSignals });
    w.payments.forEach((x, i) =>
      listed.push({ commitment: fieldToHex(x.commitment), nullifier: fieldToHex(x.nullifier), txHash: slice[i]!.txHash })
    );
    args.onPart?.(parts.length, sizes.length);
  }

  return {
    v: 1,
    kind: "payroll",
    chainId,
    pool,
    verifier,
    expiresAt,
    asset,
    total: payments.reduce((s, pay) => s + pay.amount, 0n).toString(),
    count: payments.length,
    payments: listed,
    parts,
  };
}
