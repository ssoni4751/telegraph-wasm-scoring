const fs = require('fs');
const path = require('path');
const { loadWasm, writeStr } = require('./test_cases');

async function testEmbeddings() {
    const wasm = await loadWasm();
    console.log("=== Isolated Embedding Cosine Similarity Diagnostics ===\n");

    const pairs = [
        {
            ref: "Humans live on planet Earth.",
            candidates: [
                { name: "EXACT", text: "Humans live on planet Earth." },
                { name: "PARAPHRASE", text: "Earth is the planet where human beings reside." },
                { name: "ENTITY SWAP (Mars)", text: "Humans live on planet Mars." },
                { name: "ENTITY SWAP (Jupiter)", text: "Humans live on planet Jupiter." },
                { name: "COMBINED", text: "Humans live on planet Earth and Mars." },
                { name: "NEGATION", text: "Humans do not live on planet Earth." },
                { name: "UNRELATED", text: "The capital of France is Paris." }
            ]
        },
        {
            ref: "The capital of France is Paris.",
            candidates: [
                { name: "EXACT", text: "The capital of France is Paris." },
                { name: "PARAPHRASE", text: "Paris is France's capital city." },
                { name: "ENTITY SWAP (London)", text: "The capital of France is London." },
                { name: "ENTITY SWAP (Berlin)", text: "The capital of France is Berlin." },
                { name: "NEGATION", text: "The capital of France is not Paris." },
                { name: "UNRELATED", text: "Avocados are used to make guacamole." }
            ]
        }
    ];

    for (const p of pairs) {
        console.log(`REFERENCE: "${p.ref}"`);
        const refStr = writeStr(wasm, p.ref);
        const refEmbPtr = wasm.embed(refStr.ptr, refStr.len);

        // Copy ref embedding to safe buffer
        const refVec = wasm.alloc(384 * 4);
        new Uint8Array(wasm.memory.buffer, refVec, 384 * 4).set(new Uint8Array(wasm.memory.buffer, refEmbPtr, 384 * 4));

        for (const cand of p.candidates) {
            const candStr = writeStr(wasm, cand.text);
            const candEmbPtr = wasm.embed(candStr.ptr, candStr.len);
            const sim = wasm.cosine_sim(refVec, candEmbPtr, 384);
            console.log(`  [${cand.name.padEnd(22)}] Cosine=${sim.toFixed(4)} | "${cand.text}"`);
            wasm.dealloc(candStr.ptr, candStr.len);
        }

        wasm.dealloc(refStr.ptr, refStr.len);
        wasm.dealloc(refVec, 384 * 4);
        console.log();
    }
}

testEmbeddings().catch(err => {
    console.error("Embedding diagnostic error:", err.message);
    process.exit(1);
});
