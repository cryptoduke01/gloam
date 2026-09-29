"use client";

/** "Hide my wallet" switch for relayed submission. */
export function RelayToggle({
  available,
  on,
  onChange,
  compact = false,
}: {
  available: boolean;
  on: boolean;
  onChange: (v: boolean) => void;
  compact?: boolean;
}) {
  if (!available) {
    return (
      <p className={`text-[11px] leading-relaxed text-mute ${compact ? "" : "text-center"}`}>
        Your wallet will show as the sender. The relay that hides it is offline right now.
      </p>
    );
  }
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={() => onChange(!on)}
      className="group flex w-full items-start gap-3 rounded-xl border border-line px-4 py-3 text-left transition-colors hover:border-foreground/30 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground"
    >
      <span
        aria-hidden
        className={`relative mt-0.5 inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${
          on ? "bg-sealed" : "bg-foreground/15"
        }`}
      >
        <span
          className={`absolute h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${
            on ? "translate-x-[18px]" : "translate-x-0.5"
          }`}
        />
      </span>
      <span className="text-xs leading-relaxed text-mute">
        <span className="block text-sm font-medium text-foreground">Hide my wallet</span>
        {on
          ? "Gloam sends it for you, so your wallet never shows up next to it. Free on testnet."
          : "Off: your wallet will show as the sender of each payment."}
      </span>
    </button>
  );
}
