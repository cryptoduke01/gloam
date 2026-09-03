/**
 * Sealed-swap rate math. Now sourced from @gloamtrade/sdk (the shared private-path
 * core). This file re-exports the SDK surface so existing app imports keep
 * working unchanged. See packages/sdk/src/rates.ts.
 */
export {
  SEALED_RATE_SCALE,
  marksToSealedRates,
  fallbackOneToOneRates,
  estimateSealedOut,
  exactSealedAmounts,
  formatSealedAmount,
} from "@gloamtrade/sdk";
export type { SealedRateQuote } from "@gloamtrade/sdk";
