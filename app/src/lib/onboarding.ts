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
    title: "Get test funds",
    body: "Claim free test funds to try everything. It's play money, not real.",
    href: "external:faucet",
  },
  {
    id: "shield",
    title: "Add money privately",
    body: "Move some into your private vault. The amount stops showing on your public wallet.",
    href: "/app/shield",
  },
  {
    id: "move",
    title: "Send a private payment",
    body: "Pay someone privately, or share a link they can claim. Amounts stay hidden.",
    href: "/app/move",
  },
  {
    id: "disclose",
    title: "Prove what you hold",
    body: "Show someone you hold a balance, without revealing anything else.",
    href: "/app/disclose",
  },
  {
    id: "backup",
    title: "Back up your account",
    body: "Save a backup so clearing your browser never loses your private balance.",
    href: "/app/settings",
  },
] as const;
