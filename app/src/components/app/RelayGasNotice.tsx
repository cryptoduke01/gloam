"use client";

import type { RelayNetworkStatus } from "@/lib/relay/client";
import { gasHighMessage } from "@/lib/relay/gasCeiling";

/**
 * Shown next to "Hide my wallet" while gas on this chain is over the relay's
 * ceiling (lib/relay/gasCeiling, Ethereum): the relay pays the gas, so it waits.
 * `later`: on Cash out, where a cash out for later still schedules and waits.
 */
export function RelayGasNotice({
  status,
  label,
  later = false,
}: {
  status: Pick<RelayNetworkStatus, "gasHigh" | "gasGwei" | "maxGasGwei"> | null;
  label: string;
  later?: boolean;
}) {
  if (!status?.gasHigh) return null;
  const levels =
    status.gasGwei && status.maxGasGwei
      ? `Gas is ${status.gasGwei} gwei now; the Gloam relay sends at ${status.maxGasGwei} gwei or less. `
      : "";
  return (
    <div role="status" className="rounded-[16px] bg-surface px-4 py-3.5 text-[13px] leading-relaxed text-soft">
      <p className="font-medium text-foreground">{gasHighMessage(label)}</p>
      <p className="mt-1">
        {levels}
        Sending through the relay waits until it comes down.
        {later ? " A cash out for later still schedules, and goes out once gas is back under the limit." : ""}
      </p>
    </div>
  );
}
