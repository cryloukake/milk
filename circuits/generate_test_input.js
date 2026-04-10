const { buildPoseidon } = require("circomlibjs");
const crypto = require("crypto");

async function main() {
    const poseidon = await buildPoseidon();
    const F = poseidon.F;

    // Random nullifier and secret (as field elements)
    const nullifier = BigInt("0x" + crypto.randomBytes(31).toString("hex"));
    const secret = BigInt("0x" + crypto.randomBytes(31).toString("hex"));

    // commitment = Poseidon(nullifier, secret)
    const commitment = F.toObject(poseidon([nullifier, secret]));

    // nullifierHash = Poseidon(nullifier)
    const nullifierHash = F.toObject(poseidon([nullifier]));

    // Build a dummy Merkle tree of depth 20 with this commitment at index 0.
    // All other leaves are 0. We compute the root by hashing up.
    const depth = 20;
    const pathElements = [];
    const pathIndices = [];

    let currentHash = commitment;
    for (let i = 0; i < depth; i++) {
        // Sibling is the zero hash at this level
        const sibling = BigInt(0);
        pathElements.push(sibling.toString());
        pathIndices.push(0); // our leaf is always on the left

        // Parent = Poseidon(current, sibling) since index=0 means left
        currentHash = F.toObject(poseidon([currentHash, sibling]));
    }

    const root = currentHash;

    // Dummy recipient and denomination
    const recipient = BigInt("0x" + crypto.randomBytes(31).toString("hex"));
    const denomination = BigInt("1000000000"); // 1 SOL in lamports

    const input = {
        // Public inputs
        root: root.toString(),
        nullifierHash: nullifierHash.toString(),
        recipient: recipient.toString(),
        denomination: denomination.toString(),
        // Private inputs
        nullifier: nullifier.toString(),
        secret: secret.toString(),
        pathElements: pathElements,
        pathIndices: pathIndices,
    };

    const fs = require("fs");
    fs.writeFileSync("setup/test_input.json", JSON.stringify(input, null, 2));
    console.log("Test input written to setup/test_input.json");
    console.log("Commitment:", commitment.toString());
    console.log("NullifierHash:", nullifierHash.toString());
    console.log("Root:", root.toString());
}

main().catch(console.error);
