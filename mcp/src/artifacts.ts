/**
 * The shield prover runs server-side in node, which needs the circuit artifacts
 * as local file paths (snarkjs cannot prove from a URL in node). This downloads
 * shield.wasm + shield_final.zkey once into a cache dir and returns their paths.
 */
import { mkdirSync, existsSync, writeFileSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const SOURCE = process.env.GLOAM_ARTIFACTS_SOURCE || "https://www.gloam.trade/circuits";
const CACHE = process.env.GLOAM_ARTIFACTS_DIR || join(tmpdir(), "gloam-mcp-circuits");

async function ensure(file: string): Promise<string> {
  mkdirSync(CACHE, { recursive: true });
  const dest = join(CACHE, file);
  if (existsSync(dest) && statSync(dest).size > 0) return dest;
  const res = await fetch(`${SOURCE}/${file}`);
  if (!res.ok) throw new Error(`Failed to fetch ${file} from ${SOURCE}: HTTP ${res.status}`);
  writeFileSync(dest, Buffer.from(await res.arrayBuffer()));
  return dest;
}

/** Local paths to the shield circuit's wasm and zkey, downloading on first use. */
export async function shieldArtifacts(): Promise<{ wasm: string; zkey: string }> {
  const [wasm, zkey] = await Promise.all([
    ensure("shield.wasm"),
    ensure("shield_final.zkey"),
  ]);
  return { wasm, zkey };
}
