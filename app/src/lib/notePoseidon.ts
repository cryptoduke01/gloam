/**
 * Poseidon note scheme. Now sourced from @gloam/sdk (the shared private-path
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
} from "@gloam/sdk";
export type { BoundNote } from "@gloam/sdk";
