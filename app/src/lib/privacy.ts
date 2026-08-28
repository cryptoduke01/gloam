/**
 * Size-privacy policy. Now sourced from @gloam/sdk (the shared private-path
 * core). This file re-exports the SDK surface so existing app imports keep
 * working unchanged. See packages/sdk/src/privacy.ts.
 */
export {
  SIZE_PRIVACY_OUT_MIN,
  publicAmountOutMin,
  coarsenMarkUsd,
  SEALED_PRIVACY_FACTS,
} from "@gloam/sdk";
export type { SizePrivacyMode } from "@gloam/sdk";
