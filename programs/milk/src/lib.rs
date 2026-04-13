use anchor_lang::prelude::*;
use anchor_lang::system_program;
use spl_account_compression::{
    cpi as spl_ac_cpi,
    program::SplAccountCompression,
    Noop,
};

pub mod error;
pub mod groth16;
pub mod poseidon_tree;
pub mod state;
pub mod vk;

use error::MilkError;
use groth16::{verify_proof, Proof};
use poseidon_tree::MerkleTreeState;
use state::*;
use vk::{get_transfer_vk, get_unshield_vk};

declare_id!("9Bxxr2GGWoZw1mbR3Cij8jnZUpcQBXcZKVTmfDVJ2Ewy");

const LAMPORTS_PER_SOL: u64 = 1_000_000_000;

#[program]
pub mod milk {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>, merkle_tree_depth: u32, max_buffer_size: u32) -> Result<()> {
        let config = &mut ctx.accounts.pool_config;
        config.authority = ctx.accounts.authority.key();
        config.bump = ctx.bumps.pool_config;
        config.vault_bump = ctx.bumps.vault;
        config.deposit_count = 0;
        config.transfer_count = 0;
        config.withdrawal_count = 0;

        // Init Poseidon tree (zero_copy)
        let mut tree = ctx.accounts.poseidon_tree.load_init()?;
        tree.init(ctx.bumps.poseidon_tree);
        drop(tree);

        // Init SPL compression tree via raw CPI
        let seeds: &[&[u8]] = &[b"pool_config", &[config.bump]];
        let disc = anchor_lang::solana_program::hash::hash(b"global:init_empty_merkle_tree");
        let mut ix_data = Vec::with_capacity(16);
        ix_data.extend_from_slice(&disc.to_bytes()[..8]);
        ix_data.extend_from_slice(&merkle_tree_depth.to_le_bytes());
        ix_data.extend_from_slice(&max_buffer_size.to_le_bytes());

        let ix = anchor_lang::solana_program::instruction::Instruction {
            program_id: ctx.accounts.compression_program.key(),
            accounts: vec![
                AccountMeta::new(ctx.accounts.spl_merkle_tree.key(), false),
                AccountMeta::new_readonly(ctx.accounts.pool_config.key(), true),
                AccountMeta::new_readonly(ctx.accounts.log_wrapper.key(), false),
            ],
            data: ix_data,
        };
        anchor_lang::solana_program::program::invoke_signed(
            &ix,
            &[
                ctx.accounts.spl_merkle_tree.to_account_info(),
                ctx.accounts.pool_config.to_account_info(),
                ctx.accounts.log_wrapper.to_account_info(),
            ],
            &[seeds],
        )?;

