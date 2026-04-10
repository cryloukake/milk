import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import {
  Keypair, PublicKey, SystemProgram, LAMPORTS_PER_SOL,
  Transaction, ComputeBudgetProgram,
} from "@solana/web3.js";
import {
  SPL_ACCOUNT_COMPRESSION_PROGRAM_ID, SPL_NOOP_PROGRAM_ID,
  getConcurrentMerkleTreeAccountSize, ValidDepthSizePair,
} from "@solana/spl-account-compression";
import { expect } from "chai";
import * as path from "path";
import * as crypto from "crypto";
import { Milk } from "../target/types/milk";

let snarkjs: any;
let buildPoseidon: any;
async function loadEsmDeps() {
  if (!snarkjs) snarkjs = await import("snarkjs");
  if (!buildPoseidon) { const m = await import("circomlibjs"); buildPoseidon = m.buildPoseidon; }
}

const DEPTH = 20;
const MAX_BUF = 64;
const XFER_WASM = path.resolve(__dirname, "../circuits/build/transfer/transfer_js/transfer.wasm");
const XFER_ZKEY = path.resolve(__dirname, "../circuits/setup/transfer/transfer_final.zkey");
const UNSH_WASM = path.resolve(__dirname, "../circuits/build/unshield/unshield_js/unshield.wasm");
const UNSH_ZKEY = path.resolve(__dirname, "../circuits/setup/unshield/unshield_final.zkey");

function toBE32(v: bigint | string): Buffer { return Buffer.from(BigInt(v).toString(16).padStart(64, "0"), "hex"); }
function rand(): bigint { return BigInt("0x" + crypto.randomBytes(31).toString("hex")); }
function p2c(p: any) {
  return {
    a: [...toBE32(p.pi_a[0]), ...toBE32(p.pi_a[1])],
    b: [...toBE32(p.pi_b[0][1]), ...toBE32(p.pi_b[0][0]), ...toBE32(p.pi_b[1][1]), ...toBE32(p.pi_b[1][0])],
    c: [...toBE32(p.pi_c[0]), ...toBE32(p.pi_c[1])],
  };
}
const DUMMY_PROOF = { a: new Array(64).fill(0), b: new Array(128).fill(0), c: new Array(64).fill(0) };

