/**
 * Poseidon incremental Merkle tree. Now sourced from @gloamtrade/sdk. Re-exported
 * here so existing app imports keep working. See packages/sdk/src/merkle.ts.
 */
export {
  MERKLE_DEPTH,
  IncrementalMerkleTreePoseidon,
  pathToCircomInput,
} from "@gloamtrade/sdk";
export type { PoseidonMerklePath } from "@gloamtrade/sdk";
