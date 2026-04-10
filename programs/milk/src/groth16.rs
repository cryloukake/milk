/// Groth16 proof verification using Solana's alt_bn128 syscalls.
///
/// A Groth16 proof over BN254 consists of:
///   - proof.a: G1 point (64 bytes)
///   - proof.b: G2 point (128 bytes)
///   - proof.c: G1 point (64 bytes)
///
/// Verification checks the pairing equation:
///   e(A, B) == e(alpha, beta) * e(vk_x, gamma) * e(C, delta)
///
/// Which is equivalent to checking:
///   e(-A, B) * e(alpha, beta) * e(vk_x, gamma) * e(C, delta) == 1
///
/// Where vk_x = vk_ic[0] + sum(public_input[i] * vk_ic[i+1])

use crate::error::MilkError;
use anchor_lang::prelude::*;

// Syscall operation constants
const ALT_BN128_ADD: u64 = 0;
const ALT_BN128_MUL: u64 = 2;
const ALT_BN128_PAIRING: u64 = 3;

// Point sizes
const G1_SIZE: usize = 64;
const G2_SIZE: usize = 128;
const SCALAR_SIZE: usize = 32;
const PAIRING_ELEMENT_SIZE: usize = G1_SIZE + G2_SIZE; // 192

// The BN254 field prime (used for negation)
const FIELD_MODULUS: [u8; 32] = [
    0x30, 0x64, 0x4e, 0x72, 0xe1, 0x31, 0xa0, 0x29,
    0xb8, 0x50, 0x45, 0xb6, 0x81, 0x81, 0x58, 0x5d,
    0x97, 0x81, 0x6a, 0x91, 0x68, 0x71, 0xca, 0x8d,
    0x3c, 0x20, 0x8c, 0x16, 0xd8, 0x7c, 0xfd, 0x47,
];

/// Groth16 proof: three curve points.
#[derive(AnchorDeserialize, AnchorSerialize, Clone)]
pub struct Proof {
    pub a: [u8; G1_SIZE],  // G1
    pub b: [u8; G2_SIZE],  // G2
    pub c: [u8; G1_SIZE],  // G1
}

/// Verification key (hardcoded per circuit).
/// For the MVP, this is compiled into the program.
/// TODO: Replace with actual ceremony output.
#[derive(AnchorDeserialize, AnchorSerialize, Clone)]
pub struct VerifyingKey {
    pub alpha_g1: [u8; G1_SIZE],
    pub beta_g2: [u8; G2_SIZE],
    pub gamma_g2: [u8; G2_SIZE],
    pub delta_g2: [u8; G2_SIZE],
    /// IC points: vk_ic[0..=n] where n = number of public inputs
    pub ic: Vec<[u8; G1_SIZE]>,
}

/// Call the alt_bn128 group operation syscall.
///
/// On-chain (target_os = "solana") this invokes the real syscall.
/// On native (IDL build, tests) this is a stub that always fails — real
/// proof verification only runs on-chain.
#[cfg(target_os = "solana")]
fn alt_bn128_op(op: u64, input: &[u8]) -> std::result::Result<Vec<u8>, MilkError> {
    let output_len = if op == ALT_BN128_PAIRING { 32usize } else { G1_SIZE };
    let mut output = vec![0u8; output_len];
    let result = unsafe {
        solana_define_syscall::definitions::sol_alt_bn128_group_op(
            op,
            input.as_ptr(),
            input.len() as u64,
            output.as_mut_ptr(),
        )
    };
    if result != 0 {
        msg!("alt_bn128 syscall failed: op={}, code={}", op, result);
        return Err(MilkError::ProofVerificationFailed);
    }
    Ok(output)
}

#[cfg(not(target_os = "solana"))]
fn alt_bn128_op(_op: u64, _input: &[u8]) -> std::result::Result<Vec<u8>, MilkError> {
    Err(MilkError::ProofVerificationFailed)
}

/// G1 point addition: P + Q
fn bn128_add(p: &[u8; G1_SIZE], q: &[u8; G1_SIZE]) -> std::result::Result<[u8; G1_SIZE], MilkError> {
    let mut input = [0u8; G1_SIZE * 2];
    input[..G1_SIZE].copy_from_slice(p);
    input[G1_SIZE..].copy_from_slice(q);
    let out = alt_bn128_op(ALT_BN128_ADD, &input)?;
    out.try_into().map_err(|_| MilkError::ProofVerificationFailed)
}

