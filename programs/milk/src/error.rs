use anchor_lang::prelude::*;

#[error_code]
pub enum MilkError {
    #[msg("Invalid Groth16 proof")]
    InvalidProof,
    #[msg("Nullifier has already been spent")]
    NullifierAlreadySpent,
    #[msg("Merkle tree root mismatch")]
    RootMismatch,
    #[msg("Amount must be greater than zero")]
    InvalidAmount,
    #[msg("Insufficient vault balance for withdrawal")]
    InsufficientVaultBalance,
    #[msg("Proof verification syscall failed")]
    ProofVerificationFailed,
    #[msg("Invalid public inputs length")]
    InvalidPublicInputs,
    #[msg("Commitment cannot be zero")]
    ZeroCommitment,
    #[msg("Amount exceeds maximum allowed")]
    AmountTooLarge,
}
