import { PublicKey } from "@solana/web3.js";

export const PROGRAM_ID = new PublicKey(
  "9Bxxr2GGWoZw1mbR3Cij8jnZUpcQBXcZKVTmfDVJ2Ewy"
);

export const SPL_ACCOUNT_COMPRESSION_PROGRAM_ID = new PublicKey(
  "cmtDvXumGCrqC1Age74AVPhSRVXJMd8PJS91L8KbNCK"
);

export const SPL_NOOP_PROGRAM_ID = new PublicKey(
  "noopb9bkMVfRPU8AsbpTUg8AQkHtKwMYZiFUjNRtMmV"
);

export const MERKLE_TREE = new PublicKey(
  "4So8CTAUtoc4A5gnFeAcM9ZpuyssAjnYmHyMeUz8V9jm"
);

export const CLUSTER_URL = "https://api.devnet.solana.com";

export const INDEXER_URL = process.env.NEXT_PUBLIC_INDEXER_URL || "http://localhost:3001";

export const MERKLE_TREE_DEPTH = 20;

// Circuit artifacts (served from public/circuits/)
export const TRANSFER_WASM_URL = "/circuits/transfer.wasm";
export const TRANSFER_ZKEY_URL = "/circuits/transfer_final.zkey";
export const UNSHIELD_WASM_URL = "/circuits/unshield.wasm";
export const UNSHIELD_ZKEY_URL = "/circuits/unshield_final.zkey";
