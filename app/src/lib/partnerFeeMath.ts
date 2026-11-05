/**
 * The partner interface fee, as math. Browser and server safe (no storage, no RPC).
 *
 * A partner sets a fee (lib/partners PartnerFees): a flat amount per private
 * payment, a share of each cash out or deposit. The USER pays it, on top of the
 * payment, as one extra private payment (a vault transfer, which is free) to the
 * partner's Gloam address (gloamr1.…) on that network, in the same token, before
 * the main action. It is added by the client: the Gloam app for a flow opened from
 * a partner's link, the partner's own app (with the SDK) for a flow sent with its
 * API key. The vault does not know about it and does not enforce it, the same way
 * a front end's own fee works. Private swaps carry no fee for now.
 */
import type { Address } from "viem";
import { isValidReceiveTag } from "./receiveTag";
import { isDollarStable, shieldTokensFor } from "./tokens";
import type { GloamNetwork } from "./networks";

export type FeeKind = "private_payment" | "cash_out" | "deposit";
export const FEE_KINDS: FeeKind[] = ["private_payment", "cash_out", "deposit"];

/** The setting, as stored (lib/partners PartnerFees). */
export type FeeSetting = { privatePaymentCents: number; cashoutBps: number; depositBps: number };

/** What a flat fee or a share is worked out in. */
export type FeeAsset = { decimals: number; /** a dollar stablecoin: $1 a token */ stable: boolean };

/**
 * The fee on one payment, in the payment's token (base units), or 0 when there is
 * none. Rounds down. A flat fee per private payment is in US cents, so it applies
 * to dollar stablecoins only: on any other token a private payment carries no fee
 * (Gloam can't price it without a price feed the user would have to trust).
 */
export function feeDue(kind: FeeKind | "private_swap", fees: FeeSetting, asset: FeeAsset, amount: bigint): bigint {
  if (kind === "private_swap") return 0n;
  if (kind === "private_payment") {
    if (!asset.stable || fees.privatePaymentCents <= 0) return 0n;
    return (BigInt(fees.privatePaymentCents) * 10n ** BigInt(asset.decimals)) / 100n;
  }
  const bps = kind === "cash_out" ? fees.cashoutBps : fees.depositBps;
  if (bps <= 0 || amount <= 0n) return 0n;
  return (amount * BigInt(bps)) / 10_000n;
}

/** How a token is priced for a fee: its decimals, and whether it is a dollar stablecoin. The native coin: 18, not stable. */
export function feeAssetOf(chainId: number, asset: string): FeeAsset {
  const a = asset.toLowerCase();
  if (a === "0x0000000000000000000000000000000000000000") return { decimals: 18, stable: false };
  const t = shieldTokensFor(chainId).find((x) => x.address.toLowerCase() === a);
  return t ? { decimals: t.decimals, stable: isDollarStable(t) } : { decimals: 18, stable: false };
}

/** "$0.05 per private payment", "0.25% of each cash out". */
export function feeLabel(kind: FeeKind, fees: FeeSetting): string {
  if (kind === "private_payment") return `$${(fees.privatePaymentCents / 100).toFixed(2)} per private payment`;
  const bps = kind === "cash_out" ? fees.cashoutBps : fees.depositBps;
  return `${(bps / 100).toFixed(2)}% of each ${kind === "cash_out" ? "cash out" : "deposit"}`;
}

/** Where a partner's fees arrive, by chain ("robinhood", "tempo", "base", "ethereum") or network key. */
export type FeeAddresses = Partial<Record<string, string>>;

export const FEE_CHAINS = ["robinhood", "tempo", "base", "ethereum"] as const;

/** The partner's Gloam address for fees on a network, or null. */
export function feeAddressFor(feeTo: FeeAddresses | null | undefined, net: Pick<GloamNetwork, "key" | "family">): string | null {
  const t = feeTo?.[net.key] ?? feeTo?.[net.family] ?? null;
  return t && isValidReceiveTag(t) ? t.trim() : null;
}

/** What the Gloam app needs about a link's partner to add its fee (POST /api/partners/link-code). */
export type LinkFeeTerms = {
  /** The name Gloam approved; a fee is only ever added for a partner with one. */
  name: string;
  fees: FeeSetting;
  feeTo: FeeAddresses;
};

/**
 * The fee the app adds to a flow from a partner's link, or null when there is
 * none: no approved name, no fee for this kind, no Gloam address for fees on this
 * network, or a fee that rounds to nothing.
 */
export function linkFee(
  terms: LinkFeeTerms | null | undefined,
  kind: FeeKind,
  net: Pick<GloamNetwork, "key" | "family">,
  asset: FeeAsset,
  amount: bigint
): { amount: bigint; to: string; name: string; label: string } | null {
  if (!terms?.name) return null;
  const to = feeAddressFor(terms.feeTo, net);
  if (!to) return null;
  const fee = feeDue(kind, terms.fees, asset, amount);
  if (fee <= 0n) return null;
  return { amount: fee, to, name: terms.name, label: feeLabel(kind, terms.fees) };
}

/** A reported fee, as the relay takes it with the fee's own transfer ({ partnerFee }). */
export type ReportedFee = { kind: FeeKind; asset: Address; amount: string; code?: string };
