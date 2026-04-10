use anchor_lang::prelude::*;

/// Global protocol configuration stored as a PDA.
#[account]
pub struct PoolConfig {
    /// Authority that can manage the protocol (e.g., pause, upgrade).
    pub authority: Pubkey,
    /// Bump seed for the PDA.
    pub bump: u8,
    /// Bump seed for the SOL vault PDA.
    pub vault_bump: u8,
    /// Total number of shield (deposit) operations.
    pub deposit_count: u64,
    /// Total number of private transfers.
    pub transfer_count: u64,
    /// Total number of unshield (withdrawal) operations.
    pub withdrawal_count: u64,
}

impl PoolConfig {
    // 8 (discriminator) + 32 (authority) + 1 (bump) + 1 (vault_bump)
    // + 8 (deposit_count) + 8 (transfer_count) + 8 (withdrawal_count)
    pub const SIZE: usize = 8 + 32 + 1 + 1 + 8 + 8 + 8;
}

/// PDA account that marks a nullifier as spent. Existence = spent.
#[account]
pub struct NullifierAccount {
    /// The nullifier hash (32 bytes).
    pub nullifier: [u8; 32],
}

impl NullifierAccount {
    pub const SIZE: usize = 8 + 32;
}
