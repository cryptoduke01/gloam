/**
 * Gloam relay, browser side. See lib/relay/server.ts for what the relay will
 * and will not do. Everything here degrades to "send from your wallet".
 */
import type { Address, Hex } from "viem";
import { getRhPublicClient } from "@/lib/rhClient";

export type RelayNetworkStatus = {
  chainId: number;
  key: string;
  enabled: boolean;
  relayer: Address | null;
  memo: boolean;
  lowBalance: boolean;
};

const PREF_KEY = "gloam.relay.pref";
let statusCache: { at: number; networks: RelayNetworkStatus[] } | null = null;

/** Relay availability per network (cached for a minute). */
export async function fetchRelayStatus(force = false): Promise<RelayNetworkStatus[]> {
  if (!force && statusCache && Date.now() - statusCache.at < 60_000) return statusCache.networks;
  try {
    const res = await fetch("/api/relay", { cache: "no-store" });
    const json = (await res.json()) as { ok?: boolean; networks?: RelayNetworkStatus[] };
    const networks = json.ok && Array.isArray(json.networks) ? json.networks : [];
    statusCache = { at: Date.now(), networks };
    return networks;
  } catch {
    return [];
  }
}

export async function relayFor(chainId: number): Promise<RelayNetworkStatus | null> {
  const all = await fetchRelayStatus();
  return all.find((n) => n.chainId === chainId) ?? null;
}

/** User preference: hide my wallet by relaying (default on). */
export function relayPreferred(): boolean {
  try {
    return window.localStorage.getItem(PREF_KEY) !== "off";
  } catch {
    return true;
  }
}

export function setRelayPreferred(on: boolean) {
  try {
    window.localStorage.setItem(PREF_KEY, on ? "on" : "off");
  } catch {
    /* ignore */
  }
}

export class RelaySubmitError extends Error {
  constructor(
    message: string,
    public code: string
  ) {
    super(message);
  }
}

async function post(body: Record<string, unknown>): Promise<Hex> {
  let res: Response;
  try {
    res = await fetch("/api/relay", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body, (_k, v) => (typeof v === "bigint" ? v.toString() : v)),
    });
  } catch {
    throw new RelaySubmitError("Could not reach the relay. Check your connection.", "network");
  }
  const json = (await res.json().catch(() => ({}))) as { ok?: boolean; hash?: Hex; error?: string; code?: string };
  if (!res.ok || !json.ok || !json.hash) {
    throw new RelaySubmitError(json.error ?? "The relay could not submit this payment.", json.code ?? "error");
  }
  return json.hash;
}

export function relayTransfer(p: {
  chainId: number;
  proof: Hex;
  root: Hex;
  nullifier: Hex;
  commitments: readonly [Hex, Hex];
}): Promise<Hex> {
  return post({ action: "transfer", ...p });
}

export function relayUnshield(p: {
  chainId: number;
  proof: Hex;
  root: Hex;
  nullifier: Hex;
  asset: Address;
  to: Address;
  amount: bigint;
}): Promise<Hex> {
  return post({ action: "unshield", ...p });
}

export function relayMemo(p: { chainId: number; paymentCommitment: Hex; memo: Hex }): Promise<Hex> {
  return post({ action: "memo", ...p });
}

/** Wait for a relayed tx on the active network. */
export async function waitForTx(hash: Hex, timeoutMs = 120_000): Promise<"success" | "reverted"> {
  const receipt = await getRhPublicClient().waitForTransactionReceipt({ hash, timeout: timeoutMs, pollingInterval: 1_000 });
  return receipt.status === "success" ? "success" : "reverted";
}
