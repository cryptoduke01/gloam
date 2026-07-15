/**
 * First-run product checklist (browser-local).
 */

const KEY = "gloam.onboarding.v1";

export type OnboardingState = {
  dismissed: boolean;
  /** Optional step ids marked done by the user */
  done: string[];
};

const DEFAULT: OnboardingState = { dismissed: false, done: [] };

export function loadOnboarding(): OnboardingState {
  if (typeof window === "undefined") return DEFAULT;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULT };
    const parsed = JSON.parse(raw) as Partial<OnboardingState>;
    return {
      dismissed: Boolean(parsed.dismissed),
      done: Array.isArray(parsed.done) ? parsed.done.map(String) : [],
    };
  } catch {
    return { ...DEFAULT };
  }
}

export function saveOnboarding(state: OnboardingState) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* quota */
  }
}

export function dismissOnboarding() {
  const cur = loadOnboarding();
  saveOnboarding({ ...cur, dismissed: true });
}

export function resetOnboarding() {
  saveOnboarding({ dismissed: false, done: [] });
}

export function markOnboardingStep(id: string) {
  const cur = loadOnboarding();
  if (cur.done.includes(id)) return;
  saveOnboarding({ ...cur, done: [...cur.done, id] });
}

export const ONBOARDING_STEPS = [
  {
    id: "faucet",
    title: "Get testnet ETH",
    body: "Claim free gas from the Robinhood faucet.",
    href: "external:faucet",
  },
  {
    id: "shield",
    title: "Shield a small amount",
    body: "Deposit into the vault so the bag leaves your open wallet.",
    href: "/app/shield",
  },
  {
    id: "move",
    title: "Private pay (direct or ticket)",
    body: "Copy your receive tag, or pay to someone else's tag / bearer ticket.",
    href: "/app/move",
  },
  {
    id: "backup",
    title: "Back up vault notes",
    body: "Export (preferably locked) so clearing the browser does not lose secrets.",
    href: "/app/settings",
  },
] as const;
