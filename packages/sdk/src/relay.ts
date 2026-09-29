/**
 * Gloam relay client.
 *
 * Sends an already-proven private send or cash out through the Gloam relay,
 * so the sender's wallet (a person's or an agent's) never appears next to the
 * payment on a block explorer. The proof is the authorization and the cash-out
 * recipient is bound inside the proof, so a relay can only submit or refuse,
 * never redirect money. Deposits (shield) still come from the depositor's own
 * wallet, since that is where the money starts.
 */
import type { Address, Hex } from "viem";
import type { GloamIntent } from "./intents.js";

export const GLOAM_RELAY_URL = "https://gloam.trade/api/relay";

export interface RelayOptions {
  /** Relay endpoint; defaults to the hosted Gloam relay. */
  url?: string;
  /** Custom fetch (tests, edge runtimes). */
  fetch?: typeof fetch;
}

export interface RelayNetworkStatus {
  chainId: number;
  key: string;
  enabled: boolean;
  relayer: Address | null;
  memo: boolean;
  lowBalance: boolean;
}

export class GloamRelayError extends Error {
  constructor(
    message: string,
    public readonly code: string
  ) {
    super(message);
    this.name = "GloamRelayError";
  }
}

async function post(body: Record<string, unknown>, opts: RelayOptions = {}): Promise<Hex> {
  const f = opts.fetch ?? fetch;
  const res = await f(opts.url ?? GLOAM_RELAY_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body, (_k, v) => (typeof v === "bigint" ? v.toString() : v)),
  });
  const json = (await res.json().catch(() => ({}))) as { ok?: boolean; hash?: Hex; error?: string; code?: string };
  if (!res.ok || !json.ok || !json.hash) {
    throw new GloamRelayError(json.error ?? `Relay error (${res.status})`, json.code ?? "error");
  }
  return json.hash;
}

/** Which networks the relay can submit on right now. */
export async function relayStatus(opts: RelayOptions = {}): Promise<RelayNetworkStatus[]> {
  const f = opts.fetch ?? fetch;
  const res = await f(opts.url ?? GLOAM_RELAY_URL, { method: "GET" });
  const json = (await res.json().catch(() => ({}))) as { networks?: RelayNetworkStatus[] };
  return Array.isArray(json.networks) ? json.networks : [];
}

/**
 * Submit a built private_send or unshield intent (from the SDK builders or
 * buildGloamPayment) through the relay. Returns the transaction hash.
 */
export async function relayIntent(intent: GloamIntent, opts: RelayOptions = {}): Promise<Hex> {
  const exec = intent.exec;
  if (!exec) throw new GloamRelayError("This intent has no resolved call to relay.", "no_exec");
  const a = exec.args;
  if (exec.fn === "transfer") {
    const [proof, root, nullifier, commitments] = a as readonly [Hex, Hex, Hex, readonly [Hex, Hex]];
    return post({ action: "transfer", chainId: intent.chainId, proof, root, nullifier, commitments }, opts);
  }
  if (exec.fn === "unshield") {
    const [proof, root, nullifier, asset, to, amount] = a as readonly [Hex, Hex, Hex, Address, Address, bigint];
    return post({ action: "unshield", chainId: intent.chainId, proof, root, nullifier, asset, to, amount }, opts);
  }
  throw new GloamRelayError(
    `Only private sends and cash outs can be relayed (got ${exec.fn}). Deposits come from your own wallet.`,
    "unsupported"
  );
}

/**
 * Post an encrypted payment message for a payment that already landed, so the
 * recipient finds it with their Gloam address. `memo` is the ticket bytes.
 */
export async function relayMemo(
  args: { chainId: number; paymentCommitment: Hex; memo: Hex },
  opts: RelayOptions = {}
): Promise<Hex> {
  return post({ action: "memo", ...args }, opts);
}
