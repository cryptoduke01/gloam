/**
 * Provers run server-side in node, which needs the circuit artifacts as local
 * file paths (snarkjs cannot prove from a URL in node). This downloads each
 * circuit's wasm + final zkey once into a cache dir and returns their paths.
 *
 * shield backs gloam_execute_shield. transfer backs the private send that
 * settles an x402 payment (gloam_pay_x402); unshield backs cash out. All three
 * come from the same source; only shield is fetched until a tool needs the rest.
 */
import { mkdirSync, existsSync, writeFileSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const SOURCE = process.env.GLOAM_ARTIFACTS_SOURCE || "https://www.gloam.trade/circuits";
const CACHE = process.env.GLOAM_ARTIFACTS_DIR || join(tmpdir(), "gloam-mcp-circuits");

export type CircuitName = "shield" | "transfer" | "unshield";

async function ensure(file: string): Promise<string> {
  mkdirSync(CACHE, { recursive: true });
  const dest = join(CACHE, file);
  if (existsSync(dest) && statSync(dest).size > 0) return dest;
  const res = await fetch(`${SOURCE}/${file}`);
  if (!res.ok) throw new Error(`Failed to fetch ${file} from ${SOURCE}: HTTP ${res.status}`);
  writeFileSync(dest, Buffer.from(await res.arrayBuffer()));
  return dest;
}

/** Local wasm + zkey paths for a circuit, downloading on first use. */
export async function circuitArtifacts(
  name: CircuitName
): Promise<{ wasm: string; zkey: string }> {
  const [wasm, zkey] = await Promise.all([
    ensure(`${name}.wasm`),
    ensure(`${name}_final.zkey`),
  ]);
  return { wasm, zkey };
}

/** Shield circuit artifacts (deposit proof). */
export function shieldArtifacts() {
  return circuitArtifacts("shield");
}

/** Transfer circuit artifacts (private send; settles an x402 payment). */
export function transferArtifacts() {
  return circuitArtifacts("transfer");
}

/** Unshield circuit artifacts (cash out). */
export function unshieldArtifacts() {
  return circuitArtifacts("unshield");
}
