/**
 * Circuit files for proving in node. snarkjs proves from local paths, so each
 * circuit's wasm and zkey is read from a local folder (the layout gloam.trade
 * serves: dev keys at the root, the ceremony's final keys under final/) or
 * downloaded once from https://www.gloam.trade/circuits into a cache folder.
 *
 * Every file is checked against a pinned SHA-256 before use: the pool circuits
 * against the SDK's CIRCUIT_SHA256, the proof circuits (funds, receipt)
 * against the same values the Gloam app pins. A file that does not match is
 * never used. Mainnet and Base Sepolia prove with the final keys, the older
 * testnets with the dev keys (ceremonyForChainId).
 *
 * The checking keys for funds and receipt proofs ship inside this package
 * (src/vkeys), so verifying a proof never downloads anything.
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { GLOAM_ARTIFACTS_URL, circuitArtifactFiles, type CeremonyKind, type PoolCircuit } from "@gloamtrade/sdk";

export type ProofCircuit = "funds" | "receipt";
export type Circuit = PoolCircuit | ProofCircuit;

/** Pinned like app/src/lib/proofs/artifacts.ts. The .wasm is the same for both key sets. */
const PROOF_SHA256: Record<ProofCircuit, { wasm: string; zkey: Record<CeremonyKind, string>; vkey: Record<CeremonyKind, string> }> = {
  funds: {
    wasm: "92107909cf3beed082adfadc26195c450e071a8350632f38ef9f8aca40cac1eb",
    zkey: {
      dev: "c4026803fbd091605c4a986d789ffc02ab4c48b3e11642054e6feb20303cacd9",
      production: "e3fadcf8ce4aeaf07a6a96c2b74b6774ae0a8ba3c1aa4496a033c69f81b54228",
    },
    vkey: {
      dev: "34b154806a0f4de2ad37368bddf009f360c42650f89985a1c9a1403fc3f28351",
      production: "aef4f1d41c28f9883e5c19cf40ba4cbab81af5d3abe208924afb558528f85241",
    },
  },
  receipt: {
    wasm: "14733e0d4f598d6b392ce8e955eae5624ace80932aa9acdb9298d26c6d1a8fc1",
    zkey: {
      dev: "600652865c27f9b1dafa4edfe65da7c4f8b7c9c6099bf0c85da0151d91830a9a",
      production: "b6b2352ecb393c7f0709177f89168d9d4fef53282fb24a98c1c08d9adb7cdd86",
    },
    vkey: {
      dev: "c3cb613d88398a55329dfd9f2e4c322ee6e5897689e970911f23890c78e2e63d",
      production: "2ade74728fa4a5461a170384dae26f617af40a763175742ecd1576dcafeab299",
    },
  },
};

export const PINNED_PROOF_SHA256 = PROOF_SHA256;

function filesFor(circuit: Circuit, ceremony: CeremonyKind): { wasm: string; zkey: string; sha256: { wasm: string; zkey: string } } {
  if (circuit === "funds" || circuit === "receipt") {
    const pin = PROOF_SHA256[circuit];
    return {
      wasm: `${circuit}.wasm`,
      zkey: ceremony === "production" ? `final/${circuit}_final.zkey` : `${circuit}_final.zkey`,
      sha256: { wasm: pin.wasm, zkey: pin.zkey[ceremony] },
    };
  }
  return circuitArtifactFiles(circuit, ceremony);
}

const sha256 = (path: string) => createHash("sha256").update(readFileSync(path)).digest("hex");

export interface ArtifactSource {
  /** A folder laid out like gloam.trade/circuits (for example a Gloam checkout's app/public/circuits). Read first. */
  dir?: string;
  /** Where downloads are kept. Default ~/.gloam/circuits. */
  cacheDir?: string;
  /** Where to download from. Default https://www.gloam.trade/circuits. */
  url?: string;
  /** Custom fetch (tests). */
  fetch?: typeof fetch;
}

export class Artifacts {
  private readonly checked = new Map<string, string>();

  constructor(private readonly src: ArtifactSource = {}) {}

  private async ensure(file: string, expected: string): Promise<string> {
    const hit = this.checked.get(file);
    if (hit) return hit;
    if (this.src.dir) {
      const local = join(this.src.dir, file);
      if (existsSync(local) && sha256(local) === expected) {
        this.checked.set(file, local);
        return local;
      }
    }
    const cache = this.src.cacheDir ?? join(homedir(), ".gloam", "circuits");
    const url = (this.src.url ?? GLOAM_ARTIFACTS_URL).replace(/\/+$/, "");
    const dest = join(cache, file);
    mkdirSync(dirname(dest), { recursive: true });
    for (let attempt = 0; attempt < 2; attempt++) {
      if (!existsSync(dest) || statSync(dest).size === 0) {
        const res = await (this.src.fetch ?? fetch)(`${url}/${file}`);
        if (!res.ok) throw new Error(`Could not download ${file} from ${url}: HTTP ${res.status}.`);
        writeFileSync(dest, Buffer.from(await res.arrayBuffer()));
      }
      if (sha256(dest) === expected) {
        this.checked.set(file, dest);
        return dest;
      }
      rmSync(dest, { force: true });
    }
    throw new Error(`${file} does not match its pinned SHA-256. Refusing to prove with it.`);
  }

  /** Local wasm and zkey paths for a circuit and key set, checked. */
  async paths(circuit: Circuit, ceremony: CeremonyKind): Promise<{ wasm: string; zkey: string }> {
    const f = filesFor(circuit, ceremony);
    const [wasm, zkey] = await Promise.all([this.ensure(f.wasm, f.sha256.wasm), this.ensure(f.zkey, f.sha256.zkey)]);
    return { wasm, zkey };
  }
}

const VKEY_DIR = join(dirname(fileURLToPath(import.meta.url)), "vkeys");
const vkeyCache = new Map<string, unknown>();

/** The checking key for funds or receipt proofs of a key set, from this package, hash-checked. */
export function verificationKey(circuit: ProofCircuit, ceremony: CeremonyKind): unknown {
  const id = `${ceremony}:${circuit}`;
  const cached = vkeyCache.get(id);
  if (cached) return cached;
  const path = join(VKEY_DIR, ceremony === "production" ? "final" : "dev", `${circuit}_vkey.json`);
  const bytes = readFileSync(path);
  const got = createHash("sha256").update(bytes).digest("hex");
  if (got !== PROOF_SHA256[circuit].vkey[ceremony]) throw new Error(`The ${circuit} checking key in this package does not match its pinned SHA-256.`);
  const vkey: unknown = JSON.parse(bytes.toString("utf8"));
  vkeyCache.set(id, vkey);
  return vkey;
}

/**
 * snarkjs keeps worker threads for the bn128 curve after a proof, which keeps a
 * process alive. A long-running agent can ignore this; a script or test calls
 * it when it is done proving so the process can exit.
 */
export async function shutdownProver(): Promise<void> {
  const curve = (globalThis as { curve_bn128?: { terminate?: () => unknown } }).curve_bn128;
  await curve?.terminate?.();
}
