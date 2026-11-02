/**
 * What a server log keeps of a thrown error. A viem error's message holds the
 * request: the RPC URL with its key, and the calldata with a nullifier, a
 * recipient or an amount. Beside the request's IP, that ties a person to a
 * payment, so a log gets the error's name and viem's one-line summary.
 */
export function logSafe(e: unknown): string {
  if (!(e instanceof Error)) return "unknown";
  const short = (e as { shortMessage?: unknown }).shortMessage;
  return typeof short === "string" ? `${e.name}: ${short}` : e.name;
}
