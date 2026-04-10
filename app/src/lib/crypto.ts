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

/** Convert bigint to 32-byte big-endian Uint8Array */
export function toBE32(value: bigint | string): Uint8Array {
  const hex = BigInt(value).toString(16).padStart(64, "0");
  const bytes = new Uint8Array(32);
  for (let i = 0; i < 32; i++) {
    bytes[i] = parseInt(hex.substring(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

/** Random field element (31 bytes, under BN254 prime) */
function randomFieldElement(): bigint {
  const bytes = new Uint8Array(31);
  crypto.getRandomValues(bytes);
  return BigInt(
    "0x" + Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("")
  );
}

/** Poseidon hash */
export async function poseidonHash(inputs: bigint[]): Promise<bigint> {
  const poseidon = await getPoseidon();
  return poseidon.F.toObject(poseidon(inputs));
}

// ---- UTXO Commitment: Poseidon(amount, nullifier, secret) ----

export interface Deposit {
  amount: bigint;
  nullifier: bigint;
  secret: bigint;
  commitment: bigint;
  nullifierHash: bigint;
}

/** Generate a new UTXO deposit (shield) */
export async function generateDeposit(amountLamports: bigint): Promise<Deposit> {
  const nullifier = randomFieldElement();
  const secret = randomFieldElement();
  const commitment = await poseidonHash([amountLamports, nullifier, secret]);
  const nullifierHash = await poseidonHash([nullifier]);
  return { amount: amountLamports, nullifier, secret, commitment, nullifierHash };
}

// ---- Secret note: base64 encoded {a, n, s} ----

export function encodeNote(amount: bigint, nullifier: bigint, secret: bigint): string {
  return btoa(
    JSON.stringify({
      a: amount.toString(),
      n: nullifier.toString(),
      s: secret.toString(),
    })
  );
}

export function decodeNote(note: string): {
  amount: bigint;
  nullifier: bigint;
  secret: bigint;
} {
  const d = JSON.parse(atob(note.trim()));
  return {
    amount: BigInt(d.a),
    nullifier: BigInt(d.n),
    secret: BigInt(d.s),
  };
}

// ---- Merkle proof (client-side Poseidon tree, leaf at index 0) ----

async function buildMerkleProof(commitment: bigint) {
  const poseidon = await getPoseidon();
  const F = poseidon.F;
  const pathElements: string[] = [];
  const pathIndices: number[] = [];
  let cur = commitment;
  for (let i = 0; i < MERKLE_TREE_DEPTH; i++) {
    pathElements.push("0");
    pathIndices.push(0);
    cur = F.toObject(poseidon([cur, BigInt(0)]));
  }
  return { root: cur, pathElements, pathIndices };
}

// ---- Proof conversion (snarkjs → on-chain bytes) ----

function proofToOnChain(proof: any): { a: number[]; b: number[]; c: number[] } {
  const a = [...toBE32(proof.pi_a[0]), ...toBE32(proof.pi_a[1])];
  const b = [
    ...toBE32(proof.pi_b[0][1]),
    ...toBE32(proof.pi_b[0][0]),
    ...toBE32(proof.pi_b[1][1]),
    ...toBE32(proof.pi_b[1][0]),
  ];
  const c = [...toBE32(proof.pi_c[0]), ...toBE32(proof.pi_c[1])];
  return { a, b, c };
}

// ---- Generate transfer proof (1-in → 2-out) ----

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
  inAmount: bigint,
  inNullifier: bigint,
  inSecret: bigint,
  outAmount1: bigint,
  outAmount2: bigint
): Promise<TransferResult> {
  const inCommitment = await poseidonHash([inAmount, inNullifier, inSecret]);
  const inNullifierHash = await poseidonHash([inNullifier]);
  const { root, pathElements, pathIndices } = await buildMerkleProof(inCommitment);

  const outDeposit1 = await generateDeposit(outAmount1);
  const outDeposit2 = await generateDeposit(outAmount2);

  const input = {
    root: root.toString(),
    nullifierHash: inNullifierHash.toString(),
    outCommitment1: outDeposit1.commitment.toString(),
    outCommitment2: outDeposit2.commitment.toString(),
    inAmount: inAmount.toString(),
    inNullifier: inNullifier.toString(),
    inSecret: inSecret.toString(),
    outAmount1: outAmount1.toString(),
    outNullifier1: outDeposit1.nullifier.toString(),
    outSecret1: outDeposit1.secret.toString(),
    outAmount2: outAmount2.toString(),
    outNullifier2: outDeposit2.nullifier.toString(),
    outSecret2: outDeposit2.secret.toString(),
    pathElements,
    pathIndices,
  };

  const snarkjs = await import("snarkjs");
  const { proof } = await snarkjs.groth16.fullProve(
    input,
    TRANSFER_WASM_URL,
    TRANSFER_ZKEY_URL
  );

  return {
    proof: proofToOnChain(proof),
    root,
    nullifierHash: inNullifierHash,
    outCommitment1: outDeposit1.commitment,
    outCommitment2: outDeposit2.commitment,
    outDeposit1,
    outDeposit2,
  };
}

// ---- Generate unshield proof (1-in → SOL out) ----

export interface UnshieldResult {
  proof: { a: number[]; b: number[]; c: number[] };
  root: bigint;
  nullifierHash: bigint;
}

export async function generateUnshieldProof(
  amount: bigint,
  nullifier: bigint,
  secret: bigint,
  recipientPubkey: bigint
): Promise<UnshieldResult> {
  const commitment = await poseidonHash([amount, nullifier, secret]);
  const nullifierHash = await poseidonHash([nullifier]);
  const { root, pathElements, pathIndices } = await buildMerkleProof(commitment);

  const input = {
    root: root.toString(),
    nullifierHash: nullifierHash.toString(),
    amount: amount.toString(),
    recipient: recipientPubkey.toString(),
    nullifier: nullifier.toString(),
    secret: secret.toString(),
    pathElements,
    pathIndices,
  };

  const snarkjs = await import("snarkjs");
  const { proof } = await snarkjs.groth16.fullProve(
    input,
    UNSHIELD_WASM_URL,
    UNSHIELD_ZKEY_URL
  );

  return {
    proof: proofToOnChain(proof),
    root,
    nullifierHash,
  };
}
