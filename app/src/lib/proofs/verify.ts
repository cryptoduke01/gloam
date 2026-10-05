/**
 * Checking a proof of funds or payment, the way the /verify page shows it: one
 * plain-language line per check, in order. Nothing here trusts the proof's plain
 * fields on their own; each is matched against the proof's public signals, and
 * the signals against the snark, the context and the chain.
 *
 * `ok` means every check passed and the proof has not expired. The one check
 * allowed to stay "unknown" is when the payment landed (a payment with no tx
 * hash may be older than the bounded log scan; the vault still vouches for it).
 */
import { FIELD_PRIME, fieldToHex, proofContext, readFundsSignals, readReceiptSignals } from "@gloamtrade/sdk";
import type { Hex } from "viem";
import { demoHolderChecks, isDemoProof } from "@/lib/demo/proof";
import { verificationKey } from "./artifacts";
import { clientFor, commitmentSeen, findNoteTx, isKnownRoot, isSpent, networkForChain } from "./chain";
import type { AnyProof, CheckState, FundsProof, PaymentProof, VerifyResult } from "./types";

const PAID_AT = "When the payment landed";

type Check = VerifyResult["checks"][number];

function when(unix: number): string {
  return new Date(unix * 1000).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" });
}

function sameHex(a: string, b: bigint): boolean {
  try {
    return BigInt(a) === b;
  } catch {
    return false;
  }
}

/** Signals as field elements, or null when any is not a canonical decimal below p. */
function fieldSignals(signals: unknown): string[] | null {
  if (!Array.isArray(signals)) return null;
  for (const s of signals) {
    if (typeof s !== "string" || !/^\d{1,78}$/.test(s) || BigInt(s) >= FIELD_PRIME) return null;
  }
  return signals as string[];
}

