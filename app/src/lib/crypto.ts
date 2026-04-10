import {
  MERKLE_TREE_DEPTH,
  TRANSFER_WASM_URL,
  TRANSFER_ZKEY_URL,
  UNSHIELD_WASM_URL,
  UNSHIELD_ZKEY_URL,
} from "./constants";

let poseidonInstance: any = null;

async function getPoseidon() {
  if (poseidonInstance) return poseidonInstance;
  const { buildPoseidon } = await import("circomlibjs");
  poseidonInstance = await buildPoseidon();
  return poseidonInstance;
}

export function toBE32(value: bigint | string): Uint8Array {
  const hex = BigInt(value).toString(16).padStart(64, "0");
  const bytes = new Uint8Array(32);
  for (let i = 0; i < 32; i++) {
    bytes[i] = parseInt(hex.substring(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

function randomFieldElement(): bigint {
  const bytes = new Uint8Array(31);
  crypto.getRandomValues(bytes);
  return BigInt(
    "0x" + Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("")
  );
}

export async function poseidonHash(inputs: bigint[]): Promise<bigint> {
  const poseidon = await getPoseidon();
  return poseidon.F.toObject(poseidon(inputs));
}

// ---- UTXO Commitment ----

export interface Deposit {
  amount: bigint;
  nullifier: bigint;
  secret: bigint;
  commitment: bigint;
  nullifierHash: bigint;
}

export async function generateDeposit(amountLamports: bigint): Promise<Deposit> {
  const nullifier = randomFieldElement();
  const secret = randomFieldElement();
  const commitment = await poseidonHash([amountLamports, nullifier, secret]);
  const nullifierHash = await poseidonHash([nullifier]);
  return { amount: amountLamports, nullifier, secret, commitment, nullifierHash };
}

// ---- Secret note ----

export function encodeNote(amount: bigint, nullifier: bigint, secret: bigint): string {
  return btoa(JSON.stringify({ a: amount.toString(), n: nullifier.toString(), s: secret.toString() }));
}

export function decodeNote(note: string): { amount: bigint; nullifier: bigint; secret: bigint } {
  const d = JSON.parse(atob(note.trim()));
  return { amount: BigInt(d.a), nullifier: BigInt(d.n), secret: BigInt(d.s) };
}

// ---- Client-side Poseidon Merkle tree with localStorage persistence ----

const STORAGE_KEY = "milk_tree_state";

interface TreeState {
  filledSubs: string[];
  leaves: string[];
  nextIndex: number;
  roots: string[];
}

function saveTree(state: TreeState) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch {}
}

function loadTree(): TreeState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch { return null; }
}

let treeZeros: bigint[] | null = null;
let treeFilledSubs: bigint[] | null = null;
let treeNextIndex = 0;
let treeLeaves: bigint[] = [];
let treeRoots: bigint[] = [];
let treeInitialized = false;

async function ensureTree(): Promise<bigint[]> {
  const poseidon = await getPoseidon();
  const F = poseidon.F;

  if (!treeZeros) {
    treeZeros = [BigInt(0)];
    for (let i = 0; i < MERKLE_TREE_DEPTH; i++) {
      treeZeros.push(F.toObject(poseidon([treeZeros[i], treeZeros[i]])));
    }
  }

  if (!treeInitialized) {
    const saved = loadTree();
    if (saved && saved.leaves.length > 0) {
      treeFilledSubs = saved.filledSubs.map(s => BigInt(s));
      treeLeaves = saved.leaves.map(s => BigInt(s));
      treeNextIndex = saved.nextIndex;
      treeRoots = saved.roots.map(s => BigInt(s));
    } else {
      treeFilledSubs = treeZeros.slice(0, MERKLE_TREE_DEPTH);
      treeLeaves = [];
      treeNextIndex = 0;
      treeRoots = [];
    }
    treeInitialized = true;
  }

  return treeZeros;
}

export async function treeInsert(commitment: bigint): Promise<bigint> {
  const poseidon = await getPoseidon();
  const F = poseidon.F;
  const zeros = await ensureTree();
  if (!treeFilledSubs) treeFilledSubs = zeros.slice(0, MERKLE_TREE_DEPTH);

  let ci = treeNextIndex;
  let ch = commitment;
  const nfs = [...treeFilledSubs];

  for (let i = 0; i < MERKLE_TREE_DEPTH; i++) {
    if (ci % 2 === 0) {
      nfs[i] = ch;
      ch = F.toObject(poseidon([ch, zeros[i]]));
    } else {
      ch = F.toObject(poseidon([treeFilledSubs[i], ch]));
    }
    ci = Math.floor(ci / 2);
  }

  treeFilledSubs = nfs;
  treeLeaves.push(commitment);
  treeNextIndex++;
  treeRoots.push(ch);

  // Persist
  saveTree({
    filledSubs: treeFilledSubs.map(b => b.toString()),
    leaves: treeLeaves.map(b => b.toString()),
    nextIndex: treeNextIndex,
    roots: treeRoots.map(b => b.toString()),
  });

  return ch;
}

/** Find a commitment in the tree and return its path + root */
async function findAndBuildPath(commitment: bigint): Promise<{
  root: bigint; pathElements: string[]; pathIndices: number[];
}> {
  const poseidon = await getPoseidon();
  const F = poseidon.F;
  const zeros = await ensureTree();

  // Find the leaf index
  const leafIdx = treeLeaves.findIndex(l => l === commitment);

  if (leafIdx === -1 || treeLeaves.length === 0) {
    // Leaf not in tree — treat as single-leaf tree (first shield)
    const pathElements: string[] = [];
    const pathIndices: number[] = [];
    let cur = commitment;
    for (let i = 0; i < MERKLE_TREE_DEPTH; i++) {
      pathElements.push(zeros[i].toString());
      pathIndices.push(0);
      cur = F.toObject(poseidon([cur, zeros[i]]));
    }
    return { root: cur, pathElements, pathIndices };
  }

  // Rebuild tree incrementally to get all node hashes
  const fs = zeros.slice(0, MERKLE_TREE_DEPTH).map(z => z);
  const nodeMap = new Map<string, bigint>();

  for (let n = 0; n < treeLeaves.length; n++) {
    nodeMap.set(`0:${n}`, treeLeaves[n]);
    let ci = n, ch = treeLeaves[n];
    const snapshot = [...fs];
    for (let i = 0; i < MERKLE_TREE_DEPTH; i++) {
      let left: bigint, right: bigint;
      if (ci % 2 === 0) {
        fs[i] = ch;
        left = ch;
        right = zeros[i];
      } else {
        left = snapshot[i];
        right = ch;
      }
      ch = F.toObject(poseidon([left, right]));
      ci = Math.floor(ci / 2);
      nodeMap.set(`${i + 1}:${ci}`, ch);
    }
  }

  // Extract path for the target leaf
  const pathElements: string[] = [];
  const pathIndices: number[] = [];
  let idx = leafIdx;
  for (let level = 0; level < MERKLE_TREE_DEPTH; level++) {
    const sibIdx = idx % 2 === 0 ? idx + 1 : idx - 1;
    const sib = nodeMap.get(`${level}:${sibIdx}`) ?? zeros[level];
    pathElements.push(sib.toString());
    pathIndices.push(idx % 2);
    idx = Math.floor(idx / 2);
  }

  // Root is the last root we computed
  const root = treeRoots[treeRoots.length - 1];
  return { root, pathElements, pathIndices };
}

// ---- Proof conversion ----

function proofToOnChain(proof: any): { a: number[]; b: number[]; c: number[] } {
  const a = [...toBE32(proof.pi_a[0]), ...toBE32(proof.pi_a[1])];
  const b = [
    ...toBE32(proof.pi_b[0][1]), ...toBE32(proof.pi_b[0][0]),
    ...toBE32(proof.pi_b[1][1]), ...toBE32(proof.pi_b[1][0]),
  ];
  const c = [...toBE32(proof.pi_c[0]), ...toBE32(proof.pi_c[1])];
  return { a, b, c };
}

// ---- Transfer proof ----

export interface TransferResult {
  proof: { a: number[]; b: number[]; c: number[] };
  root: bigint;
  nullifierHash: bigint;
  outCommitment1: bigint;
  outCommitment2: bigint;
  outDeposit1: Deposit;
  outDeposit2: Deposit;
}

export async function generateTransferProof(
  inAmount: bigint, inNullifier: bigint, inSecret: bigint,
  outAmount1: bigint, outAmount2: bigint
): Promise<TransferResult> {
  const inCommitment = await poseidonHash([inAmount, inNullifier, inSecret]);
  const inNullifierHash = await poseidonHash([inNullifier]);
  const { root, pathElements, pathIndices } = await findAndBuildPath(inCommitment);

  const outDeposit1 = await generateDeposit(outAmount1);
  const outDeposit2 = await generateDeposit(outAmount2);

  const input = {
    root: root.toString(), nullifierHash: inNullifierHash.toString(),
    outCommitment1: outDeposit1.commitment.toString(),
    outCommitment2: outDeposit2.commitment.toString(),
    inAmount: inAmount.toString(), inNullifier: inNullifier.toString(), inSecret: inSecret.toString(),
    outAmount1: outAmount1.toString(), outNullifier1: outDeposit1.nullifier.toString(), outSecret1: outDeposit1.secret.toString(),
    outAmount2: outAmount2.toString(), outNullifier2: outDeposit2.nullifier.toString(), outSecret2: outDeposit2.secret.toString(),
    pathElements, pathIndices,
  };

  const snarkjs = await import("snarkjs");
  const { proof } = await snarkjs.groth16.fullProve(input, TRANSFER_WASM_URL, TRANSFER_ZKEY_URL);

  return {
    proof: proofToOnChain(proof), root, nullifierHash: inNullifierHash,
    outCommitment1: outDeposit1.commitment, outCommitment2: outDeposit2.commitment,
    outDeposit1, outDeposit2,
  };
}

// ---- Unshield proof ----

export interface UnshieldResult {
  proof: { a: number[]; b: number[]; c: number[] };
  root: bigint;
  nullifierHash: bigint;
}

export async function generateUnshieldProof(
  amount: bigint, nullifier: bigint, secret: bigint, recipientPubkey: bigint
): Promise<UnshieldResult> {
  const commitment = await poseidonHash([amount, nullifier, secret]);
  const nullifierHash = await poseidonHash([nullifier]);
  const { root, pathElements, pathIndices } = await findAndBuildPath(commitment);

  const input = {
    root: root.toString(), nullifierHash: nullifierHash.toString(),
    amount: amount.toString(), recipient: recipientPubkey.toString(),
    nullifier: nullifier.toString(), secret: secret.toString(),
    pathElements, pathIndices,
  };

  const snarkjs = await import("snarkjs");
  const { proof } = await snarkjs.groth16.fullProve(input, UNSHIELD_WASM_URL, UNSHIELD_ZKEY_URL);

  return { proof: proofToOnChain(proof), root, nullifierHash };
}
