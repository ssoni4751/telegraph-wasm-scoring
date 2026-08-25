const fs = require('fs');
const path = require('path');

const WASM_PATH = path.join(__dirname, 'target/wasm32-unknown-unknown/release/telegraph_scoring.wasm');

async function loadWasm() {
    if (!fs.existsSync(WASM_PATH)) {
        throw new Error(`WASM file not found at ${WASM_PATH}. Please compile first.`);
    }
    const wasmBuffer = fs.readFileSync(WASM_PATH);
    const wasmModule = await WebAssembly.instantiate(wasmBuffer, {});
    return wasmModule.instance.exports;
}

function writeString(wasm, str) {
    const encoder = new TextEncoder();
    const bytes = encoder.encode(str);
    const ptr = wasm.alloc(bytes.length);
    const mem = new Uint8Array(wasm.memory.buffer);
    mem.set(bytes, ptr);
    return { ptr, len: bytes.length };
}

function readFloat32Array(wasm, ptr, count) {
    const mem = new Float32Array(wasm.memory.buffer, ptr, count);
    return Array.from(mem);
}

async function runTests() {
    console.log("=== Telegraph WASM Scoring Module Test Suite ===");
    const wasm = await loadWasm();

    console.log("\n1. Verifying Exports...");
    const requiredExports = ['alloc', 'dealloc', 'embed', 'cosine_sim', 'bm25_score', 'rank_answer', 'rank_answer_cached', 'breakdown_answer', 'memory'];
    for (const exp of requiredExports) {
        if (wasm[exp] !== undefined) {
            console.log(`  ✓ Export '${exp}' present`);
        } else {
            console.error(`  ✗ Missing export '${exp}'`);
        }
    }

    console.log("\n2. Testing Memory Alloc/Dealloc...");
    const p = wasm.alloc(128);
    console.log(`  ✓ Allocated 128 bytes at ptr=${p}`);
    wasm.dealloc(p, 128);
    console.log(`  ✓ Deallocated 128 bytes`);

    console.log("\n3. Testing Embedding (384 dimensions)...");
    const testText = "hello world";
    const strObj = writeString(wasm, testText);
    const embedPtr = wasm.embed(strObj.ptr, strObj.len);
    const embedVec = readFloat32Array(wasm, embedPtr, 384);
    console.log(`  ✓ Embedded "${testText}", vector length: ${embedVec.length}`);
    const l2Norm = Math.sqrt(embedVec.reduce((sum, v) => sum + v * v, 0));
    console.log(`  ✓ L2 Norm: ${l2Norm.toFixed(5)} (expected ~1.0)`);
    wasm.dealloc(strObj.ptr, strObj.len);

    console.log("\n4. Testing Cosine Similarity...");
    const simSelf = wasm.cosine_sim(embedPtr, embedPtr, 384);
    console.log(`  ✓ Cosine similarity (self): ${simSelf.toFixed(5)} (expected 1.00000)`);

    console.log("\n5. Testing BM25 Lexical Scorer...");
    const qBM = writeString(wasm, "tax return filing deadline");
    const dRel = writeString(wasm, "the tax return filing deadline is april 15");
    const dIrrel = writeString(wasm, "champions league football match tonight");
    const scoreRel = wasm.bm25_score(qBM.ptr, qBM.len, dRel.ptr, dRel.len);
    const scoreIrrel = wasm.bm25_score(qBM.ptr, qBM.len, dIrrel.ptr, dIrrel.len);
    console.log(`  ✓ BM25 Relevant Score:   ${scoreRel.toFixed(4)}`);
    console.log(`  ✓ BM25 Irrelevant Score: ${scoreIrrel.toFixed(4)}`);
    if (scoreRel > scoreIrrel) {
        console.log(`  ✓ BM25 discrimination PASS`);
    } else {
        console.error(`  ✗ BM25 discrimination FAIL`);
    }
    wasm.dealloc(qBM.ptr, qBM.len);
    wasm.dealloc(dRel.ptr, dRel.len);
    wasm.dealloc(dIrrel.ptr, dIrrel.len);

    console.log("\n6. Testing Breakdown Answer...");
    const qStr = writeString(wasm, "What is the deadline for filing taxes?");
    const gtStr = writeString(wasm, "The deadline for filing federal income tax returns is April 15.");
    const maStr = writeString(wasm, "Federal tax returns must be filed by April 15 each year.");
    
    const bdPtr = wasm.breakdown_answer(qStr.ptr, qStr.len, gtStr.ptr, gtStr.len, maStr.ptr, maStr.len);
    const bd = readFloat32Array(wasm, bdPtr, 5);
    console.log(`  Relevance:   ${bd[0].toFixed(4)}`);
    console.log(`  Correctness: ${bd[1].toFixed(4)}`);
    console.log(`  Lexical:     ${bd[2].toFixed(4)}`);
    console.log(`  Length:      ${bd[3].toFixed(4)}`);
    console.log(`  Composite:   ${bd[4].toFixed(4)}`);

    console.log("\n7. Testing Cached vs Non-cached Scoring Equivalence...");
    const rankDirect = wasm.rank_answer(qStr.ptr, qStr.len, gtStr.ptr, gtStr.len, maStr.ptr, maStr.len);
    
    const qEmbPtr = wasm.embed(qStr.ptr, qStr.len);
    const qVecCopy = wasm.alloc(384 * 4);
    new Uint8Array(wasm.memory.buffer, qVecCopy, 384 * 4).set(new Uint8Array(wasm.memory.buffer, qEmbPtr, 384 * 4));

    const gtEmbPtr = wasm.embed(gtStr.ptr, gtStr.len);
    const gtVecCopy = wasm.alloc(384 * 4);
    new Uint8Array(wasm.memory.buffer, gtVecCopy, 384 * 4).set(new Uint8Array(wasm.memory.buffer, gtEmbPtr, 384 * 4));

    const rankCached = wasm.rank_answer_cached(qVecCopy, gtVecCopy, gtStr.ptr, gtStr.len, maStr.ptr, maStr.len);
    console.log(`  Direct Score: ${rankDirect.toFixed(6)}`);
    console.log(`  Cached Score: ${rankCached.toFixed(6)}`);
    const diff = Math.abs(rankDirect - rankCached);
    if (diff < 1e-5) {
        console.log(`  ✓ Cached matches Direct score (diff = ${diff})`);
    } else {
        console.error(`  ✗ Cached MISMATCH (diff = ${diff})`);
    }

    wasm.dealloc(qStr.ptr, qStr.len);
    wasm.dealloc(gtStr.ptr, gtStr.len);
    wasm.dealloc(maStr.ptr, maStr.len);
    wasm.dealloc(qVecCopy, 384 * 4);
    wasm.dealloc(gtVecCopy, 384 * 4);

    console.log("\nAll basic export tests complete.");
}

runTests().catch(err => {
    console.error("Test error:", err.message);
    process.exit(1);
});
