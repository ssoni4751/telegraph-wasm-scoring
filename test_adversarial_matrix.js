const fs = require("fs");
const path = require("path");

const ADVERSARIAL_TEST_MATRIX = [
    // --- TIER 1 vs TIER 2 vs TIER 5 (Classic Capital of France) ---
    {
        id: "GEO-PARIS",
        domain: "Geography",
        question: "What is the capital of France?",
        ground_truth: "Paris is the capital of France.",
        candidates: [
            { label: "Exact", tier: 1, text: "Paris is the capital of France." },
            { label: "High Paraphrase", tier: 2, text: "The capital city of France is Paris." },
            { label: "Complex Paraphrase", tier: 2, text: "France has its capital located in the city of Paris." },
            { label: "Concise Direct", tier: 4, text: "Paris" },
            { label: "Topical Distractor", tier: 5, text: "France is a country in Western Europe known for its cuisine and culture." },
            { label: "Entity Substitution", tier: 6, text: "The capital of France is London." },
            { label: "Polar Negation", tier: 7, text: "Paris is not the capital of France." },
            { label: "Irrelevant", tier: 7, text: "Bananas grow in tropical climates and are rich in potassium." }
        ]
    },

    // --- TIER 2 vs TIER 6 (Numeric Approximation vs Material Error) ---
    {
        id: "PHYS-LIGHT",
        domain: "Physics",
        question: "What is the speed of light in a vacuum?",
        ground_truth: "Light travels at approximately 299,792 kilometers per second in a vacuum.",
        candidates: [
            { label: "Exact", tier: 1, text: "Light travels at approximately 299,792 kilometers per second in a vacuum." },
            { label: "Valid Approx", tier: 2, text: "In vacuum, the speed of light is about 300,000 km/s." },
            { label: "Unit Rephrased", tier: 2, text: "The velocity of light in a vacuum is 299,792 km/s." },
            { label: "Material Num Error", tier: 6, text: "Light travels at approximately 1,000 kilometers per second in a vacuum." },
            { label: "Extreme Num Error", tier: 6, text: "Light travels at 50 kilometers per second in vacuum." },
            { label: "Irrelevant", tier: 7, text: "Photosynthesis converts solar energy into chemical energy in plants." }
        ]
    },

    // --- TIER 2 vs TIER 6 vs TIER 7 (Clinical / Polarity Inversion) ---
    {
        id: "MED-MORTALITY",
        domain: "Medicine / Science",
        question: "What was the clinical outcome of the trial?",
        ground_truth: "The treatment resulted in patient mortality decreasing by 30 percent.",
        candidates: [
            { label: "Exact", tier: 1, text: "The treatment resulted in patient mortality decreasing by 30 percent." },
            { label: "Paraphrase", tier: 2, text: "Patient mortality dropped by 30% following the treatment." },
            { label: "Polar Inversion", tier: 7, text: "The treatment resulted in patient mortality increasing by 30 percent." },
            { label: "Direct Negation", tier: 7, text: "The treatment did not decrease patient mortality by 30 percent." },
            { label: "Wrong Percentage", tier: 6, text: "The treatment resulted in patient mortality decreasing by 5 percent." }
        ]
    },

    // --- TIER 3 (Partial / Incomplete vs Complete) ---
    {
        id: "OPT-COLORS",
        domain: "Physics / Optics",
        question: "What are the primary colors of additive light?",
        ground_truth: "The primary additive colors of light are red, green, and blue.",
        candidates: [
            { label: "Exact", tier: 1, text: "The primary additive colors of light are red, green, and blue." },
            { label: "Paraphrase", tier: 2, text: "Red, green, and blue are the additive primary colors of light." },
            { label: "Partial (2 of 3)", tier: 3, text: "Red and green are primary additive colors of light." },
            { label: "Substituted Entity", tier: 6, text: "The primary additive colors of light are red, yellow, and blue." },
            { label: "Irrelevant", tier: 7, text: "Water is composed of two hydrogen atoms and one oxygen atom." }
        ]
    },

    // --- TIER 4 vs TIER 6 (Subname / Partial Proper Noun vs Wrong Person) ---
    {
        id: "ENT-DIRECTOR",
        domain: "Arts & Cinema",
        question: "Who directed the movie Titanic?",
        ground_truth: "James Cameron directed the movie Titanic.",
        candidates: [
            { label: "Exact", tier: 1, text: "James Cameron directed the movie Titanic." },
            { label: "Paraphrase", tier: 2, text: "Titanic was directed by filmmaker James Cameron." },
            { label: "Surname Only", tier: 4, text: "Cameron directed Titanic." },
            { label: "Concise Surname", tier: 4, text: "James Cameron" },
            { label: "False Entity", tier: 6, text: "Steven Spielberg directed the movie Titanic." },
            { label: "False Entity 2", tier: 6, text: "Christopher Nolan directed Titanic." }
        ]
    },

    // --- TIER 2 vs TIER 6 (Orbital Macro Number) ---
    {
        id: "ASTR-EARTH-ORBIT",
        domain: "Astronomy",
        question: "What is the orbital speed of the Earth around the Sun?",
        ground_truth: "Earth orbits the Sun at an average speed of approximately 29.8 kilometers per second.",
        candidates: [
            { label: "Exact", tier: 1, text: "Earth orbits the Sun at an average speed of approximately 29.8 kilometers per second." },
            { label: "Macro Approx", tier: 2, text: "Earth travels at roughly 30 km/s in its orbit around the Sun." },
            { label: "Material Num Error", tier: 6, text: "Earth orbits the Sun at an average speed of 500 kilometers per second." },
            { label: "Wrong Body", tier: 6, text: "Mars orbits the Sun at an average speed of approximately 29.8 kilometers per second." }
        ]
    }
];

