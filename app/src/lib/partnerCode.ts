/**
 * The shape of a partner link code (lib/partnerLinks issues them): 20 letters
 * and digits, carried as `p=<code>` in a pay link's or swap link's fragment.
 * Shared by the app and the server; the shape says nothing about whether a code
 * is live, which only the server knows.
 *
 * linkNullifierHash names one spend without revealing it: the app registers it
 * with the code before a wallet sends (lib/partnerAttribution), and the server
 * finds it again from the nullifier the transaction makes public.
 */
import { encodePacked, keccak256, type Hex } from "viem";

export const LINK_CODE_LENGTH = 20;
const CODE_RE = new RegExp(`^[A-Za-z0-9]{${LINK_CODE_LENGTH}}$`);

export function isLinkCodeShape(raw: unknown): raw is string {
  return typeof raw === "string" && CODE_RE.test(raw);
}

/** The code in a link's `p`, or null when there is none or it is not a code's shape. */
export function readLinkCode(params: { get(name: string): string | null }): string | null {
  const raw = params.get("p");
  return isLinkCodeShape(raw) ? raw : null;
}

/** The hash a spend is registered under: keccak256("gloam-partner-link-v1" ‖ nullifier). */
export function linkNullifierHash(nullifier: Hex): Hex {
  return keccak256(encodePacked(["string", "bytes32"], ["gloam-partner-link-v1", nullifier]));
}

export function isBytes32(raw: unknown): raw is Hex {
  return typeof raw === "string" && /^0x[0-9a-fA-F]{64}$/.test(raw);
}