/// G1 scalar multiplication: s * P
fn bn128_mul(p: &[u8; G1_SIZE], s: &[u8; SCALAR_SIZE]) -> std::result::Result<[u8; G1_SIZE], MilkError> {
    let mut input = [0u8; G1_SIZE + SCALAR_SIZE];
    input[..G1_SIZE].copy_from_slice(p);
    input[G1_SIZE..].copy_from_slice(s);
    let out = alt_bn128_op(ALT_BN128_MUL, &input)?;
    out.try_into().map_err(|_| MilkError::ProofVerificationFailed)
}

/// Negate a G1 point (negate the y-coordinate mod p).
fn negate_g1(point: &[u8; G1_SIZE]) -> [u8; G1_SIZE] {
    let mut neg = *point;

    // Check if point is the point at infinity (all zeros)
    if neg == [0u8; G1_SIZE] {
        return neg;
    }

    // y is in bytes 32..64, big-endian. Negate: y' = FIELD_MODULUS - y
    let y = &point[32..64];
    let mut borrow: i32 = 0;
    let mut neg_y = [0u8; 32];
    for i in (0..32).rev() {
        let diff = FIELD_MODULUS[i] as i32 - y[i] as i32 - borrow;
        if diff < 0 {
            neg_y[i] = (diff + 256) as u8;
            borrow = 1;
        } else {
            neg_y[i] = diff as u8;
            borrow = 0;
        }
    }
    neg[32..64].copy_from_slice(&neg_y);
    neg
}

/// Verify a Groth16 proof given public inputs.
///
/// Public inputs are 32-byte big-endian field elements.
pub fn verify_proof(
    vk: &VerifyingKey,
    proof: &Proof,
    public_inputs: &[[u8; 32]],
) -> std::result::Result<bool, MilkError> {
    // Number of public inputs must match IC length - 1
    if public_inputs.len() + 1 != vk.ic.len() {
        return Err(MilkError::InvalidPublicInputs);
    }

    // Compute vk_x = ic[0] + sum(public_inputs[i] * ic[i+1])
    let mut vk_x = vk.ic[0];
    for (i, input) in public_inputs.iter().enumerate() {
        let term = bn128_mul(&vk.ic[i + 1], input)?;
        vk_x = bn128_add(&vk_x, &term)?;
    }

    // Build pairing input: e(-A, B) * e(alpha, beta) * e(vk_x, gamma) * e(C, delta)
    // If this product equals 1, the pairing check returns [0..0, 1] (true).
    let neg_a = negate_g1(&proof.a);

    let mut pairing_input = vec![0u8; PAIRING_ELEMENT_SIZE * 4];
    let mut offset = 0;

    // Pair 1: (-A, B)
    pairing_input[offset..offset + G1_SIZE].copy_from_slice(&neg_a);
    offset += G1_SIZE;
    pairing_input[offset..offset + G2_SIZE].copy_from_slice(&proof.b);
    offset += G2_SIZE;

    // Pair 2: (alpha, beta)
    pairing_input[offset..offset + G1_SIZE].copy_from_slice(&vk.alpha_g1);
    offset += G1_SIZE;
    pairing_input[offset..offset + G2_SIZE].copy_from_slice(&vk.beta_g2);
    offset += G2_SIZE;

    // Pair 3: (vk_x, gamma)
    pairing_input[offset..offset + G1_SIZE].copy_from_slice(&vk_x);
    offset += G1_SIZE;
    pairing_input[offset..offset + G2_SIZE].copy_from_slice(&vk.gamma_g2);
    offset += G2_SIZE;

    // Pair 4: (C, delta)
    pairing_input[offset..offset + G1_SIZE].copy_from_slice(&proof.c);
    offset += G1_SIZE;
    pairing_input[offset..offset + G2_SIZE].copy_from_slice(&vk.delta_g2);

    let result = alt_bn128_op(ALT_BN128_PAIRING, &pairing_input)?;

    // Pairing returns 32 bytes: 1 if pairing check passes, 0 otherwise (big-endian).
    Ok(result[31] == 1)
}
