/**
 * Poseidon helpers. Now sourced from @gloamtrade/sdk (the shared private-path core).
 * Re-exported here so existing app imports keep working unchanged.
 * See packages/sdk/src/poseidon.ts.
 */
export {
  getPoseidon,
  toField,
  poseidon2,
  poseidon3,
  fieldToHex,
  hexToField,
} from "@gloamtrade/sdk";
