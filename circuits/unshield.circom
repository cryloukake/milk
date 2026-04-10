pragma circom 2.0.0;

include "./lib/merkle.circom";

/// ---------------------------------------------------------------
/// MILK Unshield Circuit (withdraw: 1-input → SOL out)
/// ---------------------------------------------------------------
///
/// Proves the prover owns a commitment in the Merkle tree and is
/// entitled to withdraw the specified amount of SOL.
///
/// Commitment format: Poseidon(amount, nullifier, secret)
///
/// What the proof attests:
///   1. Input commitment exists in the Merkle tree at the given root
///   2. Prover knows the preimage (amount, nullifier, secret)
///   3. Nullifier hash is correctly derived
///   4. The public withdrawal amount matches the committed amount
///   5. Recipient is bound to prevent front-running
///
/// Public inputs:  root, nullifierHash, amount, recipient
/// Private inputs: nullifier, secret,
///                 pathElements[depth], pathIndices[depth]
/// ---------------------------------------------------------------

template Unshield(depth) {
    // ---- Public inputs ----
    signal input root;
    signal input nullifierHash;
    signal input amount;
    signal input recipient;

    // ---- Private inputs ----
    signal input nullifier;
    signal input secret;
    signal input pathElements[depth];
    signal input pathIndices[depth];

    // ===== 1. Compute and verify input commitment =====
    // commitment = Poseidon(amount, nullifier, secret)
    // Note: amount is PUBLIC here — the on-chain program uses it for the SOL transfer.
    component inCommitment = Commitment();
    inCommitment.amount <== amount;
    inCommitment.nullifier <== nullifier;
    inCommitment.secret <== secret;

    // ===== 2. Verify Merkle inclusion =====
    component tree = MerkleTreeInclusionProof(depth);
    tree.leaf <== inCommitment.out;
    for (var i = 0; i < depth; i++) {
        tree.pathElements[i] <== pathElements[i];
        tree.pathIndices[i] <== pathIndices[i];
    }
    root === tree.root;

    // ===== 3. Verify nullifier hash =====
    component nullHash = NullifierHash();
    nullHash.nullifier <== nullifier;
    nullifierHash === nullHash.out;

    // ===== 4. Bind recipient to prevent front-running =====
    signal recipientSquare;
    recipientSquare <== recipient * recipient;
}

// Instantiate with depth = 20 (~1M commitments)
component main {public [root, nullifierHash, amount, recipient]} = Unshield(20);
