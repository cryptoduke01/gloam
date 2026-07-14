/**
 * Parity check for keccak incremental tree (matches Solidity).
 * Run from app/: node scripts/merkle-selftest.mjs
 */
import { encodePacked, keccak256 } from "viem";

const ZERO = "0x" + "00".repeat(32);
const DEPTH = 20;

function hashLR(left, right) {
  return keccak256(encodePacked(["bytes32", "bytes32"], [left, right]));
}

function buildZeros() {
  const zeros = [];
  let z = ZERO;
  for (let i = 0; i < DEPTH; i++) {
    zeros.push(z);
    z = hashLR(z, z);
  }
  return zeros;
}

function emptyRoot() {
  let z = ZERO;
  for (let i = 0; i < DEPTH; i++) z = hashLR(z, z);
  return z;
}

class Tree {
  constructor() {
    this.zeros = buildZeros();
    this.filled = this.zeros.slice();
    this.currentRoot = emptyRoot();
    this.leaves = [];
    this.nextIndex = 0;
  }
  insert(leaf) {
    const index = this.nextIndex;
    let currentIndex = index;
    let h = leaf;
    for (let i = 0; i < DEPTH; i++) {
      if (currentIndex % 2 === 0) {
        this.filled[i] = h;
        h = hashLR(h, this.zeros[i]);
      } else {
        h = hashLR(this.filled[i], h);
      }
      currentIndex = Math.floor(currentIndex / 2);
    }
    this.currentRoot = h;
    this.leaves.push(leaf);
    this.nextIndex = index + 1;
    return index;
  }
  path(leafIndex) {
    const pathElements = [];
    let layer = this.leaves.slice();
    let idx = leafIndex;
    for (let level = 0; level < DEPTH; level++) {
      const isRight = idx % 2 === 1;
      const siblingIdx = isRight ? idx - 1 : idx + 1;
      const sibling =
        siblingIdx >= 0 && siblingIdx < layer.length
          ? layer[siblingIdx]
          : this.zeros[level];
      pathElements.push(sibling);
      const next = [];
      for (let i = 0; i < layer.length; i += 2) {
        const left = layer[i];
        const right = i + 1 < layer.length ? layer[i + 1] : this.zeros[level];
        next.push(hashLR(left, right));
      }
      layer = next.length ? next : [this.zeros[level]];
      idx = Math.floor(idx / 2);
    }
    const root = layer[0];
    // verify
    let hash = this.leaves[leafIndex];
    let ix = leafIndex;
    for (let i = 0; i < DEPTH; i++) {
      const sib = pathElements[i];
      hash = ix % 2 === 0 ? hashLR(hash, sib) : hashLR(sib, hash);
      ix = Math.floor(ix / 2);
    }
    if (hash !== root || root !== this.currentRoot) {
      throw new Error(`mismatch path=${root} tree=${this.currentRoot} calc=${hash}`);
    }
    return { root, pathElements };
  }
}

const t = new Tree();
console.log("empty", t.currentRoot);

const a = keccak256(encodePacked(["string"], ["a"]));
const b = keccak256(encodePacked(["string"], ["b"]));
const c = keccak256(encodePacked(["string"], ["c"]));
t.insert(a);
t.path(0);
t.insert(b);
t.path(0);
t.path(1);
t.insert(c);
t.path(0);
t.path(1);
t.path(2);
console.log("root3", t.currentRoot);
console.log("leaves", t.nextIndex);
console.log("ok merkle-selftest");
