"use client";

import { useMemo } from "react";
import { useConnection, useAnchorWallet } from "@solana/wallet-adapter-react";
import { AnchorProvider, Program } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import idl from "./idl.json";
import { PROGRAM_ID } from "./constants";

export function useProgram() {
  const { connection } = useConnection();
  const wallet = useAnchorWallet();

  const provider = useMemo(() => {
    if (!wallet) return null;
    return new AnchorProvider(connection, wallet, { commitment: "confirmed" });
  }, [connection, wallet]);

  const program = useMemo(() => {
    if (!provider) return null;
    return new Program(idl as any, provider);
  }, [provider]);

  return { program, provider, connection };
}

export function getPoolConfigPda(): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("pool_config")],
    PROGRAM_ID
  )[0];
}

export function getVaultPda(): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("vault")],
    PROGRAM_ID
  )[0];
}
