const fs = require('fs');
const path = require('path');
const { BENCHMARK_CASES, loadWasm, writeStr } = require('./test_cases');

function readFloat32Array(wasm, ptr, count) {
    const mem = new Float32Array(wasm.memory.buffer, ptr, count);
    return Array.from(mem);
}

async function runBreakdown() {
    const wasm = await loadWasm();
    console.log("=== Signal Breakdown Diagnostic Analysis ===");
    console.log("Signals: [Relevance, Correctness, Lexical, Length, Composite]\n");

    for (const c of BENCHMARK_CASES) {
        console.log(`--------------------------------------------------------------------------------`);
        console.log(`CASE ${c.id}: ${c.question}`);
        console.log(`Ground Truth: ${c.ground_truth}`);

        const q = writeStr(wasm, c.question);
        const gt = writeStr(wasm, c.ground_truth);

        const types = [
            { label: "EXACT", text: c.exact },
            { label: "PARAPHRASE", text: c.paraphrase },
            { label: "WRONG", text: c.wrong }
        ];

        for (const t of types) {
            const ma = writeStr(wasm, t.text);
            const bdPtr = wasm.breakdown_answer(q.ptr, q.len, gt.ptr, gt.len, ma.ptr, ma.len);
            const [rel, cor, lex, len, comp] = readFloat32Array(wasm, bdPtr, 5);
            console.log(`  [${t.label.padEnd(10)}] Rel=${rel.toFixed(3)} | Cor=${cor.toFixed(3)} | Lex=${lex.toFixed(3)} | Len=${len.toFixed(3)} => Comp=${comp.toFixed(4)} | "${t.text}"`);
            wasm.dealloc(ma.ptr, ma.len);
        }

        wasm.dealloc(q.ptr, q.len);
        wasm.dealloc(gt.ptr, gt.len);
    }
}

runBreakdown().catch(err => {
    console.error("Breakdown error:", err.message);
    process.exit(1);
});
