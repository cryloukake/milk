"use client";

import { useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js";
import * as anchor from "@coral-xyz/anchor";
import { useProgram } from "../lib/useProgram";
import { decodeNote, generateUnshieldProof, toBE32 } from "../lib/crypto";

type Status = "idle" | "proving" | "sending" | "done" | "error";

export default function UnshieldPanel() {
  const { publicKey } = useWallet();
  const { program } = useProgram();
  const [note, setNote] = useState("");
  const [recipient, setRecipient] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState("");
  const [txSig, setTxSig] = useState("");
  const [withdrawnAmount, setWithdrawnAmount] = useState("");

  async function handleUnshield() {
    if (!program || !publicKey) return;
    setStatus("proving");
    setError("");
    setTxSig("");
    setWithdrawnAmount("");

    try {
      const { amount, nullifier, secret } = decodeNote(note);
      let recipientKey: PublicKey;
      try {
        recipientKey = new PublicKey(recipient.trim() || publicKey.toBase58());
      } catch {
        throw new Error("Invalid recipient address");
      }

      const recipientBigInt = BigInt("0x" + Buffer.from(recipientKey.toBytes()).toString("hex"));
      const result = await generateUnshieldProof(amount, nullifier, secret, recipientBigInt);

      setStatus("sending");
      const tx = await program.methods
        .unshield(result.proof, Array.from(toBE32(result.root)), Array.from(toBE32(result.nullifierHash)), new anchor.BN(amount.toString()))
        .accounts({ relayerOrUser: publicKey, recipient: recipientKey })
        .rpc();

      setTxSig(tx);
      setWithdrawnAmount((Number(amount) / LAMPORTS_PER_SOL).toString());
      setStatus("done");
    } catch (err: any) {
      setError(err.message || "Unshield failed");
      setStatus("error");
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <label className="block text-sm text-[var(--cream)] mb-2 font-semibold">
          Secret Note
        </label>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={3}
          placeholder="Paste your secret note..."
          className="arcade-input font-mono text-xs"
        />
      </div>

      <div>
        <label className="block text-sm text-[var(--cream)] mb-2 font-semibold">
          Recipient Address
        </label>
        <input
          type="text"
          value={recipient}
          onChange={(e) => setRecipient(e.target.value)}
          placeholder="Leave empty = your wallet"
          className="arcade-input"
        />
      </div>

      <button
        onClick={handleUnshield}
        disabled={!publicKey || !note.trim() || status === "proving" || status === "sending"}
        className="btn-arcade"
      >
        {status === "proving"
          ? "PROVING..."
          : status === "sending"
          ? "CONFIRMING..."
          : !publicKey
          ? "CONNECT WALLET"
          : "UNSHIELD SOL"}
      </button>

      {error && (
        <div className="card-error text-[var(--pink)] text-sm font-body break-all">{error}</div>
      )}

      {status === "done" && txSig && (
        <div className="space-y-2 animate-bounce-in">
          <div className="card-success text-[var(--gold)] text-sm font-semibold">
            Unshielded {withdrawnAmount} SOL!
          </div>
          <p className="text-[10px] text-[var(--text-dim)] font-mono break-all">TX: {txSig}</p>
        </div>
      )}

      <div className="text-xs text-[var(--text-dim)] font-body space-y-1 pt-1">
        <p>ZK proof generated in your browser.</p>
        <p>No link between deposit and withdrawal.</p>
      </div>
    </div>
  );
}
