# MILK — Memory Isolation Layer Kit

> Privacy is a state transition, not a place.

MILK is a UTXO-style privacy protocol for Solana. Zero-knowledge private transfers with arbitrary amounts. No pools. No relayers. No trust.

## How It Works

There is no shared pool where users deposit tokens. Each user has their own private balance commitment stored in a Poseidon Merkle tree. When you send privately, you nullify your old commitment and create two new ones — one for the recipient, one for your change. A Groth16 ZK proof verifies balance conservation entirely in your browser.

### Three Operations

| Operation | What happens | ZK Proof? | SOL moves? |
|-----------|-------------|-----------|------------|
| **Shield** | Deposit SOL → vault, commitment → Merkle tree | No | User → Vault |
| **Transfer** | Nullify 1 input → create 2 outputs (recipient + change) | Yes | No |
| **Unshield** | Nullify 1 input → SOL to recipient wallet | Yes | Vault → Recipient |

### Architecture

```
┌─────────────────────────────────────────────┐
│                   Client                     │
│  Poseidon hashing · Groth16 proof gen       │
│  snarkjs · circomlibjs · Next.js            │
└─────────────┬───────────────────┬───────────┘
              │                   │
              ▼                   ▼
┌─────────────────────┐  ┌────────────────────┐
│   Solana Program    │  │   Circuit (Circom)  │
│   (Anchor 0.31.1)   │  │   transfer.circom   │
│                     │  │   unshield.circom   │
│ • Poseidon Merkle   │  │                    │
│   tree (on-chain)   │  │ • Merkle inclusion │
│ • Root history (30) │  │ • Balance conserve │
│ • Nullifier PDAs    │  │ • Nullifier derive │
│ • SOL vault PDA     │  │ • Commitment form  │
└─────────────────────┘  └────────────────────┘
```

**Commitment format:** `Poseidon(amount, nullifier, secret)`

**Anonymity set** = total commitments in the Merkle tree. Every user makes everyone more private.

## Tech Stack

- **On-chain:** Anchor 0.31.1, SPL Account Compression, light-poseidon, alt_bn128 syscalls
- **Circuits:** Circom 2.0, Groth16, snarkjs
- **Frontend:** Next.js 16, Tailwind, Solana wallet adapter
- **ZK Verification:** Groth16 pairing check via Solana's `sol_alt_bn128_group_op` syscall

## Quick Start

### Prerequisites

- Rust 1.87+
- Anchor CLI 0.31.1 (`avm install 0.31.1`)
- Solana CLI 2.2+ (`agave-install init 2.2.14`)
- Node.js 20+
- Yarn
- Circom 2.2+

### Build & Test

```bash
# Clone
git clone https://github.com/cryloukake/milk.git
cd milk

# Install dependencies
yarn install
cd circuits && yarn install && cd ..
cd app && yarn install && cd ..

# Build the Anchor program
anchor build

# Compile circuits (if needed)
cd circuits
circom transfer.circom --r1cs --wasm --sym --output build/transfer/
circom unshield.circom --r1cs --wasm --sym --output build/unshield/
cd ..

# Start local validator (requires SPL programs)
solana program dump cmtDvXumGCrqC1Age74AVPhSRVXJMd8PJS91L8KbNCK /tmp/spl_account_compression.so --url mainnet-beta
solana program dump noopb9bkMVfRPU8AsbpTUg8AQkHtKwMYZiFUjNRtMmV /tmp/spl_noop.so --url mainnet-beta
solana-test-validator \
  --bpf-program cmtDvXumGCrqC1Age74AVPhSRVXJMd8PJS91L8KbNCK /tmp/spl_account_compression.so \
  --bpf-program noopb9bkMVfRPU8AsbpTUg8AQkHtKwMYZiFUjNRtMmV /tmp/spl_noop.so &

# Deploy and test
solana airdrop 100
anchor deploy --provider.cluster localnet --provider.wallet ~/.config/solana/id.json
ANCHOR_PROVIDER_URL=http://127.0.0.1:8899 ANCHOR_WALLET=~/.config/solana/id.json \
  npx ts-mocha -p ./tsconfig.json -t 1000000 'tests/**/*.ts'
```

### Run Frontend

```bash
cd app
yarn dev
# Opens at http://localhost:3000
```

## Devnet Deployment

| Item | Address |
|------|---------|
| Program | `9Bxxr2GGWoZw1mbR3Cij8jnZUpcQBXcZKVTmfDVJ2Ewy` |
| Merkle Tree | `4So8CTAUtoc4A5gnFeAcM9ZpuyssAjnYmHyMeUz8V9jm` |
| Pool Config | `8uc2bNmJNjKfxNi2LoDWSnqgNhT79wNCvR8xp2m5N9mZ` |
| Vault | `EpbhA5EZdsxFdCxgy3nk6RKszsCv1rRE2V9V23D5pB68` |

## Project Structure

```
milk/
├── programs/milk/src/     # Anchor program
│   ├── lib.rs             # Instructions: shield, transfer, unshield
│   ├── poseidon_tree.rs   # On-chain incremental Poseidon Merkle tree
│   ├── groth16.rs         # Groth16 verifier (alt_bn128 syscalls)
│   ├── vk.rs              # Verification keys (transfer + unshield)
│   ├── state.rs           # PoolConfig, NullifierAccount
│   └── error.rs           # Error codes
├── circuits/              # Circom 2.0 circuits
│   ├── transfer.circom    # 1-in → 2-out with balance conservation
│   ├── unshield.circom    # 1-in → SOL withdrawal
│   └── lib/merkle.circom  # Shared: MerkleTreeInclusionProof, Commitment
├── app/                   # Next.js 16 frontend
│   ├── src/app/           # Pages (arcade theme)
│   ├── src/components/    # ShieldPanel, TransferPanel, UnshieldPanel
│   └── src/lib/           # crypto.ts, useProgram.ts, constants.ts
├── tests/milk.ts          # Integration tests (5 passing)
├── scripts/               # Devnet deploy & init scripts
└── devnet-config.json     # Current devnet addresses
```

## Circuit Stats

| Circuit | Constraints | Public Inputs |
|---------|------------|---------------|
| transfer | 5,928 | root, nullifierHash, outCommitment1, outCommitment2 |
| unshield | 5,401 | root, nullifierHash, amount, recipient |

## Security Model

- **Nullifier PDAs** prevent double-spend (Anchor `init` constraint)
- **Groth16 proofs** verify balance conservation and commitment ownership
- **Root history** (last 30 roots) allows proofs against recent tree states
- **Vault balance check** prevents withdrawing more than deposited
- **Recipient binding** in proofs prevents front-running

### Known Limitations (MVP)

- Shield roots are client-provided (optimistic — not verified on-chain). Production should compute Poseidon on-chain or use commit-reveal.
- Dev ceremony for trusted setup. Production needs Hermez ptau.
- Single Merkle tree per protocol instance.

## License

MIT

---

**MILK** — Zero pools. Zero relayers. Zero trust.

Website: [milkprotocol.tech](https://milkprotocol.tech)
