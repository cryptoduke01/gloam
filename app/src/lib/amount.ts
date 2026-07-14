import { parseEther, parseUnits } from "viem";

/** Safe decimal → wei; rejects sci notation / garbage. */
export function safeParseEther(raw: string): bigint | null {
  const s = raw.trim();
  if (!s || !/^\d*\.?\d+$/.test(s)) return null;
  try {
    return parseEther(s);
  } catch {
    return null;
  }
}

export function safeParseUnits(raw: string, decimals = 18): bigint | null {
  const s = raw.trim();
  if (!s || !/^\d*\.?\d+$/.test(s)) return null;
  try {
    // clamp decimals to avoid "too many decimals"
    const [a, b = ""] = s.split(".");
    const clipped = b.length > decimals ? `${a}.${b.slice(0, decimals)}` : s;
    return parseUnits(clipped, decimals);
  } catch {
    return null;
  }
}

export function finiteNumber(raw: string): number | null {
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
}
