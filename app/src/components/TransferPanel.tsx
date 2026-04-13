"use client";

import { useState, useMemo } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { LAMPORTS_PER_SOL, ComputeBudgetProgram } from "@solana/web3.js";
import { useProgram } from "../lib/useProgram";
import {
  MERKLE_TREE,
  SPL_ACCOUNT_COMPRESSION_PROGRAM_ID,
  SPL_NOOP_PROGRAM_ID,
} from "../lib/constants";
import { decodeNote, encodeNote, generateTransferProof, toBE32, treeInsert, tryDecodeNote } from "../lib/crypto";

type Status = "idle" | "proving" | "sending" | "done" | "error";

export default function TransferPanel() {
  const { publicKey } = useWallet();
  const { program } = useProgram();
  const [inputNote, setInputNote] = useState("");
  const [sendAmount, setSendAmount] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState("");
  const [txSig, setTxSig] = useState("");
  const [recipientNote, setRecipientNote] = useState("");
  const [changeNote, setChangeNote] = useState("");

  const decoded = useMemo(() => tryDecodeNote(inputNote), [inputNote]);
  const noteBalanceSol = decoded ? Number(decoded.amount) / LAMPORTS_PER_SOL : null;

  function reset() {
    setInputNote("");
    setSendAmount("");
    setStatus("idle");
    setError("");
    setTxSig("");
    setRecipientNote("");
    setChangeNote("");
  }

  async function handleTransfer() {
    if (!program || !publicKey) return;
    setStatus("proving");
    setError("");
    setTxSig("");
    setRecipientNote("");
    setChangeNote("");

    try {
      const { amount: inAmount, nullifier, secret } = decodeNote(inputNote);
      const sendLamports = BigInt(Math.round(parseFloat(sendAmount) * LAMPORTS_PER_SOL));

      if (sendLamports <= BigInt(0)) throw new Error("Enter a valid amount");
      if (sendLamports > inAmount)
        throw new Error(`Insufficient. Note has ${Number(inAmount) / LAMPORTS_PER_SOL} SOL`);

      const changeLamports = inAmount - sendLamports;
      const result = await generateTransferProof(inAmount, nullifier, secret, sendLamports, changeLamports);

      setStatus("sending");

      const tx = await program.methods
        .transfer(
          result.proof,
          Array.from(toBE32(result.root)),
          Array.from(toBE32(result.nullifierHash)),
          Array.from(toBE32(result.outCommitment1)),
          Array.from(toBE32(result.outCommitment2)),
        )
        .accounts({
          payer: publicKey,
          splMerkleTree: MERKLE_TREE,
          compressionProgram: SPL_ACCOUNT_COMPRESSION_PROGRAM_ID,
          logWrapper: SPL_NOOP_PROGRAM_ID,
        })
        .preInstructions([
          ComputeBudgetProgram.setComputeUnitLimit({ units: 1_400_000 }),
        ])
        .rpc();

      // Sync local tree after on-chain insertion succeeds
      await treeInsert(result.outCommitment1);
      await treeInsert(result.outCommitment2);

      setTxSig(tx);
      const d1 = result.outDeposit1;
      const d2 = result.outDeposit2;
      setRecipientNote(encodeNote(d1.amount, d1.nullifier, d1.secret));
      if (changeLamports > BigInt(0)) {
        setChangeNote(encodeNote(d2.amount, d2.nullifier, d2.secret));
      }
      setStatus("done");
    } catch (err: any) {
      setError(err.message || "Transfer failed");
      setStatus("error");
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <label className="block text-sm text-[var(--cream)] mb-2 font-semibold">
          Your Shield Note
        </label>
        <textarea
          value={inputNote}
          onChange={(e) => setInputNote(e.target.value)}
          rows={3}
          placeholder="Paste the note from your shield..."
          className="arcade-input font-mono text-xs"
        />
        {inputNote.trim() ? (
          <p className={`text-xs mt-1.5 font-body ${decoded ? "text-[var(--gold)]" : "text-[var(--pink)]"}`}>
            {decoded ? `Balance: ${noteBalanceSol} SOL` : "Invalid note"}
          </p>
        ) : (
          <p className="text-xs mt-1.5 font-body text-[var(--text-dim)]">
            Don&apos;t have a note? Go to the SHIELD tab first to deposit SOL and get one.
          </p>
        )}
      </div>

      <div>
        <label className="block text-sm text-[var(--cream)] mb-2 font-semibold">
          Amount to Send (SOL)
        </label>
        <div className="flex gap-2">
          <input
            type="number"
            step="0.001"
            min="0"
            value={sendAmount}
            onChange={(e) => setSendAmount(e.target.value)}
            placeholder="0.00"
            className="arcade-input arcade-input-lg flex-1"
          />
          {decoded && (
            <button
              onClick={() => setSendAmount((Number(decoded.amount) / LAMPORTS_PER_SOL).toString())}
              className="chip !px-4 shrink-0"
            >
              MAX
            </button>
          )}
        </div>
        <p className="text-xs text-[var(--text-dim)] mt-1.5 font-body">
          Change returns as a new note.
        </p>
      </div>

      <button
        onClick={handleTransfer}
        disabled={!publicKey || !decoded || !sendAmount || status === "proving" || status === "sending"}
        className="btn-arcade"
      >
        {status === "proving"
          ? "PROVING..."
          : status === "sending"
          ? "CONFIRMING..."
          : !publicKey
          ? "CONNECT WALLET"
          : "SEND"}
      </button>

      {error && (
        <div className="card-error text-[var(--pink)] text-sm font-body break-all">{error}</div>
      )}

      {status === "done" && (
        <div className="space-y-4 animate-bounce-in">
          <div className="card-success text-[var(--gold)] text-sm font-semibold">
            Done! Send the note below to your recipient.
          </div>

          <div>
            <label className="block text-sm text-[var(--cream)] mb-1.5 font-semibold">
              Recipient Note <span className="text-[var(--purple)] font-normal">(send this to them — they paste it in UNSHIELD)</span>
            </label>
            <div className="relative">
              <textarea readOnly value={recipientNote} rows={3} className="note-display" />
              <button onClick={() => navigator.clipboard.writeText(recipientNote)} className="btn-copy absolute top-2 right-2">COPY</button>
            </div>
          </div>

          {changeNote && (
            <div>
              <label className="block text-sm text-[var(--cream)] mb-1.5 font-semibold">
                Your Change <span className="text-[var(--pink)] font-normal">(save this!)</span>
              </label>
              <div className="relative">
                <textarea readOnly value={changeNote} rows={3} className="note-display" />
                <button onClick={() => navigator.clipboard.writeText(changeNote)} className="btn-copy absolute top-2 right-2">COPY</button>
              </div>
            </div>
          )}

          {txSig && (
            <a
              href={`https://explorer.solana.com/tx/${txSig}?cluster=devnet`}
              target="_blank"
              rel="noopener"
              className="block text-[10px] text-[var(--text-dim)] hover:text-[var(--sky)] font-mono break-all transition-colors"
            >
              TX: {txSig}
            </a>
          )}
          <button onClick={reset} className="chip w-full mt-2">
            SEND MORE
          </button>
        </div>
      )}

      {status !== "done" && (
        <div className="text-xs text-[var(--text-dim)] font-body space-y-1 pt-1">
          <p>Paste your shield note, choose how much to send.</p>
          <p>You'll get a recipient note to share and a change note to keep.</p>
        </div>
      )}
    </div>
  );
}
