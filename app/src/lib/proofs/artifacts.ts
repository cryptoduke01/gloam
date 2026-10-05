/**
 * Circuit artifacts for the holder proofs, served from /public/circuits.
 * Ceremony: dev (pot16 + one single-party phase-2 contribution), same as the
 * other circuits. Rebuild with contracts/circuits/scripts/build-proof-circuits.mjs
 * and update the pins below from its output: new keys invalidate old proofs.
 */
import { assertArtifactIntegrity } from "@/lib/circuitArtifacts";

type Artifact = { path: string; sha256: string };

export const PROOF_ARTIFACTS = {
  funds: {
    wasm: {
      path: "/circuits/funds.wasm",
      sha256: "92107909cf3beed082adfadc26195c450e071a8350632f38ef9f8aca40cac1eb",
    },
    zkey: {
      path: "/circuits/funds_final.zkey",
      sha256: "c4026803fbd091605c4a986d789ffc02ab4c48b3e11642054e6feb20303cacd9",
    },
    vkey: {
      path: "/circuits/funds_vkey.json",
      sha256: "34b154806a0f4de2ad37368bddf009f360c42650f89985a1c9a1403fc3f28351",
    },
  },
  receipt: {
    wasm: {
      path: "/circuits/receipt.wasm",
      sha256: "14733e0d4f598d6b392ce8e955eae5624ace80932aa9acdb9298d26c6d1a8fc1",
    },
    zkey: {
      path: "/circuits/receipt_final.zkey",
      sha256: "600652865c27f9b1dafa4edfe65da7c4f8b7c9c6099bf0c85da0151d91830a9a",
    },
    vkey: {
      path: "/circuits/receipt_vkey.json",
      sha256: "c3cb613d88398a55329dfd9f2e4c322ee6e5897689e970911f23890c78e2e63d",
    },
  },
  // 32 payments per proof, 37,278 constraints; the proving key is about 24 MB.
  payroll: {
    wasm: {
      path: "/circuits/payroll_total.wasm",
      sha256: "0acee042752e3ae22d0e30f64084ba7638467a66bcee7d55d934041512db69f3",
    },
    zkey: {
      path: "/circuits/payroll_total_final.zkey",
      sha256: "f8cb1c8ea5ada2e09a07c47ab3d994860e1a71e021ea89ca96cf1c90c4c1c272",
    },
    vkey: {
      path: "/circuits/payroll_total_vkey.json",
      sha256: "52be3bb32335f3ec838cf02aa6eab2b30134d6df3f32ffbc5f39a49862b8d44a",
    },
  },
} as const satisfies Record<string, Record<"wasm" | "zkey" | "vkey", Artifact>>;

export type ProofCircuit = keyof typeof PROOF_ARTIFACTS;

async function check(a: Artifact) {
  await assertArtifactIntegrity(a.path, a.sha256);
}

/** Proving files, hash-checked before use (refuses to prove on a mismatch). */
export async function provingArtifacts(circuit: ProofCircuit) {
  const set = PROOF_ARTIFACTS[circuit];
  await Promise.all([check(set.wasm), check(set.zkey)]);
  return { wasm: set.wasm.path, zkey: set.zkey.path };
}

const vkeys = new Map<ProofCircuit, unknown>();

/** Verification key, hash-checked, cached for the session. */
export async function verificationKey(circuit: ProofCircuit): Promise<unknown> {
  const cached = vkeys.get(circuit);
  if (cached) return cached;
  const a = PROOF_ARTIFACTS[circuit].vkey;
  await check(a);
  const res = await fetch(a.path, { cache: "force-cache" });
  if (!res.ok) throw new Error("Could not load the proof checking key.");
  const vkey: unknown = await res.json();
  vkeys.set(circuit, vkey);
  return vkey;
}
