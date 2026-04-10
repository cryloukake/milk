/**
 * MILK Tree Indexer
 *
 * Reconstructs the on-chain Poseidon Merkle tree by parsing MILK program
 * transactions and serves the tree state + Merkle proofs via REST API.
 *
 * Endpoints:
 *   GET /tree        — full tree state (leaves, root, depth, leaf count)
 *   GET /tree/root   — current root only
 *   GET /tree/path/:leafIndex — Merkle inclusion proof for a leaf
 *   GET /tree/find/:commitment — find leaf index by commitment hex
 *   GET /health      — service health + sync status
 */

import express from "express";
import cors from "cors";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { initPoseidon, PoseidonMerkleTree } from "./tree.js";
import { TreeSync } from "./sync.js";

const PORT = process.env.PORT || 3001;
const PERSISTENCE_FILE = process.env.PERSISTENCE_FILE || "./tree-state.json";

let tree = null;
let sync = null;

async function main() {
  console.log("Initializing Poseidon...");
  await initPoseidon();

  // Try to restore from persistence
  if (existsSync(PERSISTENCE_FILE)) {
    try {
      const saved = JSON.parse(readFileSync(PERSISTENCE_FILE, "utf-8"));
      console.log(`Restoring tree from ${PERSISTENCE_FILE} (${saved.leaves.length} leaves)...`);
      tree = PoseidonMerkleTree.fromJSON(saved);
      console.log(`Restored. Root: ${tree.root.toString(16)}`);
    } catch (err) {
      console.warn("Failed to restore tree state:", err.message);
      tree = new PoseidonMerkleTree();
    }
  } else {
    tree = new PoseidonMerkleTree();
  }

  // Sync from chain
  sync = new TreeSync(tree);
  await sync.syncHistorical();
  sync.startLiveSync();

  // Verify root
  await sync.verifyRoot();

  // Persist after sync
  persistTree();

  // Auto-persist every 60 seconds
  setInterval(() => persistTree(), 60_000);

  // Start API server
  const app = express();
  app.use(cors());

  app.get("/tree", (_req, res) => {
    res.json({
      root: tree.root.toString(),
      leaves: tree.leaves.map((l) => l.toString()),
      depth: tree.depth,
      leafCount: tree.leaves.length,
      nextIndex: tree.nextIndex,
    });
  });

  app.get("/tree/root", (_req, res) => {
    res.json({
      root: tree.root.toString(),
      leafCount: tree.leaves.length,
    });
  });

  app.get("/tree/path/:leafIndex", (req, res) => {
    const leafIndex = parseInt(req.params.leafIndex, 10);
    if (isNaN(leafIndex) || leafIndex < 0 || leafIndex >= tree.leaves.length) {
      return res.status(400).json({
        error: `Invalid leaf index. Must be in range [0, ${tree.leaves.length})`,
      });
    }

    try {
      const path = tree.getPath(leafIndex);
      res.json(path);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/tree/find/:commitment", (req, res) => {
    let target;
    try {
      // Accept hex (with or without 0x prefix) or decimal string
      const raw = req.params.commitment;
      target = raw.startsWith("0x") ? BigInt(raw) : BigInt(raw);
    } catch {
      return res.status(400).json({ error: "Invalid commitment format. Use hex (0x...) or decimal string." });
    }

    const index = tree.leaves.findIndex((l) => l === target);
    if (index === -1) {
      return res.status(404).json({ error: "Commitment not found in tree" });
    }

    res.json({ leafIndex: index, commitment: target.toString() });
  });

  app.get("/health", async (_req, res) => {
    res.json({
      status: "ok",
      leafCount: tree.leaves.length,
      root: tree.root.toString(16),
      liveSync: sync.subscriptionId !== null,
      processedTxCount: sync.processedSignatures.size,
    });
  });

  app.listen(PORT, () => {
    console.log(`\nMILK Tree Indexer running on http://localhost:${PORT}`);
    console.log(`  GET /tree          — full tree state`);
    console.log(`  GET /tree/root     — current root`);
    console.log(`  GET /tree/path/:i  — Merkle proof for leaf index i`);
    console.log(`  GET /tree/find/:c  — find leaf index by commitment`);
    console.log(`  GET /health        — service health`);
  });
}

function persistTree() {
  try {
    writeFileSync(PERSISTENCE_FILE, JSON.stringify(tree.toJSON()), "utf-8");
  } catch (err) {
    console.error("Failed to persist tree state:", err.message);
  }
}

// Graceful shutdown
process.on("SIGINT", () => {
  console.log("\nShutting down...");
  if (sync) sync.stopLiveSync();
  persistTree();
  process.exit(0);
});

process.on("SIGTERM", () => {
  if (sync) sync.stopLiveSync();
  persistTree();
  process.exit(0);
});

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
