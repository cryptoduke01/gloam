/**
 * Which limits file the live provider reads: GLOAM_LIMITS_FILE when set, else
 * the example for its network (limits.example.json for Base Sepolia, which
 * names USDC; limits.robinhood-mainnet.example.json, which names USDG). Another
 * network has no example and needs GLOAM_LIMITS_FILE.
 */
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = join(dirname(fileURLToPath(import.meta.url)), "..");

export const EXAMPLE_LIMITS: Record<string, string> = {
  base: join(HERE, "limits.example.json"),
  "robinhood-mainnet": join(HERE, "limits.robinhood-mainnet.example.json"),
};

export function limitsFileFor(network: string, env: Record<string, string | undefined> = process.env): string {
  const set = env.GLOAM_LIMITS_FILE?.trim();
  if (set) return set;
  const example = EXAMPLE_LIMITS[network];
  if (!example) throw new Error(`Set GLOAM_LIMITS_FILE: there is no example limits file for ${network}.`);
  return example;
}
