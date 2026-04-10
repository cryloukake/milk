/**
 * Syncs the Poseidon Merkle tree by fetching historical transactions
 * from devnet and subscribing to new ones via WebSocket.
 */

import { Connection, PublicKey } from "@solana/web3.js";
import { extractCommitments, bufferToBigInt } from "./parser.js";

const PROGRAM_ID = new PublicKey("9Bxxr2GGWoZw1mbR3Cij8jnZUpcQBXcZKVTmfDVJ2Ewy");
const CLUSTER_URL = process.env.SOLANA_RPC_URL || "https://api.devnet.solana.com";

export class TreeSync {
  constructor(tree) {
    this.tree = tree;
    this.connection = new Connection(CLUSTER_URL, {
      commitment: "confirmed",
      fetch: (url, opts) =>
        fetch(url, { ...opts, signal: AbortSignal.timeout(30_000) }),
    });
    this.subscriptionId = null;
    this.processedSignatures = new Set();
    this.syncing = false;
  }

  /**
   * Fetch all historical transactions for the MILK program and insert
   * commitment leaves into the tree in chronological order.
   */
  async syncHistorical() {
    if (this.syncing) return;
    this.syncing = true;

    console.log("Fetching historical transactions...");

    // Fetch all signatures (oldest first)
    let allSignatures = [];
    let before = undefined;

    while (true) {
      const batch = await this.connection.getSignaturesForAddress(
        PROGRAM_ID,
        { before, limit: 1000 },
        "confirmed"
      );

      if (batch.length === 0) break;
      allSignatures.push(...batch);
      before = batch[batch.length - 1].signature;

      // Rate limit
      await sleep(500);
    }

    // Reverse to process oldest first
    allSignatures.reverse();

    // Filter to only successful transactions
    allSignatures = allSignatures.filter((s) => s.err === null);

    console.log(`Found ${allSignatures.length} successful transactions.`);

    // Process one at a time to avoid 429 rate limits on public RPC
    let leafCount = 0;
    for (let i = 0; i < allSignatures.length; i++) {
      const sig = allSignatures[i].signature;
      if (this.processedSignatures.has(sig)) continue;

      let tx;
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          tx = await this.connection.getTransaction(sig, {
            commitment: "confirmed",
            maxSupportedTransactionVersion: 0,
          });
          break;
        } catch (err) {
          console.error(`  Attempt ${attempt + 1} failed for ${sig.slice(0, 16)}...: ${err.message}`);
          await sleep(2000 * (attempt + 1));
        }
      }

      if (!tx) {
        console.warn(`  Skipping tx ${sig.slice(0, 16)}... (could not fetch)`);
        continue;
      }

      this.processedSignatures.add(sig);

      const commitments = extractCommitments(tx);
      for (const { commitment, type } of commitments) {
        const leaf = bufferToBigInt(commitment);
        const root = this.tree.insert(leaf);
        leafCount++;
        console.log(
          `  [${type}] leaf #${this.tree.nextIndex - 1}: ${leaf.toString(16).slice(0, 16)}... → root ${root.toString(16).slice(0, 16)}...`
        );
      }

      // Rate limit: 1 request per second for free devnet RPC
      await sleep(1000);
    }

    console.log(`Historical sync complete. ${leafCount} leaves inserted. Tree has ${this.tree.leaves.length} total leaves.`);
    console.log(`Current root: ${this.tree.root.toString(16)}`);
    this.syncing = false;
  }

  /**
   * Subscribe to new program logs and insert new commitments in real-time.
   */
  startLiveSync() {
    console.log("Starting live sync via WebSocket...");

    this.subscriptionId = this.connection.onLogs(
      PROGRAM_ID,
      async (logInfo) => {
        const { signature, err } = logInfo;
        if (err) return;
        if (this.processedSignatures.has(signature)) return;

        // Small delay to ensure tx is confirmed
        await sleep(2000);

        try {
          const tx = await this.connection.getTransaction(signature, {
            commitment: "confirmed",
            maxSupportedTransactionVersion: 0,
          });
          if (!tx) return;

          this.processedSignatures.add(signature);
          const commitments = extractCommitments(tx);

          for (const { commitment, type } of commitments) {
            const leaf = bufferToBigInt(commitment);
            const root = this.tree.insert(leaf);
            console.log(
              `[LIVE ${type}] leaf #${this.tree.nextIndex - 1}: ${leaf.toString(16).slice(0, 16)}... → root ${root.toString(16).slice(0, 16)}...`
            );
          }
        } catch (err) {
          console.error(`Error processing live tx ${signature}:`, err.message);
        }
      },
      "confirmed"
    );

    console.log("Live sync active.");
  }

  /** Stop the WebSocket subscription */
  stopLiveSync() {
    if (this.subscriptionId !== null) {
      this.connection.removeOnLogsListener(this.subscriptionId);
      this.subscriptionId = null;
      console.log("Live sync stopped.");
    }
  }

  /** Verify our computed root matches on-chain root */
  async verifyRoot() {
    const [poseidonTreePda] = PublicKey.findProgramAddressSync(
      [Buffer.from("poseidon_tree")],
      PROGRAM_ID
    );

    const accountInfo = await this.connection.getAccountInfo(poseidonTreePda);
    if (!accountInfo) {
      console.warn("Could not fetch on-chain poseidon_tree account");
      return false;
    }

    // MerkleTreeState layout (after 8-byte discriminator):
    // bump: u8, _padding: [u8; 3], next_index: u32, current_root_index: u32, _padding2: [u8; 4]
    // filled_subtrees: [[u8; 32]; 20], roots: [[u8; 32]; 30]
    const data = accountInfo.data;
    const nextIndex = data.readUInt32LE(8 + 4); // offset 12
    const currentRootIndex = data.readUInt32LE(8 + 8); // offset 16

    // Roots start at offset 8 (disc) + 16 (header) + 20*32 (filled_subtrees) = 664
    const rootsOffset = 8 + 16 + 20 * 32;
    const onChainRoot = data.slice(
      rootsOffset + currentRootIndex * 32,
      rootsOffset + currentRootIndex * 32 + 32
    );
    const onChainRootBigInt = bufferToBigInt(onChainRoot);

    console.log(`On-chain next_index: ${nextIndex}`);
    console.log(`On-chain current root: ${onChainRootBigInt.toString(16)}`);
    console.log(`Indexer leaf count:    ${this.tree.leaves.length}`);
    console.log(`Indexer current root:  ${this.tree.root.toString(16)}`);

    // Check if our root matches any of the on-chain root history
    for (let i = 0; i < 30; i++) {
      const root = data.slice(rootsOffset + i * 32, rootsOffset + i * 32 + 32);
      const rootBigInt = bufferToBigInt(root);
      if (rootBigInt === this.tree.root) {
        console.log("Root MATCHES on-chain history (index " + i + ").");
        return true;
      }
    }

    if (onChainRootBigInt === this.tree.root) {
      console.log("Root MATCHES on-chain current root.");
      return true;
    }

    console.warn("Root does NOT match any on-chain root.");
    return false;
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
