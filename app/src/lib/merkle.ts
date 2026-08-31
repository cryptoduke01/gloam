/**
 * Keccak incremental Merkle tree, must match
 * contracts/src/lib/IncrementalMerkleTree.sol (DEPTH = 20).
 *
 * hash(left, right) = keccak256(abi.encodePacked(left, right))
 */

import { encodePacked, keccak256, type Hex } from "viem";

export const MERKLE_DEPTH = 20;
export const MERKLE_MAX_LEAVES = 1 << MERKLE_DEPTH;

const ZERO = ("0x" + "00".repeat(32)) as Hex;

function hashLeftRight(left: Hex, right: Hex): Hex {
  return keccak256(encodePacked(["bytes32", "bytes32"], [left, right]));
}

/** Precompute zeros[i] = zero hash at level i (same as Solidity initialize). */
export function buildZeros(): Hex[] {
  const zeros: Hex[] = new Array(MERKLE_DEPTH);
  let z: Hex = ZERO;
  for (let i = 0; i < MERKLE_DEPTH; i++) {
    zeros[i] = z;
    z = hashLeftRight(z, z);
  }
  return zeros;
}

/** Empty-tree root after initialize() */
export function emptyRoot(): Hex {
  let z: Hex = ZERO;
  for (let i = 0; i < MERKLE_DEPTH; i++) {
    z = hashLeftRight(z, z);
  }
  return z;
}

export type MerklePath = {
  leafIndex: number;
  leaf: Hex;
  pathElements: Hex[];
  /** 0 = current node is left child; 1 = right child */
  pathIndices: number[];
  root: Hex;
};

/**
 * In-memory incremental tree. Insert leaves in order (index 0, 1, 2, …).
 * Mirrors Solidity `insert` for `currentRoot` / `nextIndex`.
 */
export class IncrementalMerkleTree {
  readonly depth = MERKLE_DEPTH;
  readonly zeros: Hex[];
  filledSubtrees: Hex[];
  nextIndex = 0;
  currentRoot: Hex;
  leaves: Hex[] = [];

  constructor() {
    this.zeros = buildZeros();
    this.filledSubtrees = this.zeros.slice();
    this.currentRoot = emptyRoot();
  }

  insert(leaf: Hex): number {
    if (leaf === ZERO) throw new Error("ZeroLeaf");
    if (this.nextIndex >= MERKLE_MAX_LEAVES) throw new Error("TreeFull");

    const index = this.nextIndex;
    let currentIndex = index;
    let currentLevelHash = leaf;

    for (let i = 0; i < MERKLE_DEPTH; i++) {
      if (currentIndex % 2 === 0) {
        this.filledSubtrees[i] = currentLevelHash;
        currentLevelHash = hashLeftRight(currentLevelHash, this.zeros[i]!);
      } else {
        currentLevelHash = hashLeftRight(
          this.filledSubtrees[i]!,
          currentLevelHash
        );
      }
      currentIndex = Math.floor(currentIndex / 2);
    }

    this.currentRoot = currentLevelHash;
    this.leaves.push(leaf);
    this.nextIndex = index + 1;
    return index;
  }

  /**
   * Path for `leafIndex` against the tree built from all inserted leaves.
   * Layer-walk with zero-padding for missing right siblings (Tornado-style).
   */
  path(leafIndex: number): MerklePath {
    if (leafIndex < 0 || leafIndex >= this.leaves.length) {
      throw new Error("leafIndex out of range");
    }

    const pathElements: Hex[] = [];
    const pathIndices: number[] = [];
    let layer: Hex[] = this.leaves.slice();
    let idx = leafIndex;

    for (let level = 0; level < MERKLE_DEPTH; level++) {
      const isRight = idx % 2 === 1;
      const siblingIdx = isRight ? idx - 1 : idx + 1;
      const sibling =
        siblingIdx >= 0 && siblingIdx < layer.length
          ? layer[siblingIdx]!
          : this.zeros[level]!;

      pathElements.push(sibling);
      pathIndices.push(isRight ? 1 : 0);

      const next: Hex[] = [];
      for (let i = 0; i < layer.length; i += 2) {
        const left = layer[i]!;
        const right =
          i + 1 < layer.length ? layer[i + 1]! : this.zeros[level]!;
        next.push(hashLeftRight(left, right));
      }
      // If odd leftover was paired with zero above; if layer empty, stop
      if (next.length === 0) {
        next.push(this.zeros[level]!);
      }
      layer = next;
      idx = Math.floor(idx / 2);
    }

    const root = layer[0] ?? this.currentRoot;

    // Must match insert()-built root
    if (root.toLowerCase() !== this.currentRoot.toLowerCase()) {
      throw new Error(
        `path root mismatch: path=${root} tree=${this.currentRoot}`
      );
    }

    if (
      !verifyMerklePath(
        this.leaves[leafIndex]!,
        leafIndex,
        pathElements,
        root
      )
    ) {
      throw new Error("path verification failed");
    }

    return {
      leafIndex,
      leaf: this.leaves[leafIndex]!,
      pathElements,
      pathIndices,
      root,
    };
  }
}

/** Verify a path against a claimed root */
export function verifyMerklePath(
  leaf: Hex,
  leafIndex: number,
  pathElements: Hex[],
  root: Hex
): boolean {
  if (pathElements.length !== MERKLE_DEPTH) return false;
  let hash = leaf;
  let idx = leafIndex;
  for (let i = 0; i < MERKLE_DEPTH; i++) {
    const sib = pathElements[i]!;
    if (idx % 2 === 0) {
      hash = hashLeftRight(hash, sib);
    } else {
      hash = hashLeftRight(sib, hash);
    }
    idx = Math.floor(idx / 2);
  }
  return hash.toLowerCase() === root.toLowerCase();
}
