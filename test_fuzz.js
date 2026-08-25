const fs = require('fs');
const path = require('path');
const { loadWasm, writeStr } = require('./test_cases');

async function testFuzz() {
    console.log("=== Telegraph WASM Robustness & Edge Case Fuzz Suite ===");
    const wasm = await loadWasm();

    const edgeCases = [
        { name: "Empty miner answer", q: "What is 2+2?", gt: "4", ma: "" },
        { name: "Whitespace miner answer", q: "What is 2+2?", gt: "4", ma: "   \t\n  " },
        { name: "Empty question & gt", q: "", gt: "", ma: "Some answer" },
        { name: "All empty", q: "", gt: "", ma: "" },
        { name: "Emoji input", q: "Where do humans live? 🌍", gt: "Humans live on Earth 🌎", ma: "Earth is our home 🚀✨" },
        { name: "CJK / Chinese", q: "中国的首都是哪里？", gt: "中国的首都是北京。", ma: "北京是中国的首都。" },
        { name: "CJK / Japanese", q: "日本の首都はどこですか？", gt: "日本の首都は東京です。", ma: "東京です。" },
        { name: "Accented Latin", q: "¿Cuál es la capital de España?", gt: "La capital de España es Madrid.", ma: "Madrid es la capital." },
        { name: "Special symbols", q: "!@#$%^&*()", gt: "<tag>content</tag>", ma: "{}[]\\|;:'\",.<>/?" },
        { name: "Very long text (5,000 chars)", q: "Explain physics", gt: "Physics is the study of matter and energy.", ma: "A ".repeat(2500) },
        { name: "Extreme long text (10,000 chars)", q: "Q ".repeat(1000), gt: "GT ".repeat(1000), ma: "MA ".repeat(2000) }
    ];

    let passed = 0;

    for (const ec of edgeCases) {
        process.stdout.write(`Testing: ${ec.name.padEnd(36)} ... `);
        try {
            const q = writeStr(wasm, ec.q);
            const gt = writeStr(wasm, ec.gt);
            const ma = writeStr(wasm, ec.ma);

            const score = wasm.rank_answer(q.ptr, q.len, gt.ptr, gt.len, ma.ptr, ma.len);
            
            // Also test breakdown
            const bdPtr = wasm.breakdown_answer(q.ptr, q.len, gt.ptr, gt.len, ma.ptr, ma.len);
            
            // Also test cached
            const qEmbPtr = wasm.embed(q.ptr, q.len);
            const qVecCopy = wasm.alloc(384 * 4);
            new Uint8Array(wasm.memory.buffer, qVecCopy, 384 * 4).set(new Uint8Array(wasm.memory.buffer, qEmbPtr, 384 * 4));

            const gtEmbPtr = wasm.embed(gt.ptr, gt.len);
            const gtVecCopy = wasm.alloc(384 * 4);
            new Uint8Array(wasm.memory.buffer, gtVecCopy, 384 * 4).set(new Uint8Array(wasm.memory.buffer, gtEmbPtr, 384 * 4));

            const scoreCached = wasm.rank_answer_cached(qVecCopy, gtVecCopy, gt.ptr, gt.len, ma.ptr, ma.len);

            wasm.dealloc(q.ptr, q.len);
            wasm.dealloc(gt.ptr, gt.len);
            wasm.dealloc(ma.ptr, ma.len);
            wasm.dealloc(qVecCopy, 384 * 4);
            wasm.dealloc(gtVecCopy, 384 * 4);

            if (isNaN(score) || score < 0.0 || score > 1.0) {
                console.log(`FAIL (Invalid score: ${score})`);
            } else {
                console.log(`PASS (score=${score.toFixed(4)})`);
                passed++;
            }
        } catch (e) {
            console.log(`TRAP/PANIC: ${e.message}`);
        }
    }

    console.log(`\nRobustness Results: ${passed}/${edgeCases.length} (${(passed / edgeCases.length * 100).toFixed(1)}%)`);
}

testFuzz().catch(err => {
    console.error("Fuzz error:", err.message);
    process.exit(1);
});
