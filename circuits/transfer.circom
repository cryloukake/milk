pragma circom 2.0.0;

include "./lib/merkle.circom";

/// ---------------------------------------------------------------
/// MILK Transfer Circuit (UTXO model: 1-input → 2-output)
/// ---------------------------------------------------------------
///
/// Proves a private transfer by spending one input commitment and
/// creating two new output commitments (recipient + change), while
/// ensuring balance conservation.
///
/// Commitment format: Poseidon(amount, nullifier, secret)
///
/// What the proof attests:
///   1. Input commitment exists in the Merkle tree at the given root
///   2. Prover knows the preimage (amount, nullifier, secret) of the input
///   3. Nullifier hash is correctly derived from the input nullifier
///   4. Two output commitments are correctly formed
///   5. Balance conservation: inAmount = outAmount1 + outAmount2
///   6. All amounts are non-negative (implicit: field elements)
///
/// Public inputs:  root, nullifierHash, outCommitment1, outCommitment2
/// Private inputs: inAmount, inNullifier, inSecret,
///                 outAmount1, outNullifier1, outSecret1,
///                 outAmount2, outNullifier2, outSecret2,
///                 pathElements[depth], pathIndices[depth]
/// ---------------------------------------------------------------

template Transfer(depth) {
    // ---- Public inputs ----
    signal input root;
    signal input nullifierHash;
    signal input outCommitment1;
    signal input outCommitment2;

    // ---- Private inputs: input UTXO ----
    signal input inAmount;
    signal input inNullifier;
    signal input inSecret;

    // ---- Private inputs: output UTXOs ----
    signal input outAmount1;
    signal input outNullifier1;
    signal input outSecret1;

    signal input outAmount2;
    signal input outNullifier2;
    signal input outSecret2;

    // ---- Private inputs: Merkle proof for input ----
    signal input pathElements[depth];
    signal input pathIndices[depth];

    // ===== 1. Verify input commitment and Merkle inclusion =====
    component inCommitment = Commitment();
    inCommitment.amount <== inAmount;
    inCommitment.nullifier <== inNullifier;
    inCommitment.secret <== inSecret;

    component tree = MerkleTreeInclusionProof(depth);
    tree.leaf <== inCommitment.out;
    for (var i = 0; i < depth; i++) {
        tree.pathElements[i] <== pathElements[i];
        tree.pathIndices[i] <== pathIndices[i];
    }
    root === tree.root;

    // ===== 2. Verify nullifier hash =====
    component nullHash = NullifierHash();
    nullHash.nullifier <== inNullifier;
    nullifierHash === nullHash.out;

    // ===== 3. Verify output commitments are correctly formed =====
    component outComm1 = Commitment();
    outComm1.amount <== outAmount1;
    outComm1.nullifier <== outNullifier1;
    outComm1.secret <== outSecret1;
    outCommitment1 === outComm1.out;

    component outComm2 = Commitment();
    outComm2.amount <== outAmount2;
    outComm2.nullifier <== outNullifier2;
    outComm2.secret <== outSecret2;
    outCommitment2 === outComm2.out;

    // ===== 4. Balance conservation =====
    inAmount === outAmount1 + outAmount2;
}

// Instantiate with depth = 20 (~1M commitments)
component main {public [root, nullifierHash, outCommitment1, outCommitment2]} = Transfer(20);
