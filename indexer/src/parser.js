/**
 * Parse MILK program transactions to extract commitment leaves.
 *
 * Instruction layouts (Anchor borsh serialization):
 *
 * Shield:   [8 disc][8 amount_u64][32 commitment][32 new_root]
 * Transfer: [8 disc][64 proof.a][128 proof.b][64 proof.c][32 root][32 nullifier_hash]
 *           [32 out_commitment_1][32 out_commitment_2][32 new_root_1][32 new_root_2]
 * Unshield: no new commitments (consumes a leaf)
 */

import bs58 from "bs58";

const PROGRAM_ID = "9Bxxr2GGWoZw1mbR3Cij8jnZUpcQBXcZKVTmfDVJ2Ewy";

// Anchor discriminators from IDL
const SHIELD_DISC = Buffer.from([220, 198, 253, 246, 231, 84, 147, 98]);
const TRANSFER_DISC = Buffer.from([163, 52, 200, 231, 140, 3, 69, 186]);

/**
 * Extract commitment leaves from a confirmed transaction.
 * Returns an array of { commitment: Buffer(32), type: 'shield'|'transfer' }
 */
export function extractCommitments(tx) {
  const results = [];
  if (!tx?.transaction?.message) return results;

  const message = tx.transaction.message;
  const accountKeys = message.accountKeys.map((k) =>
    typeof k === "string" ? k : k.toBase58?.() ?? k.pubkey?.toBase58?.() ?? String(k)
  );

  // Find our program's instruction(s)
  const instructions = message.instructions || [];
  for (const ix of instructions) {
    const programId = accountKeys[ix.programIdIndex];
    if (programId !== PROGRAM_ID) continue;

    const data = typeof ix.data === "string" ? bs58.decode(ix.data) : ix.data;
    if (data.length < 8) continue;

    const disc = data.slice(0, 8);

    if (disc.every((b, i) => b === SHIELD_DISC[i])) {
      // Shield: commitment at offset 16 (8 disc + 8 amount)
      if (data.length >= 48) {
        results.push({
          commitment: Buffer.from(data.slice(16, 48)),
          type: "shield",
        });
      }
    } else if (disc.every((b, i) => b === TRANSFER_DISC[i])) {
      // Transfer: out_commitment_1 at offset 328, out_commitment_2 at offset 360
      // 8 + 64 + 128 + 64 = 264 (proof end) + 32 (root) + 32 (nullifier) = 328
      if (data.length >= 392) {
        results.push({
          commitment: Buffer.from(data.slice(328, 360)),
          type: "transfer",
        });
        results.push({
          commitment: Buffer.from(data.slice(360, 392)),
          type: "transfer",
        });
      }
    }
    // Unshield: no new leaves
  }

  // Also check inner instructions (in case of CPI)
  if (tx.meta?.innerInstructions) {
    for (const inner of tx.meta.innerInstructions) {
      for (const ix of inner.instructions) {
        const programId = accountKeys[ix.programIdIndex];
        if (programId !== PROGRAM_ID) continue;

        const data = typeof ix.data === "string" ? bs58.decode(ix.data) : ix.data;
        if (data.length < 8) continue;

        const disc = data.slice(0, 8);

        if (disc.every((b, i) => b === SHIELD_DISC[i])) {
          if (data.length >= 48) {
            results.push({
              commitment: Buffer.from(data.slice(16, 48)),
              type: "shield",
            });
          }
        } else if (disc.every((b, i) => b === TRANSFER_DISC[i])) {
          if (data.length >= 392) {
            results.push({
              commitment: Buffer.from(data.slice(328, 360)),
              type: "transfer",
            });
            results.push({
              commitment: Buffer.from(data.slice(360, 392)),
              type: "transfer",
            });
          }
        }
      }
    }
  }

  return results;
}

/**
 * Convert a 32-byte big-endian buffer to a bigint (for Poseidon field element).
 */
export function bufferToBigInt(buf) {
  return BigInt("0x" + Buffer.from(buf).toString("hex"));
}
