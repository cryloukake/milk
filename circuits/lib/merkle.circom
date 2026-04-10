pragma circom 2.0.0;

include "../node_modules/circomlib/circuits/poseidon.circom";
include "../node_modules/circomlib/circuits/mux1.circom";

/// Poseidon-based Merkle tree inclusion proof.
/// Verifies that a leaf exists at a given path in a tree with the given root.
template MerkleTreeInclusionProof(depth) {
    signal input leaf;
    signal input pathElements[depth];
    signal input pathIndices[depth];
    signal output root;

    component hashers[depth];
    component mux[depth];

    signal levelHashes[depth + 1];
    levelHashes[0] <== leaf;

    for (var i = 0; i < depth; i++) {
        // pathIndices[i] must be 0 or 1
        pathIndices[i] * (1 - pathIndices[i]) === 0;

        // Select ordering based on path index
        mux[i] = MultiMux1(2);
        mux[i].c[0][0] <== levelHashes[i];
        mux[i].c[0][1] <== pathElements[i];
        mux[i].c[1][0] <== pathElements[i];
        mux[i].c[1][1] <== levelHashes[i];
        mux[i].s <== pathIndices[i];

        // Hash the pair: Poseidon(left, right)
        hashers[i] = Poseidon(2);
        hashers[i].inputs[0] <== mux[i].out[0];
        hashers[i].inputs[1] <== mux[i].out[1];

        levelHashes[i + 1] <== hashers[i].out;
    }

    root <== levelHashes[depth];
}

/// Compute a MILK UTXO commitment: Poseidon(amount, nullifier, secret)
template Commitment() {
    signal input amount;
    signal input nullifier;
    signal input secret;
    signal output out;

    component hasher = Poseidon(3);
    hasher.inputs[0] <== amount;
    hasher.inputs[1] <== nullifier;
    hasher.inputs[2] <== secret;
    out <== hasher.out;
}

/// Compute nullifier hash: Poseidon(nullifier)
template NullifierHash() {
    signal input nullifier;
    signal output out;

    component hasher = Poseidon(1);
    hasher.inputs[0] <== nullifier;
    out <== hasher.out;
}
