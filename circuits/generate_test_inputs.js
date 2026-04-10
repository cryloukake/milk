const { buildPoseidon } = require("circomlibjs");
const crypto = require("crypto");
const fs = require("fs");

async function main() {
    const poseidon = await buildPoseidon();
    const F = poseidon.F;
    const depth = 20;

    function randField() {
        return BigInt("0x" + crypto.randomBytes(31).toString("hex"));
    }

    function commitment(amount, nullifier, secret) {
        return F.toObject(poseidon([amount, nullifier, secret]));
    }

    function nullifierHash(nullifier) {
        return F.toObject(poseidon([nullifier]));
    }

    function buildPath(leaf) {
        const pathElements = [];
        const pathIndices = [];
        let cur = leaf;
        for (let i = 0; i < depth; i++) {
            pathElements.push("0");
            pathIndices.push(0);
            cur = F.toObject(poseidon([cur, BigInt(0)]));
        }
        return { root: cur, pathElements, pathIndices };
    }

    // === Transfer test input ===
    const inAmount = BigInt("5000000000"); // 5 SOL
    const inNullifier = randField();
    const inSecret = randField();
    const inComm = commitment(inAmount, inNullifier, inSecret);
    const { root, pathElements, pathIndices } = buildPath(inComm);
    const inNullHash = nullifierHash(inNullifier);

    const outAmount1 = BigInt("3000000000"); // 3 SOL to recipient
    const outNullifier1 = randField();
    const outSecret1 = randField();
    const outComm1 = commitment(outAmount1, outNullifier1, outSecret1);

    const outAmount2 = BigInt("2000000000"); // 2 SOL change
    const outNullifier2 = randField();
    const outSecret2 = randField();
    const outComm2 = commitment(outAmount2, outNullifier2, outSecret2);

    const transferInput = {
        root: root.toString(),
        nullifierHash: inNullHash.toString(),
        outCommitment1: outComm1.toString(),
        outCommitment2: outComm2.toString(),
        inAmount: inAmount.toString(),
        inNullifier: inNullifier.toString(),
        inSecret: inSecret.toString(),
        outAmount1: outAmount1.toString(),
        outNullifier1: outNullifier1.toString(),
        outSecret1: outSecret1.toString(),
        outAmount2: outAmount2.toString(),
        outNullifier2: outNullifier2.toString(),
        outSecret2: outSecret2.toString(),
        pathElements,
        pathIndices,
    };
    fs.writeFileSync("setup/transfer/test_input.json", JSON.stringify(transferInput, null, 2));
    console.log("Transfer test input written");

    // === Unshield test input ===
    const uAmount = BigInt("1000000000"); // 1 SOL
    const uNullifier = randField();
    const uSecret = randField();
    const uComm = commitment(uAmount, uNullifier, uSecret);
    const uPath = buildPath(uComm);
    const uNullHash = nullifierHash(uNullifier);
    const recipient = randField();

    const unshieldInput = {
        root: uPath.root.toString(),
        nullifierHash: uNullHash.toString(),
        amount: uAmount.toString(),
        recipient: recipient.toString(),
        nullifier: uNullifier.toString(),
        secret: uSecret.toString(),
        pathElements: uPath.pathElements,
        pathIndices: uPath.pathIndices,
    };
    fs.writeFileSync("setup/unshield/test_input.json", JSON.stringify(unshieldInput, null, 2));
    console.log("Unshield test input written");
}

main().catch(console.error);
