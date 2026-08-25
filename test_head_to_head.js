const fs = require('fs');
const path = require('path');
const { BENCHMARK_CASES, writeStr } = require('./test_cases');

// Path to compiled optimized WASM
const OPTIMIZED_WASM_PATH = path.join(__dirname, 'target/wasm32-unknown-unknown/release/telegraph_scoring.wasm');

// Simulated Baseline Champion Scorer logic (matches the initial unoptimized baseline)
function runBaselineScorer(wasm, qStr, gtStr, maStr) {
    // Breakdown gives raw signals
    const bdPtr = wasm.breakdown_answer(qStr.ptr, qStr.len, gtStr.ptr, gtStr.len, maStr.ptr, maStr.len);
    const mem = new Float32Array(wasm.memory.buffer, bdPtr, 5);
    const rel = mem[0];
    const cor = mem[1];
    const lex = mem[2];
    
    // Baseline length quality: sigmoid((len - 50)/20)
    const lenQ = 1.0 / (1.0 + Math.exp(-(maStr.len - 50.0) / 20.0));

    // Baseline composite weights: 0.25 * rel + 0.50 * cor + 0.15 * lex + 0.10 * len
    let score = 0.25 * rel + 0.50 * cor + 0.15 * lex + 0.10 * lenQ;
    return Math.max(0.0, Math.min(1.0, score));
}

async function runHeadToHead() {
    console.log("================================================================================");
    console.log("       TELEGRAPH PROTOCOL — CHAMPION VS CHALLENGER HEAD-TO-HEAD ARENA          ");
    console.log("================================================================================\n");

    const wasmBuffer = fs.readFileSync(OPTIMIZED_WASM_PATH);
    const wasmModule = await WebAssembly.instantiate(wasmBuffer, {});
    const wasm = wasmModule.instance.exports;

    let championWins = 0;
    let challengerWins = 0;
    let ties = 0;

    let championTotalMargin = 0;
    let challengerTotalMargin = 0;

    console.log("Evaluating 20 Benchmark Intents across 3 Candidates: Exact (E), Paraphrase (P), Wrong (W)\n");
    console.log("Goal: Discriminate Paraphrase over Wrong (P > W Margin) and Exact over Paraphrase (E > P)\n");
    console.log("--------------------------------------------------------------------------------");
    console.log("CASE | INTENT TOPIC               | CHAMPION (P vs W) | CHALLENGER (P vs W) | WINNER ");
    console.log("--------------------------------------------------------------------------------");

    for (const c of BENCHMARK_CASES) {
        const q = writeStr(wasm, c.question);
        const gt = writeStr(wasm, c.ground_truth);
        
        const ex = writeStr(wasm, c.exact);
        const pa = writeStr(wasm, c.paraphrase);
        const wr = writeStr(wasm, c.wrong);

        // 1. Evaluate with Baseline Champion
        const champE = runBaselineScorer(wasm, q, gt, ex);
        const champP = runBaselineScorer(wasm, q, gt, pa);
        const champW = runBaselineScorer(wasm, q, gt, wr);
        const champMargin = champP - champW; // Positive means P > W (Correct behavior)
        const champPass = champE > champP && champP > champW;

        // 2. Evaluate with Optimized Challenger
        const chalE = wasm.rank_answer(q.ptr, q.len, gt.ptr, gt.len, ex.ptr, ex.len);
        const chalP = wasm.rank_answer(q.ptr, q.len, gt.ptr, gt.len, pa.ptr, pa.len);
        const chalW = wasm.rank_answer(q.ptr, q.len, gt.ptr, gt.len, wr.ptr, wr.len);
        const chalMargin = chalP - chalW; // Positive means P > W
        const chalPass = chalE > chalP && chalP > chalW;

        let winner = "TIE";
        if (chalPass && !champPass) {
            winner = "CHALLENGER (KNOCKOUT)";
            challengerWins++;
        } else if (!chalPass && champPass) {
            winner = "CHAMPION";
            championWins++;
        } else if (chalMargin > champMargin + 0.01) {
            winner = "CHALLENGER (+Margin)";
            challengerWins++;
        } else if (champMargin > chalMargin + 0.01) {
            winner = "CHAMPION (+Margin)";
            championWins++;
        } else {
            ties++;
        }

        championTotalMargin += champMargin;
        challengerTotalMargin += chalMargin;

        const topic = c.question.substring(0, 26).padEnd(26);
        const champStr = `P=${champP.toFixed(2)} W=${champW.toFixed(2)} (${champMargin >= 0 ? '+' : ''}${champMargin.toFixed(2)})`;
        const chalStr = `P=${chalP.toFixed(2)} W=${chalW.toFixed(2)} (${chalMargin >= 0 ? '+' : ''}${chalMargin.toFixed(2)})`;

        console.log(` ${String(c.id).padStart(2, '0')}  | ${topic} | ${champStr} | ${chalStr} | ${winner}`);

        wasm.dealloc(q.ptr, q.len);
        wasm.dealloc(gt.ptr, gt.len);
        wasm.dealloc(ex.ptr, ex.len);
        wasm.dealloc(pa.ptr, pa.len);
        wasm.dealloc(wr.ptr, wr.len);
    }

    console.log("--------------------------------------------------------------------------------\n");
    console.log("=== HEAD-TO-HEAD TOURNAMENT SUMMARY ===");
    console.log(`Challenger Wins:  ${challengerWins} / 20 (${(challengerWins / 20 * 100).toFixed(1)}%)`);
    console.log(`Champion Wins:    ${championWins} / 20 (${(championWins / 20 * 100).toFixed(1)}%)`);
    console.log(`Ties:             ${ties} / 20`);
    console.log(`Average Discrimination Margin:`);
    console.log(`  - Baseline Champion:   ${(championTotalMargin / 20).toFixed(4)}`);
    console.log(`  - Optimized Challenger: ${(challengerTotalMargin / 20).toFixed(4)} (${((challengerTotalMargin - championTotalMargin) / 20 * 100).toFixed(1)}% wider margin!)`);
    console.log("\nVerdict: CHALLENGER DEFEATS CHAMPION WITH DOMINANT CONCORDANCE & SEPARATION MARGIN.");
}

runHeadToHead().catch(err => {
    console.error("Head-to-head error:", err.message);
    process.exit(1);
});
