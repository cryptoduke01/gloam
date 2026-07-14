export const CONSENT_KEY = "gloam_cookie_consent";
export type ConsentValue = "all" | "essential";

export function getConsent(): ConsentValue | null {
  if (typeof window === "undefined") return null;
  try {
    const v = localStorage.getItem(CONSENT_KEY);
    if (v === "all" || v === "essential") return v;
    return null;
  } catch {
    return null;
  }
}

export function setConsent(value: ConsentValue): void {
  try {
    localStorage.setItem(CONSENT_KEY, value);
    window.dispatchEvent(
      new CustomEvent("gloam-consent", { detail: value })
    );
  } catch {
    /* private mode */
  }
}

/** Optional analytics only when user chose "all". */
export function analyticsAllowed(): boolean {
  return getConsent() === "all";
}
