/**
 * Poseidon incremental Merkle tree. Now sourced from @gloam/sdk. Re-exported
 * here so existing app imports keep working. See packages/sdk/src/merkle.ts.
 */
export {
  MERKLE_DEPTH,
  IncrementalMerkleTreePoseidon,
  pathToCircomInput,
} from "@gloam/sdk";
export type { PoseidonMerklePath } from "@gloam/sdk";
