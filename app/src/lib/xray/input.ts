/**
 * What the Wallet X-ray accepts: a 0x address or an ENS name, nothing else.
 * Pure, and small enough for the browser, so the form and the server apply the
 * same rule. A mixed-case address must carry a valid checksum: a typo should
 * come back as a typo, not as a read of somebody else's empty wallet.
 *
 * ENS is plain ASCII .eth names only. Anything fancier is refused here rather
 * than sent to a resolver.
 */
import { getAddress, isAddress, type Address } from "viem";

export type XrayQuery = { kind: "address"; address: Address } | { kind: "ens"; name: string } | { kind: "invalid" };

const HEX_ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const ENS_NAME = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+eth$/;
const MAX_ENS_LENGTH = 100;

export function parseXrayQuery(raw: unknown): XrayQuery {
  if (typeof raw !== "string") return { kind: "invalid" };
  const q = raw.trim();
  if (HEX_ADDRESS.test(q)) {
    return isAddress(q) ? { kind: "address", address: getAddress(q) } : { kind: "invalid" };
  }
  const name = q.toLowerCase();
  if (name.length <= MAX_ENS_LENGTH && ENS_NAME.test(name)) return { kind: "ens", name };
  return { kind: "invalid" };
}

/** 0x76b7…D4D8 */
export function shortAddress(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}
