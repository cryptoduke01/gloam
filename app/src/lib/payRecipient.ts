/**
 * What the Pay box's recipient field holds (components/app/MoveView).
 *
 * Pay makes a private note for a Gloam address (gloamr1.…). A plain 0x address
 * or an ENS name has no receive key, so it is not paid with a note: Pay hands
 * it to Cash out, which already sends from the private balance to any address.
 * This file only classifies the text; it moves no money and reads no chain.
 * Resolving a name is `resolveEnsName`, the one network call, kept separate so
 * the classifier stays pure.
 */
import { isAddress, type Address } from "viem";
import { normalize } from "viem/ens";
import { RECEIVE_TAG_PREFIX } from "./receiveTag";

export type PayRecipient =
  | { kind: "empty" }
  /** Starts like a Gloam address; whether it is a whole one is `isValidReceiveTag`'s call. */
  | { kind: "gloam" }
  /** A valid 0x address (a mixed-case one must have its checksum right). */
  | { kind: "address"; address: Address }
  /** 40 hex digits after 0x, mixed case, wrong checksum: probably a typo. */
  | { kind: "badAddress" }
  /** Looks like an ENS name; `name` is its normalized form, to resolve. */
  | { kind: "ens"; name: string }
  | { kind: "other" };

const HEX_ADDRESS = /^0x[0-9a-fA-F]{40}$/;

/**
 * A name worth looking up: no spaces, labels separated by dots, none empty,
 * the last one a real top-level label (letters, not a number like "1.5"), and
 * ENS normalization accepts it. Returns the normalized name, or null.
 */
export function ensCandidate(input: string): string | null {
  const text = input.trim();
  if (!text || /\s/.test(text) || !text.includes(".")) return null;
  const labels = text.split(".");
  if (labels.some((l) => l === "")) return null;
  const last = labels[labels.length - 1]!;
  if (last.length < 2 || /^\d+$/.test(last)) return null;
  try {
    return normalize(text);
  } catch {
    return null;
  }
}

/** Sort the recipient text into what Pay does with it. */
export function classifyPayRecipient(input: string): PayRecipient {
  const text = input.trim();
  if (!text) return { kind: "empty" };
  if (text.startsWith(RECEIVE_TAG_PREFIX)) return { kind: "gloam" };
  if (isAddress(text)) return { kind: "address", address: text as Address };
  if (HEX_ADDRESS.test(text)) return { kind: "badAddress" };
  const name = ensCandidate(text);
  if (name) return { kind: "ens", name };
  return { kind: "other" };
}

/** True when Pay would not make a note for this text: it goes to Cash out instead. */
export function isWalletRecipient(r: PayRecipient): boolean {
  return r.kind === "address" || r.kind === "ens";
}

/** The Cash out fields a Pay hand-off fills. Nothing else about Cash out changes. */
export type CashOutHandoff = {
  dest: "other";
  to: Address;
  /** The amount typed in Pay, only when it is a usable one for this balance; otherwise "" (the whole balance, Cash out's default). */
  amount: string;
};

/**
 * The state Cash out opens with when Pay hands a wallet over. The amount comes
 * along only when `amountOk` says it parses and fits the picked balance;
 * Cash out checks it again either way.
 */
export function cashOutHandoff(to: Address, typedAmount: string, amountOk: boolean): CashOutHandoff {
  const amount = typedAmount.trim();
  return { dest: "other", to, amount: amount && amountOk ? amount : "" };
}

/** A name's 0x address on Ethereum mainnet, or null (no such name, or the lookup failed). */
export type EnsReader = (name: string) => Promise<Address | null>;

/**
 * Look a name up and hand back its address, never throwing: a failed lookup is
 * the same as no address. `stale()` is asked after the wait so a slow answer
 * for text the user has since changed is dropped.
 */
export async function resolveEnsName(
  name: string,
  read: EnsReader,
  stale: () => boolean = () => false
): Promise<Address | null> {
  try {
    const found = await read(name);
    if (stale()) return null;
    return found && isAddress(found) ? found : null;
  } catch {
    return null;
  }
}