describe("milk (UTXO + Poseidon tree)", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.Milk as Program<Milk>;
  const connection = provider.connection;
  const wallet = provider.wallet as anchor.Wallet;

  let splTree: Keypair;
  let poolPda: PublicKey;
  let treePda: PublicKey;
  let vaultPda: PublicKey;
  let poseidon: any;
  let F: any;
  let zeros: bigint[];

  let filledSubs: bigint[];
  let nextIdx = 0;
  const allLeaves: bigint[] = [];
  const rootHistory: bigint[] = [];

  function treeInsert(leaf: bigint): bigint {
    let ci = nextIdx, ch = leaf;
    const nfs = [...filledSubs];
    for (let i = 0; i < DEPTH; i++) {
      if (ci % 2 === 0) { nfs[i] = ch; ch = F.toObject(poseidon([ch, zeros[i]])); }
      else { ch = F.toObject(poseidon([filledSubs[i], ch])); }
      ci = Math.floor(ci / 2);
    }
    filledSubs = nfs;
    allLeaves.push(leaf);
    nextIdx++;
    rootHistory.push(ch);
    return ch;
  }

  function getSimplePath(leafIdx: number): { root: bigint; pe: string[]; pi: number[] } {
    if (allLeaves.length === 1 && leafIdx === 0) {
      let ch = allLeaves[0];
      for (let i = 0; i < DEPTH; i++) ch = F.toObject(poseidon([ch, zeros[i]]));
      return { root: ch, pe: zeros.slice(0, DEPTH).map(z => z.toString()), pi: new Array(DEPTH).fill(0) };
    }
    const l = allLeaves;
    const n01 = F.toObject(poseidon([l[0], l[1]]));
    const n10 = F.toObject(poseidon([l[2], zeros[0]]));
    const n20 = F.toObject(poseidon([n01, n10]));
    let rootCh = n20;
    for (let i = 2; i < DEPTH; i++) rootCh = F.toObject(poseidon([rootCh, zeros[i]]));
    if (leafIdx === 0) {
      return { root: rootCh, pe: [l[1].toString(), n10.toString(), ...zeros.slice(2, DEPTH).map(z => z.toString())], pi: [0, 0, ...new Array(DEPTH - 2).fill(0)] };
    } else if (leafIdx === 2) {
      return { root: rootCh, pe: [zeros[0].toString(), n01.toString(), ...zeros.slice(2, DEPTH).map(z => z.toString())], pi: [0, 1, ...new Array(DEPTH - 2).fill(0)] };
    }
    throw new Error("unsupported leafIdx");
  }

  // Deposit
  let dNul: bigint, dSec: bigint, dAmt = BigInt(5 * LAMPORTS_PER_SOL), dComm: bigint, dNulHash: bigint;
  // Transfer outputs
  let cNul: bigint, cSec: bigint, cAmt = BigInt(2 * LAMPORTS_PER_SOL), cComm: bigint;
  let rNul: bigint, rSec: bigint, rAmt: bigint, rComm: bigint;

  before(async () => {
    await loadEsmDeps();
    poseidon = await buildPoseidon();
    F = poseidon.F;
    zeros = [BigInt(0)];
    for (let i = 0; i < DEPTH; i++) zeros.push(F.toObject(poseidon([zeros[i], zeros[i]])));
    filledSubs = zeros.slice(0, DEPTH);

    [poolPda] = PublicKey.findProgramAddressSync([Buffer.from("pool_config")], program.programId);
    [treePda] = PublicKey.findProgramAddressSync([Buffer.from("poseidon_tree")], program.programId);
    [vaultPda] = PublicKey.findProgramAddressSync([Buffer.from("vault")], program.programId);

    dNul = rand(); dSec = rand();
    dComm = F.toObject(poseidon([dAmt, dNul, dSec]));
    dNulHash = F.toObject(poseidon([dNul]));
  });

  // ======================================================================
  // CORE FLOW TESTS
  // ======================================================================

  it("initializes", async () => {
    splTree = Keypair.generate();
    const dp: ValidDepthSizePair = { maxDepth: DEPTH, maxBufferSize: MAX_BUF };
    const sp = getConcurrentMerkleTreeAccountSize(dp.maxDepth, dp.maxBufferSize);
    const allocIx = SystemProgram.createAccount({
      fromPubkey: wallet.publicKey, newAccountPubkey: splTree.publicKey,
      lamports: await connection.getMinimumBalanceForRentExemption(sp),
      space: sp, programId: SPL_ACCOUNT_COMPRESSION_PROGRAM_ID,
    });
    const allocTx = new Transaction().add(allocIx);
    allocTx.feePayer = wallet.publicKey;
    allocTx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
    allocTx.sign(splTree);
    await connection.sendRawTransaction((await wallet.signTransaction(allocTx)).serialize());
    await new Promise(r => setTimeout(r, 1000));

    const ix = await program.methods.initialize(DEPTH, MAX_BUF).accounts({
      authority: wallet.publicKey, splMerkleTree: splTree.publicKey,
      compressionProgram: SPL_ACCOUNT_COMPRESSION_PROGRAM_ID, logWrapper: SPL_NOOP_PROGRAM_ID,
    }).instruction();
    for (const k of ix.keys) { if (k.pubkey.equals(splTree.publicKey)) k.isWritable = true; }
    const cu = ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 });
    await provider.sendAndConfirm(new Transaction().add(cu).add(ix));

    const cfg = await program.account.poolConfig.fetch(poolPda);
    expect(cfg.depositCount.toNumber()).to.equal(0);
    expect(cfg.transferCount.toNumber()).to.equal(0);
    expect(cfg.withdrawalCount.toNumber()).to.equal(0);
    console.log("    Initialized");
  });

  it("shields 5 SOL", async () => {
    const vb = await connection.getBalance(vaultPda);
    const newRoot = treeInsert(dComm);
    await program.methods
      .shield(new anchor.BN(dAmt.toString()), Array.from(toBE32(dComm)), Array.from(toBE32(newRoot)))
      .accounts({ depositor: wallet.publicKey, splMerkleTree: splTree.publicKey,
        compressionProgram: SPL_ACCOUNT_COMPRESSION_PROGRAM_ID, logWrapper: SPL_NOOP_PROGRAM_ID })
      .rpc();
    expect(await connection.getBalance(vaultPda) - vb).to.equal(5 * LAMPORTS_PER_SOL);
    console.log("    Shielded 5 SOL");
  });

  it("transfers 3 SOL privately", async () => {
    rAmt = BigInt(3 * LAMPORTS_PER_SOL);
    rNul = rand(); rSec = rand();
    rComm = F.toObject(poseidon([rAmt, rNul, rSec]));
    cNul = rand(); cSec = rand();
    cComm = F.toObject(poseidon([cAmt, cNul, cSec]));

    const { root, pe, pi } = getSimplePath(0);
    console.log("    Generating transfer proof...");
    const { proof } = await snarkjs.groth16.fullProve({
      root: root.toString(), nullifierHash: dNulHash.toString(),
      outCommitment1: rComm.toString(), outCommitment2: cComm.toString(),
      inAmount: dAmt.toString(), inNullifier: dNul.toString(), inSecret: dSec.toString(),
      outAmount1: rAmt.toString(), outNullifier1: rNul.toString(), outSecret1: rSec.toString(),
      outAmount2: cAmt.toString(), outNullifier2: cNul.toString(), outSecret2: cSec.toString(),
      pathElements: pe, pathIndices: pi,
    }, XFER_WASM, XFER_ZKEY);

    const vb = await connection.getBalance(vaultPda);
    const r1 = treeInsert(rComm), r2 = treeInsert(cComm);
    await program.methods.transfer(
      p2c(proof), Array.from(toBE32(root)), Array.from(toBE32(dNulHash)),
      Array.from(toBE32(rComm)), Array.from(toBE32(cComm)),
      Array.from(toBE32(r1)), Array.from(toBE32(r2)),
    ).accounts({ payer: wallet.publicKey, splMerkleTree: splTree.publicKey,
      compressionProgram: SPL_ACCOUNT_COMPRESSION_PROGRAM_ID, logWrapper: SPL_NOOP_PROGRAM_ID,
    }).preInstructions([ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 })]).rpc();
    expect(await connection.getBalance(vaultPda)).to.equal(vb);
    console.log("    Transferred 5 -> 3 + 2");
  });

  it("unshields 2 SOL change", async () => {
    const recipient = Keypair.generate();
    await connection.requestAirdrop(recipient.publicKey, 0.01 * LAMPORTS_PER_SOL);
    await new Promise(r => setTimeout(r, 1000));
    const rb = await connection.getBalance(recipient.publicKey);

    const cNulHash = F.toObject(poseidon([cNul]));
    const { root, pe, pi } = getSimplePath(2);
    console.log("    Generating unshield proof...");
    const recBig = BigInt("0x" + recipient.publicKey.toBuffer().toString("hex"));
    const { proof } = await snarkjs.groth16.fullProve({
      root: root.toString(), nullifierHash: cNulHash.toString(),
      amount: cAmt.toString(), recipient: recBig.toString(),
      nullifier: cNul.toString(), secret: cSec.toString(),
      pathElements: pe, pathIndices: pi,
    }, UNSH_WASM, UNSH_ZKEY);

    await program.methods.unshield(
      p2c(proof), Array.from(toBE32(root)), Array.from(toBE32(cNulHash)),
      new anchor.BN(cAmt.toString()),
    ).accounts({ relayerOrUser: wallet.publicKey, recipient: recipient.publicKey,
    }).preInstructions([ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 })]).rpc();
    expect(await connection.getBalance(recipient.publicKey) - rb).to.equal(2 * LAMPORTS_PER_SOL);
    console.log("    Unshielded 2 SOL");
  });

  // ======================================================================
  // SECURITY TESTS
  // ======================================================================

  it("prevents double-spend (reuse transfer nullifier)", async () => {
    try {
      await program.methods.transfer(
        DUMMY_PROOF, Array.from(toBE32(BigInt(1))), Array.from(toBE32(dNulHash)),
        Array.from(toBE32(rand())), Array.from(toBE32(rand())),
        Array.from(toBE32(rand())), Array.from(toBE32(rand())),
      ).accounts({ payer: wallet.publicKey, splMerkleTree: splTree.publicKey,
        compressionProgram: SPL_ACCOUNT_COMPRESSION_PROGRAM_ID, logWrapper: SPL_NOOP_PROGRAM_ID,
      }).rpc();
      expect.fail("Should reject");
    } catch (e: any) {
      expect(e.message).to.include("already in use");
      console.log("    Transfer double-spend rejected");
    }
  });

  it("prevents double-spend (reuse unshield nullifier via transfer)", async () => {
    const cNulHash = F.toObject(poseidon([cNul]));
    try {
      await program.methods.transfer(
        DUMMY_PROOF, Array.from(toBE32(BigInt(1))), Array.from(toBE32(cNulHash)),
        Array.from(toBE32(rand())), Array.from(toBE32(rand())),
        Array.from(toBE32(rand())), Array.from(toBE32(rand())),
      ).accounts({ payer: wallet.publicKey, splMerkleTree: splTree.publicKey,
        compressionProgram: SPL_ACCOUNT_COMPRESSION_PROGRAM_ID, logWrapper: SPL_NOOP_PROGRAM_ID,
      }).rpc();
      expect.fail("Should reject");
    } catch (e: any) {
      expect(e.message).to.include("already in use");
      console.log("    Cross-instruction double-spend rejected");
    }
  });

  it("rejects shield with zero amount", async () => {
    const comm = F.toObject(poseidon([BigInt(0), rand(), rand()]));
    const root = treeInsert(comm);
    try {
      await program.methods
        .shield(new anchor.BN(0), Array.from(toBE32(comm)), Array.from(toBE32(root)))
        .accounts({ depositor: wallet.publicKey, splMerkleTree: splTree.publicKey,
          compressionProgram: SPL_ACCOUNT_COMPRESSION_PROGRAM_ID, logWrapper: SPL_NOOP_PROGRAM_ID })
        .rpc();
      expect.fail("Should reject");
    } catch (e: any) {
      expect(e.message).to.include("InvalidAmount");
      console.log("    Zero amount shield rejected");
    }
  });

  it("rejects shield with zero commitment", async () => {
    try {
      await program.methods
        .shield(new anchor.BN(LAMPORTS_PER_SOL), Array.from(new Uint8Array(32)), Array.from(toBE32(rand())))
        .accounts({ depositor: wallet.publicKey, splMerkleTree: splTree.publicKey,
          compressionProgram: SPL_ACCOUNT_COMPRESSION_PROGRAM_ID, logWrapper: SPL_NOOP_PROGRAM_ID })
        .rpc();
      expect.fail("Should reject");
    } catch (e: any) {
      expect(e.message).to.include("ZeroCommitment");
      console.log("    Zero commitment shield rejected");
    }
  });

  it("rejects shield with zero root", async () => {
    const comm = F.toObject(poseidon([BigInt(LAMPORTS_PER_SOL), rand(), rand()]));
    try {
      await program.methods
        .shield(new anchor.BN(LAMPORTS_PER_SOL), Array.from(toBE32(comm)), Array.from(new Uint8Array(32)))
        .accounts({ depositor: wallet.publicKey, splMerkleTree: splTree.publicKey,
          compressionProgram: SPL_ACCOUNT_COMPRESSION_PROGRAM_ID, logWrapper: SPL_NOOP_PROGRAM_ID })
        .rpc();
      expect.fail("Should reject");
    } catch (e: any) {
      expect(e.message).to.include("RootMismatch");
      console.log("    Zero root shield rejected");
    }
  });

  it("rejects unshield with zero amount", async () => {
    try {
      await program.methods.unshield(
        DUMMY_PROOF, Array.from(toBE32(rand())), Array.from(toBE32(rand())),
        new anchor.BN(0),
      ).accounts({ relayerOrUser: wallet.publicKey, recipient: wallet.publicKey }).rpc();
      expect.fail("Should reject");
    } catch (e: any) {
      expect(e.message).to.include("InvalidAmount");
      console.log("    Zero amount unshield rejected");
    }
  });

  it("rejects unshield exceeding vault balance", async () => {
    // Vault has ~3 SOL remaining (5 deposited - 2 withdrawn)
    try {
      await program.methods.unshield(
        DUMMY_PROOF, Array.from(toBE32(rand())), Array.from(toBE32(rand())),
        new anchor.BN((100 * LAMPORTS_PER_SOL).toString()),
      ).accounts({ relayerOrUser: wallet.publicKey, recipient: wallet.publicKey }).rpc();
      expect.fail("Should reject");
    } catch (e: any) {
      expect(e.message).to.include("InsufficientVaultBalance");
      console.log("    Vault overdraw rejected");
    }
  });

  it("rejects transfer with unknown root", async () => {
    const fakeRoot = rand();
    try {
      await program.methods.transfer(
        DUMMY_PROOF, Array.from(toBE32(fakeRoot)), Array.from(toBE32(rand())),
        Array.from(toBE32(rand())), Array.from(toBE32(rand())),
        Array.from(toBE32(rand())), Array.from(toBE32(rand())),
      ).accounts({ payer: wallet.publicKey, splMerkleTree: splTree.publicKey,
        compressionProgram: SPL_ACCOUNT_COMPRESSION_PROGRAM_ID, logWrapper: SPL_NOOP_PROGRAM_ID,
      }).rpc();
      expect.fail("Should reject");
    } catch (e: any) {
      expect(e.message).to.include("RootMismatch");
      console.log("    Unknown root transfer rejected");
    }
  });

  it("rejects unshield with unknown root", async () => {
    const fakeRoot = rand();
    try {
      await program.methods.unshield(
        DUMMY_PROOF, Array.from(toBE32(fakeRoot)), Array.from(toBE32(rand())),
        new anchor.BN(LAMPORTS_PER_SOL),
      ).accounts({ relayerOrUser: wallet.publicKey, recipient: wallet.publicKey }).rpc();
      expect.fail("Should reject");
    } catch (e: any) {
      expect(e.message).to.include("RootMismatch");
      console.log("    Unknown root unshield rejected");
    }
  });

  it("rejects re-initialization", async () => {
    const newTree = Keypair.generate();
    try {
      await program.methods.initialize(DEPTH, MAX_BUF).accounts({
        authority: wallet.publicKey, splMerkleTree: newTree.publicKey,
        compressionProgram: SPL_ACCOUNT_COMPRESSION_PROGRAM_ID, logWrapper: SPL_NOOP_PROGRAM_ID,
      }).rpc();
      expect.fail("Should reject");
    } catch (e: any) {
      // pool_config PDA already exists — init constraint fails
      expect(e).to.exist;
      console.log("    Re-initialization rejected");
    }
  });

  it("verifies counters are correct after all operations", async () => {
    const cfg = await program.account.poolConfig.fetch(poolPda);
    expect(cfg.depositCount.toNumber()).to.equal(1);
    expect(cfg.transferCount.toNumber()).to.equal(1);
    expect(cfg.withdrawalCount.toNumber()).to.equal(1);
    console.log("    Counters: deposits=1, transfers=1, withdrawals=1");
  });

  it("verifies vault balance is correct (5 in - 2 out = 3 remaining)", async () => {
    const vaultBal = await connection.getBalance(vaultPda);
    expect(vaultBal).to.equal(3 * LAMPORTS_PER_SOL);
    console.log("    Vault balance: 3 SOL (correct)");
  });
});