export async function verifyProof(p: AnyProof): Promise<VerifyResult> {
  const checks: Check[] = [];
  const add = (label: string, state: CheckState, detail?: string) => checks.push({ label, state, detail });
  const expired = !(Number.isSafeInteger(p.expiresAt) && Math.floor(Date.now() / 1000) <= p.expiresAt);
  const finish = (paidAt?: number): VerifyResult => ({
    ok: !expired && checks.every((c) => c.state === "pass" || (c.label === PAID_AT && c.state === "unknown")),
    kind: p.kind,
    checks,
    paidAt,
    expired,
  });

  const signals = fieldSignals(p.publicSignals);
  let funds: ReturnType<typeof readFundsSignals> | null = null;
  let receipt: ReturnType<typeof readReceiptSignals> | null = null;
  try {
    if (signals && p.kind === "funds") funds = readFundsSignals(signals);
    if (signals && p.kind === "payment") receipt = readReceiptSignals(signals);
  } catch {
    /* wrong signal count: reported below */
  }
  if (!signals || (!funds && !receipt)) {
    add("The proof checks out", "fail", "This proof is damaged or incomplete.");
    return finish();
  }
  const context = (funds ?? receipt)!.context;
  const demo = isDemoProof(p.proof);

  // 1) The zero-knowledge proof itself.
  let valid = false;
  if (demo) {
    valid = true;
  } else {
    try {
      const snarkjs = await import("snarkjs");
      valid = await snarkjs.groth16.verify(await verificationKey(funds ? "funds" : "receipt"), signals, p.proof);
    } catch {
      valid = false;
    }
  }
  add(
    "The proof checks out",
    valid ? "pass" : "fail",
    valid ? "Verified with Gloam's zero-knowledge checking key." : "The math does not hold. It was edited or made for a different circuit."
  );

  // 2) Who it was made for (label, expiry, chain, pool are sealed into `context`).
  let sealed = false;
  try {
    sealed =
      typeof p.verifier === "string" &&
      proofContext({ kind: p.kind, chainId: p.chainId, pool: p.pool, verifier: p.verifier, expiresAt: p.expiresAt }) ===
        context;
  } catch {
    sealed = false;
  }
  add(
    `Made for "${String(p.verifier)}"`,
    sealed ? "pass" : "fail",
    sealed
      ? "The name, expiry and network are sealed into the proof."
      : "The name, expiry or network was changed after the proof was made."
  );

  // 3) The vault it points at must be Gloam's own, or every chain check below is meaningless.
  const net = networkForChain(p.chainId);
  const official = Boolean(net?.pool && typeof p.pool === "string" && net.pool.toLowerCase() === p.pool.toLowerCase());
  add(
    official ? `Made on Gloam's vault on ${net!.label}` : "Made on Gloam's vault",
    official ? "pass" : "fail",
    official ? undefined : "The vault address is not Gloam's current vault, so its balances cannot be trusted."
  );

  // 4) The plain fields shown to the reader match what the proof says.
  const fieldsMatch = funds ? fundsFieldsMatch(p as FundsProof, funds) : paymentFieldsMatch(p as PaymentProof, receipt!);
  add(
    "Asset and amount match the proof",
    fieldsMatch ? "pass" : "fail",
    fieldsMatch ? undefined : "The asset or amount shown was changed after the proof was made."
  );

  if (!official || !net?.pool) {
    add("Not expired", expired ? "fail" : "pass", `Valid until ${when(p.expiresAt)}.`);
    return finish();
  }

  // 5) Chain checks, against the network the proof names.
  let paidAt: number | undefined;
  if (demo) {
    ({ paidAt } = await demoHolderChecks());
    add("Matches a real vault state", "pass");
    if (funds) {
      add("No balance counted twice", "pass");
      add("Balance is still unspent", "pass", "None of the backing notes has moved since.");
    } else {
      add("Payment is in the vault", "pass");
      add(PAID_AT, "pass", when(paidAt));
    }
  } else {
    const client = clientFor(net);
    const pool = net.pool;
    const offline = `Could not reach ${net.label}. Try again.`;
    const root = (funds ?? receipt)!.root;

    const rootKnown = await isKnownRoot(client, pool, fieldToHex(root)).catch(() => null);
    add(
      "Matches a real vault state",
      rootKnown == null ? "unknown" : rootKnown ? "pass" : "fail",
      rootKnown == null ? offline : rootKnown ? undefined : "The vault never had the state this proof was made against."
    );

    if (funds) {
      const used = funds.nullifiers.filter((n) => n !== 0n);
      const distinct = new Set(used).size === used.length;
      add(
        "No balance counted twice",
        distinct ? "pass" : "fail",
        distinct ? `Backed by ${used.length} separate ${used.length === 1 ? "note" : "notes"}.` : "The same note was counted more than once."
      );
      const spent = await Promise.all(used.map((n) => isSpent(client, pool, fieldToHex(n)))).catch(() => null);
      const anySpent = spent?.some(Boolean);
      add(
        "Balance is still unspent",
        spent == null ? "unknown" : anySpent ? "fail" : "pass",
        spent == null
          ? offline
          : anySpent
            ? "Some of this balance has moved since the proof was made."
            : "None of the backing notes has moved since."
      );
    } else {
      const commitment = fieldToHex(receipt!.commitment);
      const seen = await commitmentSeen(client, pool, commitment).catch(() => null);
      add(
        "Payment is in the vault",
        seen == null ? "unknown" : seen ? "pass" : "fail",
        seen == null ? offline : seen ? undefined : "The vault has no record of this payment."
      );
      const txHash = typeof (p as PaymentProof).txHash === "string" ? ((p as PaymentProof).txHash as Hex) : null;
      const tx = await findNoteTx(client, net, pool, commitment, txHash).catch(() => null);
      if (tx?.state === "found" && tx.origin !== "payment") {
        // Knowing a note's secret is all the circuit shows, so the holder's own
        // deposit or trade output would otherwise pass as a payment received.
        add(
          PAID_AT,
          "fail",
          tx.origin === "deposit"
            ? "This was a deposit into the vault, not a payment received."
            : "This came from a private trade, not a payment received."
        );
      } else if (tx?.state === "found") {
        paidAt = tx.paidAt;
        add(PAID_AT, "pass", `${when(tx.paidAt)}. Arrived in a private payment; the proof does not show who sent it.`);
      } else if (tx?.state === "mismatch") {
        add(PAID_AT, "fail", "The transaction named in the proof did not make this payment.");
      } else {
        add(
          PAID_AT,
          "unknown",
          tx == null ? offline : txHash ? "That transaction was not found on this network." : "Not in recent blocks. The vault still holds it."
        );
      }
    }
  }

  // 6) Expiry.
  add(expired ? "Expired" : "Not expired", expired ? "fail" : "pass", `Valid until ${when(p.expiresAt)}.`);
  return finish(paidAt);
}

function fundsFieldsMatch(p: FundsProof, s: ReturnType<typeof readFundsSignals>): boolean {
  const used = s.nullifiers.filter((n) => n !== 0n);
  return (
    sameHex(p.asset, s.asset) &&
    /^\d+$/.test(String(p.threshold)) &&
    BigInt(p.threshold) === s.threshold &&
    s.threshold > 0n &&
    sameHex(p.root, s.root) &&
    Array.isArray(p.nullifiers) &&
    p.nullifiers.length === used.length &&
    p.nullifiers.every((n, i) => sameHex(n, used[i]!))
  );
}

function paymentFieldsMatch(p: PaymentProof, s: ReturnType<typeof readReceiptSignals>): boolean {
  const shown = p.amount != null;
  return (
    sameHex(p.asset, s.asset) &&
    sameHex(p.commitment, s.commitment) &&
    /^\d+$/.test(String(p.minAmount)) &&
    BigInt(p.minAmount) === s.minAmount &&
    s.reveal === (shown ? 1n : 0n) &&
    (shown ? /^\d+$/.test(String(p.amount)) && BigInt(p.amount!) === s.shownAmount : s.shownAmount === 0n)
  );
}
