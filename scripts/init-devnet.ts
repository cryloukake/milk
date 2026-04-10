import * as anchor from "@coral-xyz/anchor";
import {
  Keypair,
  PublicKey,
  SystemProgram,
  Connection,
  Transaction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import {
  getConcurrentMerkleTreeAccountSize,
  SPL_ACCOUNT_COMPRESSION_PROGRAM_ID,
  SPL_NOOP_PROGRAM_ID,
} from "@solana/spl-account-compression";
import * as fs from "fs";
import * as path from "path";

const PROGRAM_ID = new PublicKey("9Bxxr2GGWoZw1mbR3Cij8jnZUpcQBXcZKVTmfDVJ2Ewy");
const MERKLE_TREE_DEPTH = 20;
const MAX_BUFFER_SIZE = 64;

async function main() {
  const keypairPath = path.resolve(__dirname, "../.config/deploy-keypair.json");
  const secretKey = JSON.parse(fs.readFileSync(keypairPath, "utf-8"));
  const authority = Keypair.fromSecretKey(Uint8Array.from(secretKey));
  const connection = new Connection("https://api.devnet.solana.com", "confirmed");

  console.log("Authority:", authority.publicKey.toBase58());
  console.log("Balance:", (await connection.getBalance(authority.publicKey)) / 1e9, "SOL");

  const wallet = new anchor.Wallet(authority);
  const provider = new anchor.AnchorProvider(connection, wallet, { commitment: "confirmed" });
  const idlPath = path.resolve(__dirname, "../target/idl/milk.json");
  const idl = JSON.parse(fs.readFileSync(idlPath, "utf-8"));
  const program = new anchor.Program(idl, provider);

  const [poolConfigPda] = PublicKey.findProgramAddressSync([Buffer.from("pool_config")], PROGRAM_ID);
  const [vaultPda] = PublicKey.findProgramAddressSync([Buffer.from("vault")], PROGRAM_ID);

  const existing = await connection.getAccountInfo(poolConfigPda);
  if (existing) {
    console.log("Protocol already initialized!");
    return;
  }

  const merkleTreeKeypair = Keypair.generate();
  console.log("Merkle tree:", merkleTreeKeypair.publicKey.toBase58());

  const treeSpace = getConcurrentMerkleTreeAccountSize(MERKLE_TREE_DEPTH, MAX_BUFFER_SIZE);
  const treeRent = await connection.getMinimumBalanceForRentExemption(treeSpace);
  console.log("Tree rent:", treeRent / 1e9, "SOL");

  // Allocate tree
  console.log("\nAllocating Merkle tree...");
  const allocIx = SystemProgram.createAccount({
    fromPubkey: authority.publicKey,
    newAccountPubkey: merkleTreeKeypair.publicKey,
    lamports: treeRent,
    space: treeSpace,
    programId: SPL_ACCOUNT_COMPRESSION_PROGRAM_ID,
  });
  const allocTx = new Transaction().add(allocIx);
  await sendAndConfirmTransaction(connection, allocTx, [authority, merkleTreeKeypair], { commitment: "confirmed" });

  // Initialize
  console.log("Initializing protocol...");
  await program.methods
    .initialize(MERKLE_TREE_DEPTH, MAX_BUFFER_SIZE)
    .accounts({
      authority: authority.publicKey,
      splMerkleTree: merkleTreeKeypair.publicKey,
      compressionProgram: SPL_ACCOUNT_COMPRESSION_PROGRAM_ID,
      logWrapper: SPL_NOOP_PROGRAM_ID,
    })
    .rpc();

  const poolConfig = await (program.account as any).poolConfig.fetch(poolConfigPda);
  console.log("\n--- Protocol initialized! ---");
  console.log("Program ID:", PROGRAM_ID.toBase58());
  console.log("Merkle tree:", merkleTreeKeypair.publicKey.toBase58());
  console.log("Pool config:", poolConfigPda.toBase58());
  console.log("Vault:", vaultPda.toBase58());
  console.log("Deposits:", poolConfig.depositCount.toNumber());
  console.log("Transfers:", poolConfig.transferCount.toNumber());
  console.log("Withdrawals:", poolConfig.withdrawalCount.toNumber());

  // Save config
  const config = {
    programId: PROGRAM_ID.toBase58(),
    merkleTree: merkleTreeKeypair.publicKey.toBase58(),
    poolConfig: poolConfigPda.toBase58(),
    vault: vaultPda.toBase58(),
    cluster: "devnet",
  };
  fs.writeFileSync(path.resolve(__dirname, "../devnet-config.json"), JSON.stringify(config, null, 2));
  console.log("\nSaved to devnet-config.json");
}

main().catch(console.error);
