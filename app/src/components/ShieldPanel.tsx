"use client";

import { useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { LAMPORTS_PER_SOL, ComputeBudgetProgram } from "@solana/web3.js";
import * as anchor from "@coral-xyz/anchor";
import { useProgram } from "../lib/useProgram";
import {
  MERKLE_TREE,
  SPL_ACCOUNT_COMPRESSION_PROGRAM_ID,
  SPL_NOOP_PROGRAM_ID,
} from "../lib/constants";
import { generateDeposit, encodeNote, toBE32, treeInsert } from "../lib/crypto";

type Status = "idle" | "generating" | "sending" | "done" | "error";

export default function ShieldPanel() {
  const { publicKey } = useWallet();
  const { program, connection } = useProgram();
  const [amount, setAmount] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [txSig, setTxSig] = useState("");

  async function handleShield() {
    if (!program || !publicKey || !connection) return;
    const solAmount = parseFloat(amount);
    if (!solAmount || solAmount <= 0) {
      setError("Enter a valid SOL amount");
      return;
    }
    setStatus("generating");
    setError("");
    setNote("");
    setTxSig("");

    try {
      const lamports = BigInt(Math.round(solAmount * LAMPORTS_PER_SOL));
      const deposit = await generateDeposit(lamports);
      const commitmentBytes = Array.from(toBE32(deposit.commitment));
      const bnAmount = new anchor.BN(lamports.toString());

      setStatus("sending");
      const tx = await program.methods
        .shield(bnAmount, commitmentBytes)
        .accounts({
          depositor: publicKey,
          splMerkleTree: MERKLE_TREE,
          compressionProgram: SPL_ACCOUNT_COMPRESSION_PROGRAM_ID,
          logWrapper: SPL_NOOP_PROGRAM_ID,
        })
        .preInstructions([
          ComputeBudgetProgram.setComputeUnitLimit({ units: 1_400_000 }),
        ])
        .rpc();

      // Sync local tree after on-chain insertion succeeds
      await treeInsert(deposit.commitment);

      setTxSig(tx);
      setNote(encodeNote(deposit.amount, deposit.nullifier, deposit.secret));
      setStatus("done");
    } catch (err: any) {
      setError(err.message || "Shield failed");
      setStatus("error");
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <label className="block text-sm text-[var(--cream)] mb-2 font-semibold">
          Amount (SOL)
        </label>
        <input
          type="number"
          step="0.001"
          min="0"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="0.00"
          className="arcade-input arcade-input-lg"
        />
      </div>

      <div className="grid grid-cols-4 gap-2">
        {["0.1", "1", "5", "10"].map((v) => (
          <button
            key={v}
            onClick={() => setAmount(v)}
            className={`chip ${amount === v ? "chip-active" : ""}`}
          >
            {v}
          </button>
        ))}
      </div>

      <button
        onClick={handleShield}
        disabled={!publicKey || status === "generating" || status === "sending" || !amount}
        className="btn-arcade"
      >
        {status === "generating"
          ? "GENERATING..."
          : status === "sending"
          ? "CONFIRMING..."
          : !publicKey
          ? "CONNECT WALLET"
          : "SHIELD SOL"}
      </button>

      {error && (
        <div className="card-error text-[var(--pink)] text-sm font-body">
          {error}
        </div>
      )}

      {status === "done" && note && (
        <div className="space-y-3 animate-bounce-in">
          <div className="card-success text-[var(--gold)] text-sm font-semibold">
            Shielded!
          </div>
          <div>
            <label className="block text-sm text-[var(--cream)] mb-1.5 font-semibold">
              Secret Note
            </label>
            <div className="relative">
              <textarea readOnly value={note} rows={3} className="note-display" />
              <button
                onClick={() => navigator.clipboard.writeText(note)}
                className="btn-copy absolute top-2 right-2"
              >
                COPY
              </button>
            </div>
            <p className="text-xs text-[var(--pink)] mt-2 font-body">
              Save this note! It&apos;s your only way to access these funds.
            </p>
          </div>
          {txSig && (
            <p className="text-[10px] text-[var(--text-dim)] font-mono break-all">
              TX: {txSig}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