async function loadScorer(wasmPath) {
    const buf = fs.readFileSync(wasmPath);
    const mod = await WebAssembly.instantiate(buf);
    const exp = mod.instance.exports;
    const mem = exp.memory;

    function writeStr(str) {
        const bytes = Buffer.from(str, "utf8");
        const ptr = exp.alloc(bytes.length);
        new Uint8Array(mem.buffer, ptr, bytes.length).set(bytes);
        return { ptr, len: bytes.length };
    }

    function score(q, gt, ma) {
        const qB = writeStr(q);
        const gtB = writeStr(gt);
        const maB = writeStr(ma);
        const s = exp.rank_answer(qB.ptr, qB.len, gtB.ptr, gtB.len, maB.ptr, maB.len);
        exp.dealloc(qB.ptr, qB.len);
        exp.dealloc(gtB.ptr, gtB.len);
        exp.dealloc(maB.ptr, maB.len);
        return s;
    }

    function breakdown(q, gt, ma) {
        const qB = writeStr(q);
        const gtB = writeStr(gt);
        const maB = writeStr(ma);
        const ptr = exp.breakdown_answer(qB.ptr, qB.len, gtB.ptr, gtB.len, maB.ptr, maB.len);
        const arr = new Float32Array(mem.buffer.slice(ptr, ptr + 20));
        exp.dealloc(qB.ptr, qB.len);
        exp.dealloc(gtB.ptr, gtB.len);
        exp.dealloc(maB.ptr, maB.len);
        return {
            rel: arr[0],
            corr: arr[1],
            lex: arr[2],
            len: arr[3],
            comp: arr[4]
        };
    }

    return { score, breakdown };
}