        msg!("MILK initialized.");
        Ok(())
    }

    /// Reset the Poseidon tree to fresh state. Authority-only.
    /// Use this to wipe corrupted tree state after protocol upgrades.
    pub fn reset_tree(ctx: Context<ResetTree>) -> Result<()> {
        let mut tree = ctx.accounts.poseidon_tree.load_mut()?;
        let bump = tree.bump;
        tree.init(bump);

        let config = &mut ctx.accounts.pool_config;
        config.deposit_count = 0;
        config.transfer_count = 0;
        config.withdrawal_count = 0;

        msg!("Tree reset to fresh state.");
        Ok(())
    }

    /// Shield: insert commitment into Poseidon tree on-chain.
    /// Root is computed on-chain via 20 Poseidon hashes (~1.2M CU).
    /// Requires compute budget of 1_400_000 CU.
    pub fn shield(ctx: Context<Shield>, amount: u64, commitment: [u8; 32]) -> Result<()> {
        require!(amount > 0, MilkError::InvalidAmount);
        require!(amount <= 1_000_000 * LAMPORTS_PER_SOL, MilkError::AmountTooLarge); // 1M SOL max
        require!(commitment != [0u8; 32], MilkError::ZeroCommitment);

        system_program::transfer(
            CpiContext::new(
                ctx.accounts.system_program.to_account_info(),
                system_program::Transfer {
                    from: ctx.accounts.depositor.to_account_info(),
                    to: ctx.accounts.vault.to_account_info(),
                },
            ),
            amount,
        )?;

        // Compute root on-chain — no longer trusting client-provided roots
        let mut tree = ctx.accounts.poseidon_tree.load_mut()?;
        tree.insert(commitment)?;
        drop(tree);

        // Also append to SPL tree for indexing
        let config = &ctx.accounts.pool_config;
        let seeds: &[&[u8]] = &[b"pool_config", &[config.bump]];
        spl_ac_cpi::append(
            CpiContext::new_with_signer(
                ctx.accounts.compression_program.to_account_info(),
                spl_ac_cpi::accounts::Modify {
                    merkle_tree: ctx.accounts.spl_merkle_tree.to_account_info(),
                    authority: ctx.accounts.pool_config.to_account_info(),
                    noop: ctx.accounts.log_wrapper.to_account_info(),
                },
                &[seeds],
            ),
            commitment,
        )?;

        let config = &mut ctx.accounts.pool_config;
        config.deposit_count = config.deposit_count.checked_add(1).unwrap();
        msg!("Shield: {} lamports.", amount);
        Ok(())
    }

    pub fn transfer(
        ctx: Context<Transfer>,
        proof: Proof,
        root: [u8; 32],
        nullifier_hash: [u8; 32],
        out_commitment_1: [u8; 32],
        out_commitment_2: [u8; 32],
    ) -> Result<()> {
        // Verify root
        {
            let tree = ctx.accounts.poseidon_tree.load()?;
            require!(tree.is_known_root(&root), MilkError::RootMismatch);
        }

        // Verify proof
        let public_inputs = vec![root, nullifier_hash, out_commitment_1, out_commitment_2];
        let vk = get_transfer_vk();
        let valid = verify_proof(&vk, &proof, &public_inputs)?;
        require!(valid, MilkError::InvalidProof);

        ctx.accounts.nullifier.nullifier = nullifier_hash;

        // Insert both output commitments on-chain (40 Poseidon hashes total)
        {
            let mut tree = ctx.accounts.poseidon_tree.load_mut()?;
            tree.insert(out_commitment_1)?;
            tree.insert(out_commitment_2)?;
        }

        // Also SPL tree
        let config = &ctx.accounts.pool_config;
        let seeds: &[&[u8]] = &[b"pool_config", &[config.bump]];
        spl_ac_cpi::append(
            CpiContext::new_with_signer(
                ctx.accounts.compression_program.to_account_info(),
                spl_ac_cpi::accounts::Modify {
                    merkle_tree: ctx.accounts.spl_merkle_tree.to_account_info(),
                    authority: ctx.accounts.pool_config.to_account_info(),
                    noop: ctx.accounts.log_wrapper.to_account_info(),
                },
                &[seeds],
            ),
            out_commitment_1,
        )?;
        spl_ac_cpi::append(
            CpiContext::new_with_signer(
                ctx.accounts.compression_program.to_account_info(),
                spl_ac_cpi::accounts::Modify {
                    merkle_tree: ctx.accounts.spl_merkle_tree.to_account_info(),
                    authority: ctx.accounts.pool_config.to_account_info(),
                    noop: ctx.accounts.log_wrapper.to_account_info(),
                },
                &[seeds],
            ),
            out_commitment_2,
        )?;

        let config = &mut ctx.accounts.pool_config;
        config.transfer_count = config.transfer_count.checked_add(1).unwrap();
        msg!("Transfer: 1 nullified, 2 created.");
        Ok(())
    }

    pub fn unshield(
        ctx: Context<Unshield>,
        proof: Proof,
        root: [u8; 32],
        nullifier_hash: [u8; 32],
        amount: u64,
    ) -> Result<()> {
        require!(amount > 0, MilkError::InvalidAmount);
        require!(amount <= 1_000_000 * LAMPORTS_PER_SOL, MilkError::AmountTooLarge);

        // Check vault balance BEFORE expensive proof verification
        let vault_lamports = ctx.accounts.vault.lamports();
        require!(vault_lamports >= amount, MilkError::InsufficientVaultBalance);

        // Verify root
        {
            let tree = ctx.accounts.poseidon_tree.load()?;
            require!(tree.is_known_root(&root), MilkError::RootMismatch);
        }

        let recipient_bytes = ctx.accounts.recipient.key().to_bytes();
        let mut amount_bytes = [0u8; 32];
        amount_bytes[24..32].copy_from_slice(&amount.to_be_bytes());

        let public_inputs = vec![root, nullifier_hash, amount_bytes, recipient_bytes];
        let vk = get_unshield_vk();
        let valid = verify_proof(&vk, &proof, &public_inputs)?;
        require!(valid, MilkError::InvalidProof);

        ctx.accounts.nullifier.nullifier = nullifier_hash;

        let config = &ctx.accounts.pool_config;
        let vault_seeds: &[&[u8]] = &[b"vault", &[config.vault_bump]];
        system_program::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.system_program.to_account_info(),
                system_program::Transfer {
                    from: ctx.accounts.vault.to_account_info(),
                    to: ctx.accounts.recipient.to_account_info(),
                },
                &[vault_seeds],
            ),
            amount,
        )?;

        let config = &mut ctx.accounts.pool_config;
        config.withdrawal_count = config.withdrawal_count.checked_add(1).unwrap();
        msg!("Unshield: {} lamports.", amount);
        Ok(())
    }
}

