/**
 * The shape of a partner link code (lib/partnerLinks issues them): 20 letters
 * and digits, carried as `p=<code>` in a pay link's or swap link's fragment.
 * Shared by the app and the server; the shape says nothing about whether a code
 * is live, which only the server knows.
 */
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
