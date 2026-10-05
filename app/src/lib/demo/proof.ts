/*
 * Recording demo: stand-ins for the browser prover and the proof checker
 * (switch in lib/demoFlag.ts). Kept apart from the rest of lib/demo because the
 * public /verify page reaches them too, and it should stay this small.
 */

import type { Hex } from "viem";
import type { Groth16Proof } from "@gloamtrade/sdk";
import { readDemo } from "@/lib/demoFlag";
import { DEMO_MS, jitter, randomField, randomHex, sleep } from "./store";

/** Marks a pretend proof so only a demo tab ever accepts it. */
type DemoProof = Groth16Proof & { protocol: "groth16"; curve: "bn128"; demo: true };

function field(): string {
  return BigInt(randomField()).toString();
}

/*
 * Demo proofs this device made. The demo switch can be flipped by anyone with a
 * link (`?demo=1`), so a hand-made "demo" proof sent to someone else must not
 * check out in their tab. Only proofs listed here do, and nobody can write to
 * another person's storage.
 */
const MADE_KEY = "gloam_demo_proofs";
const MADE_MAX = 64;

function madeHere(): string[] {
  try {
    const list: unknown = JSON.parse(window.localStorage.getItem(MADE_KEY) ?? "[]");
    return Array.isArray(list) ? list.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function rememberMade(id: string) {
  try {
    window.localStorage.setItem(MADE_KEY, JSON.stringify([id, ...madeHere()].slice(0, MADE_MAX)));
  } catch {
    /* storage off: the proof just will not check out later */
  }
}

/** A demo proof's fingerprint: its first random point. */
function demoId(proof: unknown): string | null {
  const a = (proof as { pi_a?: unknown } | null)?.pi_a;
  return Array.isArray(a) && typeof a[0] === "string" ? a[0] : null;
}

/**
 * Holds for a believable proving time and proves nothing. `publicKeys` names
 * the circuit inputs that are its public signals, echoed back in order.
 */
export async function demoProve(
  circomInput: Record<string, string | string[]>,
  publicKeys: string[] = []
): Promise<{ proofBytes: Hex; publicSignals: string[]; proof: Groth16Proof }> {
  await sleep(jitter(DEMO_MS.proof));
  const proof: DemoProof = {
    pi_a: [field(), field(), "1"],
    pi_b: [
      [field(), field()],
      [field(), field()],
      ["1", "0"],
    ],
    pi_c: [field(), field(), "1"],
    protocol: "groth16",
    curve: "bn128",
    demo: true,
  };
  rememberMade(proof.pi_a[0]);
  return {
    proofBytes: randomHex(256),
    publicSignals: publicKeys.map((k) => String(circomInput[k] ?? "0")),
    proof,
  };
}

/** A proof demoProve made on this device, opened in a demo tab. */
export function isDemoProof(proof: unknown): boolean {
  if (!readDemo() || (proof as { demo?: unknown } | null)?.demo !== true) return false;
  const id = demoId(proof);
  return id != null && madeHere().includes(id);
}

/** Checking a demo proof: it holds, after the time a real check takes. */
export async function demoVerifyProof(): Promise<boolean> {
  await sleep(jitter(DEMO_MS.verify));
  return true;
}

/** Looking a demo proof's balance up in the vault: it is there. */
export async function demoCommitmentSeen(): Promise<boolean> {
  await sleep(jitter(DEMO_MS.lookup));
  return true;
}

/**
 * Proof of funds / payment from the pretend wallet: the caller computes the
 * public signals (real context and nullifiers, made-up root), the proof is not real.
 */
export async function demoHolderProof(
  publicSignals: string[]
): Promise<{ proof: Groth16Proof; publicSignals: string[] }> {
  const { proof } = await demoProve({});
  return { proof, publicSignals };
}

/** A pretend vault snapshot root for demoHolderProof. */
export function demoRoot(): Hex {
  return randomField();
}

/**
 * Checking a demo proof of funds / payment: the proof holds and every vault
 * lookup passes, after the time real checks take. The payment landed earlier today.
 */
export async function demoHolderChecks(): Promise<{ paidAt: number }> {
  await sleep(jitter(DEMO_MS.verify));
  await sleep(jitter(DEMO_MS.lookup));
  return { paidAt: Math.floor(Date.now() / 1000) - 2 * 3600 };
}
