/**
 * Poseidon note scheme. Now sourced from @gloamtrade/sdk (the shared private-path
 * core). Re-exported here so existing app imports keep working unchanged.
 * See packages/sdk/src/note.ts.
 */
export {
  POSEIDON_PROOF_LAYOUT_VERSION,
  randomSecretField,
  noteCommitmentPoseidon,
  noteNullifierPoseidon,
  makeBoundNotePoseidon,
  openNotePoseidon,
} from "@gloamtrade/sdk";
export type { BoundNote } from "@gloamtrade/sdk";
