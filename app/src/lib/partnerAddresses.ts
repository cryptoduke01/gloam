/**
 * A partner's own receiving addresses, per mainnet, set by a Gloam admin only.
 * The on-chain match (lib/partnerBackfill) counts a past cash out to the
 * partner when it paid one of these. Server only.
 *
 * Only the partner's own addresses are kept, as the partner gave them. Nothing
 * about who sent money to them. An address belongs to one partner at most, so a
 * cash out can never be matched to two.
 *
 * Storage (lib/partnersKv), under gloam:partners:v1:
 *   addrs:<partnerId>                 { [chainId]: lowercase addresses } (JSON)
 *   addr-owner:<chainId>:<address>    partner id
 */
import { getAddress, isAddress, zeroAddress } from "viem";
import { jsonOf, k, kv, kv1, type KvCommand } from "./partnersKv";
import { getPartner, listPartners, PartnerError } from "./partners";
import { getNetwork, NETWORK_KEYS, networkName, type GloamNetwork } from "./networks";

/** Addresses one partner can list on one chain, and in all. */
export const MAX_ADDRESSES_PER_CHAIN = 2_000;
export const MAX_ADDRESSES_TOTAL = 5_000;

export type AddressList = Record<string, string[]>;

/** The mainnets with a vault: the only chains an address list is for. */
export function addressChains(): GloamNetwork[] {
  return NETWORK_KEYS.map(getNetwork).filter((n) => !n.testnet && n.pool && n.deployBlock != null);
}

/**
 * "robinhood-mainnet", "4663", "Robinhood Chain", "Tempo", "Base", "Ethereum": the
 * mainnet meant, by its key, chain id or name, or null. "robinhood" is the
 * testnet's key, not a mainnet's name, so it is refused rather than guessed.
 */
export function chainFromCell(raw: string): GloamNetwork | null {
  const v = raw.trim().toLowerCase().replace(/\s+/g, " ");
  if (!v) return null;
  const chains = addressChains();
  return (
    chains.find(
      (n) =>
        n.key === v ||
        String(n.chainId) === v ||
        networkName(n).toLowerCase() === v ||
        n.label.toLowerCase() === v
    ) ?? null
  );
}

export type ParsedAddresses = {
  entries: { chainId: number; address: string }[];
  /** Line number (from 1) and why it was left out. */
  rejected: { line: number; text: string; reason: string }[];
};

/**
 * Reads pasted text or a CSV: one address per line, as `address`, or
 * `chain,address` (or `address,chain`), commas, semicolons, tabs or spaces
 * between. A line naming no chain is for `fallbackChainId`. A header line, an
 * empty line and a # comment are skipped. Duplicates count once.
 */
export function parseAddressList(text: string, fallbackChainId: number | null): ParsedAddresses {
  const entries: ParsedAddresses["entries"] = [];
  const rejected: ParsedAddresses["rejected"] = [];
  const seen = new Set<string>();
  const lines = text.replace(/^﻿/, "").split(/\r?\n/);
  lines.forEach((rawLine, i) => {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) return;
    const cells = line
      .split(/[,;\t]|\s{2,}|\s(?=0x)/i)
      .map((c) => c.trim().replace(/^"|"$/g, "").trim())
      .filter(Boolean);
    const addrCells = cells.filter((c) => /^0x[0-9a-fA-F]{40}$/.test(c));
    const others = cells.filter((c) => !/^0x[0-9a-fA-F]{40}$/.test(c));
    if (addrCells.length === 0) {
      // a header ("chain,address") or anything with no address in it
      if (!/^(chain|network|address|wallet)/i.test(line)) rejected.push({ line: i + 1, text: line.slice(0, 80), reason: "No 0x address on this line." });
      return;
    }
    if (addrCells.length > 1) {
      rejected.push({ line: i + 1, text: line.slice(0, 80), reason: "More than one address on this line." });
      return;
    }
    const raw = addrCells[0]!;
    if (!isAddress(raw, { strict: false }) || raw.toLowerCase() === zeroAddress) {
      rejected.push({ line: i + 1, text: line.slice(0, 80), reason: "Not a valid address." });
      return;
    }
    // a mixed-case address must carry a correct checksum: a typo in one is caught here
    if (raw !== raw.toLowerCase() && raw !== raw.toUpperCase().replace(/^0X/, "0x") && getAddress(raw) !== raw) {
      rejected.push({ line: i + 1, text: line.slice(0, 80), reason: "The address's checksum is wrong. Check it for a typo." });
      return;
    }
    let chainId = fallbackChainId;
    if (others.length) {
      const named = chainFromCell(others[0]!);
      if (!named) {
        rejected.push({ line: i + 1, text: line.slice(0, 80), reason: `"${others[0]!.slice(0, 30)}" is not a mainnet Gloam runs on.` });
        return;
      }
      chainId = named.chainId;
    }
    if (chainId == null || !addressChains().some((n) => n.chainId === chainId)) {
      rejected.push({ line: i + 1, text: line.slice(0, 80), reason: "No chain for this address. Pick one, or name it on the line." });
      return;
    }
    const key = `${chainId}:${raw.toLowerCase()}`;
    if (seen.has(key)) return;
    seen.add(key);
    entries.push({ chainId, address: raw.toLowerCase() });
  });
  return { entries, rejected };
}

