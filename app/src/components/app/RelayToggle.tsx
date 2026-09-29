"use client";

/** "Hide my wallet" switch for relayed submission. */
export function RelayToggle({
  available,
  on,
  onChange,
}: {
  available: boolean;
  on: boolean;
  onChange: (v: boolean) => void;
}) {
  if (!available) {
    return (
      <p className="text-center text-[11px] text-mute">
        Your wallet will show as the sender. The relay that hides it is offline right now.
      </p>
    );
  }
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-line px-4 py-3 text-xs text-mute">
      <input
        type="checkbox"
        checked={on}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-4 w-4 accent-[var(--lime)]"
      />
      <span>
        <span className="block font-medium text-foreground">Hide my wallet</span>
        Gloam submits this for you, so your wallet never shows up next to it. Free on testnet.
      </span>
    </label>
  );
}