// ============================================================================
// Account contexts
// ============================================================================

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        init, payer = authority, space = PoolConfig::SIZE,
        seeds = [b"pool_config"], bump,
    )]
    pub pool_config: Account<'info, PoolConfig>,

    /// Poseidon Merkle tree — zero_copy for large account.
    #[account(
        init, payer = authority, space = MerkleTreeState::SIZE,
        seeds = [b"poseidon_tree"], bump,
    )]
    pub poseidon_tree: AccountLoader<'info, MerkleTreeState>,

    /// CHECK: SOL vault PDA.
    #[account(mut, seeds = [b"vault"], bump)]
    pub vault: SystemAccount<'info>,

    /// CHECK: SPL compression tree (pre-allocated).
    #[account(mut)]
    pub spl_merkle_tree: UncheckedAccount<'info>,

    pub compression_program: Program<'info, SplAccountCompression>,
    /// CHECK: SPL Noop.
    pub log_wrapper: Program<'info, Noop>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ResetTree<'info> {
    #[account(mut, constraint = authority.key() == pool_config.authority @ MilkError::InvalidProof)]
    pub authority: Signer<'info>,

    #[account(mut, seeds = [b"pool_config"], bump = pool_config.bump)]
    pub pool_config: Account<'info, PoolConfig>,

    #[account(mut, seeds = [b"poseidon_tree"], bump)]
    pub poseidon_tree: AccountLoader<'info, MerkleTreeState>,
}

#[derive(Accounts)]
#[instruction(amount: u64, commitment: [u8; 32])]
pub struct Shield<'info> {
    #[account(mut)]
    pub depositor: Signer<'info>,

    #[account(mut, seeds = [b"pool_config"], bump = pool_config.bump)]
    pub pool_config: Account<'info, PoolConfig>,

    #[account(mut, seeds = [b"poseidon_tree"], bump)]
    pub poseidon_tree: AccountLoader<'info, MerkleTreeState>,

    /// CHECK: SOL vault PDA.
    #[account(mut, seeds = [b"vault"], bump = pool_config.vault_bump)]
    pub vault: SystemAccount<'info>,

    /// CHECK: SPL compression tree.
    #[account(mut)]
    pub spl_merkle_tree: UncheckedAccount<'info>,

    pub compression_program: Program<'info, SplAccountCompression>,
    /// CHECK: SPL Noop.
    pub log_wrapper: Program<'info, Noop>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(
    proof: Proof, root: [u8; 32], nullifier_hash: [u8; 32],
    out_commitment_1: [u8; 32], out_commitment_2: [u8; 32],
)]
pub struct Transfer<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    #[account(mut, seeds = [b"pool_config"], bump = pool_config.bump)]
    pub pool_config: Account<'info, PoolConfig>,

    #[account(mut, seeds = [b"poseidon_tree"], bump)]
    pub poseidon_tree: AccountLoader<'info, MerkleTreeState>,

    #[account(
        init, payer = payer, space = NullifierAccount::SIZE,
        seeds = [b"nullifier", nullifier_hash.as_ref()], bump,
    )]
    pub nullifier: Account<'info, NullifierAccount>,

    /// CHECK: SPL compression tree.
    #[account(mut)]
    pub spl_merkle_tree: UncheckedAccount<'info>,

    pub compression_program: Program<'info, SplAccountCompression>,
    /// CHECK: SPL Noop.
    pub log_wrapper: Program<'info, Noop>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(proof: Proof, root: [u8; 32], nullifier_hash: [u8; 32], amount: u64)]
pub struct Unshield<'info> {
    #[account(mut)]
    pub relayer_or_user: Signer<'info>,

    #[account(mut, seeds = [b"pool_config"], bump = pool_config.bump)]
    pub pool_config: Account<'info, PoolConfig>,

    #[account(seeds = [b"poseidon_tree"], bump)]
    pub poseidon_tree: AccountLoader<'info, MerkleTreeState>,

    /// CHECK: SOL vault PDA.
    #[account(mut, seeds = [b"vault"], bump = pool_config.vault_bump)]
    pub vault: SystemAccount<'info>,

    #[account(
        init, payer = relayer_or_user, space = NullifierAccount::SIZE,
        seeds = [b"nullifier", nullifier_hash.as_ref()], bump,
    )]
    pub nullifier: Account<'info, NullifierAccount>,

    /// CHECK: Recipient.
    #[account(mut)]
    pub recipient: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
}