export async function getPartnerAddresses(partnerId: string): Promise<AddressList> {
  return jsonOf<AddressList>(await kv1(["GET", k("addrs", partnerId)])) ?? {};
}

export function countAddresses(list: AddressList): number {
  return Object.values(list).reduce((s, a) => s + a.length, 0);
}

/**
 * Replaces a partner's list. Refuses (and changes nothing) when an address is
 * already another partner's, or when the list is over the limits. An empty list
 * clears it.
 */
export async function setPartnerAddresses(partnerId: string, entries: ParsedAddresses["entries"]): Promise<AddressList> {
  if (!(await getPartner(partnerId))) throw new PartnerError("No partner with that id.", 404, "not_found");
  const next: AddressList = {};
  for (const e of entries) (next[String(e.chainId)] ??= []).push(e.address.toLowerCase());
  for (const [chain, list] of Object.entries(next)) {
    next[chain] = [...new Set(list)].sort();
    if (next[chain]!.length > MAX_ADDRESSES_PER_CHAIN) {
      throw new PartnerError(`At most ${MAX_ADDRESSES_PER_CHAIN} addresses per chain.`, 400, "too_many_addresses");
    }
  }
  if (countAddresses(next) > MAX_ADDRESSES_TOTAL) throw new PartnerError(`At most ${MAX_ADDRESSES_TOTAL} addresses in all.`, 400, "too_many_addresses");

  const flat = Object.entries(next).flatMap(([chain, list]) => list.map((a) => [chain, a] as const));
  // whose each address is now: another partner's address is refused before anything is written
  const owners = flat.length ? await kv(flat.map(([chain, a]) => ["GET", k("addr-owner", chain, a)] as KvCommand)) : [];
  const clash = flat.filter((_, i) => typeof owners[i] === "string" && owners[i] !== partnerId);
  if (clash.length) {
    const [chain, a] = clash[0]!;
    throw new PartnerError(
      `${getAddress(a)} on ${networkName(addressChains().find((n) => String(n.chainId) === chain)!)} is already another partner's${clash.length > 1 ? `, and ${clash.length - 1} more` : ""}. An address can belong to one partner.`,
      409,
      "address_taken"
    );
  }

  const prev = await getPartnerAddresses(partnerId);
  const keep = new Set(flat.map(([chain, a]) => `${chain}:${a}`));
  const cmds: KvCommand[] = [];
  for (const [chain, list] of Object.entries(prev)) {
    for (const a of list) if (!keep.has(`${chain}:${a}`)) cmds.push(["DEL", k("addr-owner", chain, a)]);
  }
  for (const [chain, a] of flat) cmds.push(["SET", k("addr-owner", chain, a), partnerId]);
  cmds.push(flat.length ? ["SET", k("addrs", partnerId), JSON.stringify(next)] : ["DEL", k("addrs", partnerId)]);
  await kv(cmds);
  return next;
}

/** Every partner's addresses: chainId to (lowercase address to partner id). For the on-chain match. */
export async function addressBook(): Promise<Map<number, Map<string, string>>> {
  const partners = await listPartners();
  const book = new Map<number, Map<string, string>>();
  if (!partners.length) return book;
  const lists = await kv(partners.map((p) => ["GET", k("addrs", p.id)] as KvCommand));
  partners.forEach((p, i) => {
    const list = jsonOf<AddressList>(lists[i]) ?? {};
    for (const [chain, addrs] of Object.entries(list)) {
      const m = book.get(Number(chain)) ?? new Map<string, string>();
      for (const a of addrs) if (!m.has(a)) m.set(a.toLowerCase(), p.id);
      book.set(Number(chain), m);
    }
  });
  return book;
}