async function runAdversarialHarness(candidateWasmPath, championWasmPath) {
    console.log("==========================================================================================");
    console.log("           TELEGRAPH WASM ADVERSARIAL MATRIX & ORDINAL RANKING HARNESS                     ");
    console.log("==========================================================================================");

    const cand = await loadScorer(candidateWasmPath);
    let champ = null;
    if (championWasmPath && fs.existsSync(championWasmPath)) {
        champ = await loadScorer(championWasmPath);
    }

    let totalPairs = 0;
    let candCorrectPairs = 0;
    let champCorrectPairs = 0;

    let allCandScores = [];
    let allChampScores = [];

    for (const test of ADVERSARIAL_TEST_MATRIX) {
        console.log(`\n[FIXTURE: ${test.id}] (${test.domain})`);
        console.log(`Q : "${test.question}"`);
        console.log(`GT: "${test.ground_truth}"`);
        console.log("-".repeat(90));

        const scoredCandidates = test.candidates.map(c => {
            const candScore = cand.score(test.question, test.ground_truth, c.text);
            const champScore = champ ? champ.score(test.question, test.ground_truth, c.text) : null;
            allCandScores.push(candScore);
            if (champScore !== null) allChampScores.push(champScore);
            return {
                ...c,
                candScore,
                champScore
            };
        });

        // Print table
        scoredCandidates.forEach(c => {
            const candStr = c.candScore.toFixed(4);
            const champStr = c.champScore !== null ? c.champScore.toFixed(4) : "N/A";
            console.log(`  Tier ${c.tier} | [${c.label.padEnd(20)}] | Cand: ${candStr} | Champ: ${champStr} | "${c.text}"`);
        });

        // Pairwise ordinal ranking verification
        for (let i = 0; i < scoredCandidates.length; i++) {
            for (let j = i + 1; j < scoredCandidates.length; j++) {
                const c1 = scoredCandidates[i];
                const c2 = scoredCandidates[j];

                if (c1.tier !== c2.tier) {
                    totalPairs++;
                    const shouldC1BeatC2 = c1.tier < c2.tier;

                    const candPassed = shouldC1BeatC2 ? (c1.candScore >= c2.candScore) : (c2.candScore >= c1.candScore);
                    if (candPassed) candCorrectPairs++;

                    if (champ) {
                        const champPassed = shouldC1BeatC2 ? (c1.champScore >= c2.champScore) : (c2.champScore >= c1.champScore);
                        if (champPassed) champCorrectPairs++;
                    }
                }
            }
        }
    }

    console.log("\n==========================================================================================");
    console.log("                               HARNESS SUMMARY & METRICS                                  ");
    console.log("==========================================================================================");
    console.log(`Total Pairwise Comparisons Evaluated: ${totalPairs}`);
    console.log(`• CANDIDATE Pairwise Concordance: ${candCorrectPairs} / ${totalPairs} (${((candCorrectPairs / totalPairs) * 100).toFixed(2)}%)`);
    if (champ) {
        console.log(`• CHAMPION  Pairwise Concordance: ${champCorrectPairs} / ${totalPairs} (${((champCorrectPairs / totalPairs) * 100).toFixed(2)}%)`);
    }

    // Spread and distribution
    function stats(arr) {
        const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
        const variance = arr.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / arr.length;
        return { mean, stdDev: Math.sqrt(variance) };
    }

    const candStats = stats(allCandScores);
    console.log(`\n• CANDIDATE Score Distribution : Mean = ${candStats.mean.toFixed(4)}, StdDev = ${candStats.stdDev.toFixed(4)}`);
    if (champ) {
        const champStats = stats(allChampScores);
        console.log(`• CHAMPION  Score Distribution : Mean = ${champStats.mean.toFixed(4)}, StdDev = ${champStats.stdDev.toFixed(4)}`);
    }
}

if (require.main === module) {
    const candWasm = path.resolve("telegraph_scoring.wasm");
    const champWasm = "C:\\Users\\LENOVO\\Downloads\\chat_k24c50.wasm";
    runAdversarialHarness(candWasm, champWasm).catch(console.error);
}

module.exports = { ADVERSARIAL_TEST_MATRIX, loadScorer, runAdversarialHarness };
