/**
 * In-memory Poseidon Merkle tree that mirrors the on-chain MerkleTreeState.
 * Uses circomlibjs Poseidon (BN128, same params as the circuits).
 */

import { buildPoseidon } from "circomlibjs";

const TREE_DEPTH = 20;

let poseidon = null;
let F = null;

export async function initPoseidon() {
  if (poseidon) return;
  poseidon = await buildPoseidon();
  F = poseidon.F;
}

function hash2(left, right) {
  return F.toObject(poseidon([left, right]));
}

/**
 * Compute the precomputed zero hashes: ZEROS[0] = 0, ZEROS[i+1] = Poseidon(ZEROS[i], ZEROS[i])
 * Must match the on-chain ZEROS array in poseidon_tree.rs
 */
function computeZeros() {
  const zeros = [BigInt(0)];
  for (let i = 0; i < TREE_DEPTH; i++) {
    zeros.push(hash2(zeros[i], zeros[i]));
  }
  return zeros;
}

export class PoseidonMerkleTree {
  constructor() {
    this.depth = TREE_DEPTH;
    this.zeros = computeZeros();
    this.filledSubtrees = this.zeros.slice(0, TREE_DEPTH);
    this.leaves = [];
    this.nextIndex = 0;
    this.roots = [this.zeros[TREE_DEPTH]]; // initial root = ZEROS[20]
  }

  /** Insert a leaf (as bigint). Returns the new root. */
  insert(leaf) {
    if (this.nextIndex >= 1 << TREE_DEPTH) {
      throw new Error("Tree is full");
    }

    let currentIndex = this.nextIndex;
    let currentHash = leaf;
    const newFilledSubtrees = [...this.filledSubtrees];

    for (let i = 0; i < this.depth; i++) {
      if (currentIndex % 2 === 0) {
        newFilledSubtrees[i] = currentHash;
        currentHash = hash2(currentHash, this.zeros[i]);
      } else {
        currentHash = hash2(this.filledSubtrees[i], currentHash);
      }
      currentIndex = Math.floor(currentIndex / 2);
    }

    this.filledSubtrees = newFilledSubtrees;
    this.leaves.push(leaf);
    this.nextIndex++;
    this.roots.push(currentHash);

    return currentHash;
  }

  /** Get current root */
  get root() {
    return this.roots[this.roots.length - 1];
  }

  /** Build Merkle inclusion proof for a leaf at the given index */
  getPath(leafIndex) {
    if (leafIndex < 0 || leafIndex >= this.leaves.length) {
      throw new Error(`Leaf index ${leafIndex} out of range [0, ${this.leaves.length})`);
    }

    // Rebuild the full node map up to the state when all current leaves are inserted
    const fs = this.zeros.slice(0, this.depth).map((z) => z);
    const nodeMap = new Map();

    for (let n = 0; n < this.leaves.length; n++) {
      nodeMap.set(`0:${n}`, this.leaves[n]);
      let ci = n;
      let ch = this.leaves[n];
      const snapshot = [...fs];

      for (let i = 0; i < this.depth; i++) {
        let left, right;
        if (ci % 2 === 0) {
          fs[i] = ch;
          left = ch;
          right = this.zeros[i];
        } else {
          left = snapshot[i];
          right = ch;
        }
        ch = hash2(left, right);
        ci = Math.floor(ci / 2);
        nodeMap.set(`${i + 1}:${ci}`, ch);
      }
    }

    // Extract sibling path
    const pathElements = [];
    const pathIndices = [];
    let idx = leafIndex;

    for (let level = 0; level < this.depth; level++) {
      const sibIdx = idx % 2 === 0 ? idx + 1 : idx - 1;
      const sib = nodeMap.get(`${level}:${sibIdx}`) ?? this.zeros[level];
      pathElements.push(sib.toString());
      pathIndices.push(idx % 2);
      idx = Math.floor(idx / 2);
    }

    return {
      root: this.root.toString(),
      pathElements,
      pathIndices,
      leaf: this.leaves[leafIndex].toString(),
      leafIndex,
    };
  }

  /** Serialize tree state for persistence */
  toJSON() {
    return {
      leaves: this.leaves.map((l) => l.toString()),
      nextIndex: this.nextIndex,
      roots: this.roots.map((r) => r.toString()),
      filledSubtrees: this.filledSubtrees.map((s) => s.toString()),
    };
  }

  /** Restore tree state from serialized JSON */
  static fromJSON(data) {
    const tree = new PoseidonMerkleTree();
    // Re-insert all leaves to rebuild correct state
    for (const leafStr of data.leaves) {
      tree.insert(BigInt(leafStr));
    }
    return tree;
  }
}
