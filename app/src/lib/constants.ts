import { PublicKey } from "@solana/web3.js";

export const PROGRAM_ID = new PublicKey(
  "75utYMqomgjvnWfRWGF4cA5QMaeYjGYkq7Ls6ZCGZdS3"
);

export const SPL_ACCOUNT_COMPRESSION_PROGRAM_ID = new PublicKey(
  "cmtDvXumGCrqC1Age74AVPhSRVXJMd8PJS91L8KbNCK"
);

export const SPL_NOOP_PROGRAM_ID = new PublicKey(
  "noopb9bkMVfRPU8AsbpTUg8AQkHtKwMYZiFUjNRtMmV"
);

export const MERKLE_TREE = new PublicKey(
  "7Z27W5hzsJvj1GBhL3iuJciuHbZ6mcLCt3ACUHBE5DSq"
);

export const CLUSTER_URL = "https://api.devnet.solana.com";

export const MERKLE_TREE_DEPTH = 20;

// Circuit artifacts (served from public/circuits/)
export const TRANSFER_WASM_URL = "/circuits/transfer.wasm";
export const TRANSFER_ZKEY_URL = "/circuits/transfer_final.zkey";
export const UNSHIELD_WASM_URL = "/circuits/unshield.wasm";
export const UNSHIELD_ZKEY_URL = "/circuits/unshield_final.zkey";
