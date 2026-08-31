/**
 * Circuit artifacts in /public/circuits.
 * Ceremony: **dev** (Powers of Tau + single-party contribution), not production.
 * SHA-256 fingerprints for tamper detection at prove time.
 */

export type CeremonyKind = "dev" | "production";

export const PROVING_CEREMONY: CeremonyKind = "dev";

export const CIRCUIT_ARTIFACTS = {
  unshieldWasm: {
    path: "/circuits/unshield.wasm",
    sha256:
      "1accdab33d135c3b881eedd97666e0e03caf8381496d222c4e9f1c98bdcc015b",
  },
  unshieldZkey: {
    path: "/circuits/unshield_final.zkey",
    sha256:
      "cb3a58bd22c2011141420501a0181893840b805c428d170c267eeda0842faec5",
  },
  transferWasm: {
    path: "/circuits/transfer.wasm",
    sha256:
      "b13262e3f8f525f3e0d627579e47a1a64236d714e7c07807ac3d8a2380a031c4",
  },
  transferZkey: {
    path: "/circuits/transfer_final.zkey",
    sha256:
      "d0455992378084fdb8a7f85eea5f5395c6dd281ca5b6525d63cfc9c95097da78",
  },
  sealedSwapWasm: {
    path: "/circuits/sealed_swap.wasm",
    sha256:
      "8e1f8f2e331da4f8ad8c0fccf39ae68123189fd1202c42b5d8ce548fa89fd33d",
  },
  sealedSwapZkey: {
    path: "/circuits/sealed_swap_final.zkey",
    sha256:
      "c9672678325e77cf4416c96fef9bba2f839e57b2f35aed09d869ae293875dd8e",
  },
} as const;

function hexSha256(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let out = "";
  for (let i = 0; i < bytes.length; i++) {
    out += bytes[i]!.toString(16).padStart(2, "0");
  }
  return out;
}

const verified = new Set<string>();

/** Fetch artifact and check SHA-256. Cached per session path. */
export async function assertArtifactIntegrity(
  path: string,
  expectedSha256: string
): Promise<void> {
  const key = `${path}:${expectedSha256}`;
  if (verified.has(key)) return;

  const res = await fetch(path, { cache: "force-cache" });
  if (!res.ok) {
    throw new Error(`Missing circuit file ${path} (${res.status}).`);
  }
  const data = await res.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", data);
  const got = hexSha256(digest);
  if (got !== expectedSha256.toLowerCase()) {
    throw new Error(
      `Circuit artifact hash mismatch for ${path}. Expected ${expectedSha256.slice(0, 12)}… got ${got.slice(0, 12)}…, refuse to prove.`
    );
  }
  verified.add(key);
}

export async function assertUnshieldArtifacts(): Promise<void> {
  await assertArtifactIntegrity(
    CIRCUIT_ARTIFACTS.unshieldWasm.path,
    CIRCUIT_ARTIFACTS.unshieldWasm.sha256
  );
  await assertArtifactIntegrity(
    CIRCUIT_ARTIFACTS.unshieldZkey.path,
    CIRCUIT_ARTIFACTS.unshieldZkey.sha256
  );
}

export async function assertTransferArtifacts(): Promise<void> {
  await assertArtifactIntegrity(
    CIRCUIT_ARTIFACTS.transferWasm.path,
    CIRCUIT_ARTIFACTS.transferWasm.sha256
  );
  await assertArtifactIntegrity(
    CIRCUIT_ARTIFACTS.transferZkey.path,
    CIRCUIT_ARTIFACTS.transferZkey.sha256
  );
}

export async function assertSealedSwapArtifacts(): Promise<void> {
  await assertArtifactIntegrity(
    CIRCUIT_ARTIFACTS.sealedSwapWasm.path,
    CIRCUIT_ARTIFACTS.sealedSwapWasm.sha256
  );
  await assertArtifactIntegrity(
    CIRCUIT_ARTIFACTS.sealedSwapZkey.path,
    CIRCUIT_ARTIFACTS.sealedSwapZkey.sha256
  );
}

export function isDevCeremony(): boolean {
  return PROVING_CEREMONY === "dev";
}
