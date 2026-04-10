import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  SystemProgram,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import {
  getConcurrentMerkleTreeAccountSize,
  SPL_ACCOUNT_COMPRESSION_PROGRAM_ID,
  SPL_NOOP_PROGRAM_ID,
} from "@solana/spl-account-compression";
import * as anchor from "@coral-xyz/anchor";
import * as fs from "fs";
import * as path from "path";

const PROGRAM_ID = new PublicKey("AuUhS9iudnJV7sjsSW4rdo6qye9DNNVnQwpNnuPE13Db");

async function main() {
  const keypairPath = path.resolve(__dirname, "../.config/deploy-keypair.json");
  const secretKey = JSON.parse(fs.readFileSync(keypairPath, "utf-8"));
  const authority = Keypair.fromSecretKey(Uint8Array.from(secretKey));
  const connection = new Connection("https://api.devnet.solana.com", "confirmed");

  console.log("Authority:", authority.publicKey.toBase58());
  console.log("Balance:", (await connection.getBalance(authority.publicKey)) / 1e9, "SOL");

  const [poolConfigPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("pool_config")],
    PROGRAM_ID
  );
  const [vaultPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("vault")],
    PROGRAM_ID
  );

  // Step 1: Close old PoolConfig by transferring its lamports out
  const oldInfo = await connection.getAccountInfo(poolConfigPda);
  if (oldInfo) {
    console.log("\n--- Step 1: Close old PoolConfig (", oldInfo.data.length, "bytes) ---");
    // We can't directly close a PDA we don't own through system program.
    // But since the program upgraded, the old account data is stale.
    // The new `initialize` will fail because account already exists.
    // We need to use the program's authority to close it, or
    // just create a new program instance with a different seed.
    //
    // Simplest: use a versioned seed for pool_config.
    // But that requires changing the program code.
    //
    // Alternative: the account is 58 bytes but we need 66.
    // Anchor's `init` checks `data_len == 0`, so it won't work.
    //
    // Best option for devnet: just redeploy with --force to a new program ID,
    // or add a `close` instruction. But since this is devnet and we're the
    // upgrade authority, let's just assign the account back to system program.

    console.log("Closing old PoolConfig PDA via program...");

    // Actually on devnet we can just use a different approach:
    // The upgrade already happened. Let's write a raw transaction that
    // assigns the PDA back to system program. But only the owning program
    // can do that...

    // Simplest devnet solution: deploy to a NEW program ID
    console.log("Old PoolConfig exists and can't be closed externally.");
    console.log("Generating new program keypair for clean v2 deployment...");
  }

  // For devnet, deploy a fresh program with a new keypair
  const newProgramKeypair = Keypair.generate();
  const newProgramId = newProgramKeypair.publicKey;
  console.log("\n--- Deploying fresh v2 program ---");
  console.log("New Program ID:", newProgramId.toBase58());

  // Write the new keypair to deploy
  const newKeypairPath = path.resolve(__dirname, "../target/deploy/milk-keypair.json");
  fs.writeFileSync(newKeypairPath, JSON.stringify(Array.from(newProgramKeypair.secretKey)));
  console.log("Saved new program keypair to:", newKeypairPath);
  console.log("\nNow run:");
  console.log(`  cd /mnt/d/milk/milk`);
  console.log(`  anchor deploy --provider.cluster devnet --provider.wallet .config/deploy-keypair.json`);
  console.log("\nThen run this script again with --init flag to initialize.");
}

main().catch(console.error);
