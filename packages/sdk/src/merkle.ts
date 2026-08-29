/**
 * Poseidon incremental Merkle tree. Matches IncrementalMerkleTreePoseidon.sol
 * and the circom MerkleTreeChecker.
 */

import { fieldToHex, poseidon2, toField } from "./poseidon.js";

export const MERKLE_DEPTH = 20;

export type PoseidonMerklePath = {
  leafIndex: number;
  leaf: bigint;
  pathElements: bigint[];
  pathIndices: number[];
  root: bigint;
};

export class IncrementalMerkleTreePoseidon {
  zeros: bigint[] = [];
  filledSubtrees: bigint[] = [];
  nextIndex = 0;
  currentRoot = 0n;
  leaves: bigint[] = [];
  private ready = false;

  async init() {
    if (this.ready) return;
    const zeros: bigint[] = [];
    let z = 0n;
    for (let i = 0; i < MERKLE_DEPTH; i++) {
      zeros.push(z);
      z = await poseidon2(z, z);
    }
    this.zeros = zeros;
    this.filledSubtrees = zeros.slice();
    this.currentRoot = z;
    this.ready = true;
  }

  async insert(leaf: bigint): Promise<number> {
    await this.init();
    const L = toField(leaf);
    if (L === 0n) throw new Error("ZeroLeaf");
    const index = this.nextIndex;
    let currentIndex = BigInt(index);
    let h = L;

    for (let i = 0; i < MERKLE_DEPTH; i++) {
      if (currentIndex % 2n === 0n) {
        this.filledSubtrees[i] = h;
        h = await poseidon2(h, this.zeros[i]!);
      } else {
        h = await poseidon2(this.filledSubtrees[i]!, h);
      }
      currentIndex = currentIndex / 2n;
    }

    this.currentRoot = h;
    this.leaves.push(L);
    this.nextIndex = index + 1;
    return index;
  }

  async path(leafIndex: number): Promise<PoseidonMerklePath> {
    await this.init();
    if (leafIndex < 0 || leafIndex >= this.leaves.length) {
      throw new Error("leafIndex out of range");
    }

    const pathElements: bigint[] = [];
    const pathIndices: number[] = [];
    let layer = this.leaves.slice();
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

      const next: bigint[] = [];
      for (let i = 0; i < layer.length; i += 2) {
        const left = layer[i]!;
        const right = i + 1 < layer.length ? layer[i + 1]! : this.zeros[level]!;
        next.push(await poseidon2(left, right));
      }
      layer = next.length ? next : [this.zeros[level]!];
      idx = Math.floor(idx / 2);
    }

    const root = layer[0]!;
    if (root !== this.currentRoot) {
      throw new Error("path root mismatch");
    }

    // verify
    let hash = this.leaves[leafIndex]!;
    let ix = leafIndex;
    for (let i = 0; i < MERKLE_DEPTH; i++) {
      const sib = pathElements[i]!;
      hash = ix % 2 === 0 ? await poseidon2(hash, sib) : await poseidon2(sib, hash);
      ix = Math.floor(ix / 2);
    }
    if (hash !== root) throw new Error("path verification failed");

    return { leafIndex, leaf: this.leaves[leafIndex]!, pathElements, pathIndices, root };
  }
}

export function pathToCircomInput(path: PoseidonMerklePath) {
  return {
    pathElements: path.pathElements.map((x) => x.toString()),
    pathIndices: path.pathIndices.map(String),
    root: path.root.toString(),
    leaf: path.leaf.toString(),
    leafHex: fieldToHex(path.leaf),
    rootHex: fieldToHex(path.root),
  };
}
