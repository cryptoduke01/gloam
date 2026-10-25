/**
 * The Portfolio's private balance headline, worked out apart from the page so
 * it can be checked: dollars where every asset has a price, and the amounts of
 * those that don't next to them ("$100 + 1,000 GLOAM"), never "2 assets" for a
 * vault that is mostly priced, and never a silent $0 for one that isn't.
 */
export function privateHeadline(args: {
  showUsd: boolean;
  /** The priced part, in dollars. */
  sealedUsd: number;
  /** "1,000 GLOAM" for each asset held with no dollar price, largest first. */
  unpriced: string[];
  /** The vault as amounts ("500 USDC", "2 assets"), shown when dollars are off. */
  vaultValue: string;
  formatUsd: (n: number) => string;
}): string {
  const { showUsd, sealedUsd, unpriced, vaultValue, formatUsd } = args;
  if (!showUsd) return vaultValue;
  if (!unpriced.length) return formatUsd(sealedUsd);
  return [
    ...(sealedUsd > 0 ? [formatUsd(sealedUsd)] : []),
    ...unpriced.slice(0, 2),
    ...(unpriced.length > 2 ? [`${unpriced.length - 2} more`] : []),
  ].join(" + ");
}
