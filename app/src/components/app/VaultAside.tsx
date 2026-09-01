/**
 * Context rail for the Vault hub. Turns the lonely centered form into a real
 * two-column workspace: the action on the left, a plain-language "how it works"
 * plus the sealed-by-default reassurance on the right. Content is tailored to the
 * active tab so it reads as guidance, not filler.
 */
type VaultTab = "shield" | "trade" | "send" | "move";

const GUIDE: Record<
  VaultTab,
  { title: string; lead: string; steps: [string, string, string] }
> = {
  shield: {
    title: "Shielding",
    lead: "Move value into your private balance.",
    steps: [
      "Pick an asset and an amount to deposit.",
      "A private note is created that only you hold.",
      "Your balance leaves the public ledger.",
    ],
  },
  trade: {
    title: "Private trade",
    lead: "Trade without broadcasting your size.",
    steps: [
      "Choose the pair and the amount.",
      "The swap settles against the sealed pool.",
      "Your size never touches the public book.",
    ],
  },
  send: {
    title: "Private send",
    lead: "Pay anyone without revealing the flow.",
    steps: [
      "Enter a recipient and an amount.",
      "A private ticket is created for them.",
      "They claim it, and the world sees nothing.",
    ],
  },
  move: {
    title: "Cash out",
    lead: "Return value to your public wallet.",
    steps: [
      "Choose how much to withdraw.",
      "Ownership is proven privately.",
      "Funds arrive in your public wallet.",
    ],
  },
};

export function VaultAside({ tab }: { tab: VaultTab }) {
  const g = GUIDE[tab];
  return (
    <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
      <div className="rounded-2xl border border-line bg-panel p-5 sm:p-6">
        <span className="text-[10px] uppercase tracking-[0.16em] text-mute">
          How it works
        </span>
        <h3 className="mt-2 font-display text-lg tracking-tight text-foreground">
          {g.title}
        </h3>
        <p className="mt-1 text-sm text-mute">{g.lead}</p>
        <ol className="mt-5 space-y-4">
          {g.steps.map((s, i) => (
            <li key={i} className="flex gap-3">
              <span className="tnum mt-0.5 flex h-6 w-6 flex-none items-center justify-center rounded-full bg-lime/12 text-[11px] font-semibold text-lime">
                {i + 1}
              </span>
              <span className="text-sm leading-relaxed text-foreground/80">
                {s}
              </span>
            </li>
          ))}
        </ol>
      </div>

      <div className="rounded-2xl border border-line p-5 sm:p-6">
        <div className="flex items-center gap-2">
          <span className="livedot h-2 w-2 rounded-full bg-lime" aria-hidden />
          <span className="text-[10px] uppercase tracking-[0.16em] text-mute">
            Sealed by default
          </span>
        </div>
        <p className="mt-2 text-sm leading-relaxed text-mute">
          Balances and amounts stay private until you choose to reveal. Testnet,
          dev proving keys.
        </p>
        <a
          href="/docs"
          className="mt-3 inline-block text-sm font-medium text-lime hover:underline"
        >
          How privacy works
        </a>
      </div>
    </aside>
  );
}
