"use client";

import { useState, useMemo } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js";
import * as anchor from "@coral-xyz/anchor";
import { useProgram } from "../lib/useProgram";
import { decodeNote, generateUnshieldProof, toBE32, tryDecodeNote } from "../lib/crypto";

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

  const decoded = useMemo(() => tryDecodeNote(note), [note]);
  const noteBalanceSol = decoded ? Number(decoded.amount) / LAMPORTS_PER_SOL : null;

  function reset() {
    setNote("");
    setRecipient("");
    setStatus("idle");
    setError("");
    setTxSig("");
    setWithdrawnAmount("");
  }

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
          Recipient Note
        </label>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={3}
          placeholder="Paste the note someone sent you..."
          className="arcade-input font-mono text-xs"
        />
        {note.trim() ? (
          <p className={`text-xs mt-1.5 font-body ${decoded ? "text-[var(--gold)]" : "text-[var(--pink)]"}`}>
            {decoded ? `Withdrawable: ${noteBalanceSol} SOL` : "Invalid note"}
          </p>
        ) : (
          <p className="text-xs mt-1.5 font-body text-[var(--text-dim)]">
            Someone needs to SEND you a note first. Ask them to shield SOL and use the SEND tab.
          </p>
        )}
      </div>

      <div>
        <label className="block text-sm text-[var(--cream)] mb-2 font-semibold">
          Recipient Address
        </label>
        <input
          type="text"
          value={recipient}
          onChange={(e) => setRecipient(e.target.value)}
          placeholder={publicKey ? publicKey.toBase58().slice(0, 20) + "..." : "Connect wallet first"}
          className="arcade-input"
        />
        <p className="text-xs text-[var(--text-dim)] mt-1.5 font-body">
          Leave empty to withdraw to your connected wallet.
        </p>
      </div>

      <button
        onClick={handleUnshield}
        disabled={!publicKey || !decoded || status === "proving" || status === "sending"}
        className="btn-arcade"
      >
        {status === "proving"
          ? "PROVING..."
          : status === "sending"
          ? "CONFIRMING..."
          : !publicKey
          ? "CONNECT WALLET"
          : decoded
          ? `UNSHIELD ${noteBalanceSol} SOL`
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
          <a
            href={`https://explorer.solana.com/tx/${txSig}?cluster=devnet`}
            target="_blank"
            rel="noopener"
            className="block text-[10px] text-[var(--text-dim)] hover:text-[var(--sky)] font-mono break-all transition-colors"
          >
            TX: {txSig}
          </a>
          <button onClick={reset} className="chip w-full mt-2">
            UNSHIELD MORE
          </button>
        </div>
      )}

      {status !== "done" && (
        <div className="text-xs text-[var(--text-dim)] font-body space-y-1 pt-1">
          <p>Paste the note you received and withdraw SOL to any wallet.</p>
          <p>ZK proof ensures no link between sender and receiver.</p>
        </div>
      )}
    </div>
  );
}
