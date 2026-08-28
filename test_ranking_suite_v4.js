const { loadScorer } = require("./test_adversarial_matrix.js");
const { BENCHMARK_CASES } = require("./test_cases.js");

// ============================================================================
// 1. THE 7-TIER MONOTONIC SPECTRUM FIXTURES
// ============================================================================
const SEVEN_TIER_FIXTURES = [
    {
        domain: "Physics (Speed of Light)",
        q: "What is the speed of light in a vacuum?",
        gt: "Light travels at approximately 299,792 kilometers per second in a vacuum.",
        tiers: [
            { tier: 1, name: "Exact Reference", text: "Light travels at approximately 299,792 kilometers per second in a vacuum." },
            { tier: 2, name: "Rich Paraphrase", text: "The velocity of light in a vacuum is approximately 299,792 km/s." },
            { tier: 2, name: "Scientific Notation", text: "Light travels at approximately 2.99792e5 km/s in a vacuum." },
            { tier: 2, name: "Scale Word (0.3M)", text: "Light travels at roughly 0.3 million km/s in vacuum." },
            { tier: 3, name: "Concise Direct", text: "300,000 km/s" },
            { tier: 5, name: "Vague / Gas Media", text: "Light travels extremely fast through gaseous mediums and transparent matter." },
            { tier: 6, name: "Out of Tolerance +33%", text: "Light travels at 400,000 km/s in vacuum." },
            { tier: 7, name: "Unit Scale Mismatch", text: "Light travels at 300,000 meters per second in a vacuum." },
            { tier: 7, name: "Polar Negation", text: "Light does not travel at approximately 299,792 km/s in a vacuum." }
        ]
    },
    {
        domain: "Optics / Colors (Partial Credit Spectrum)",
        q: "What are the primary additive colors of light?",
        gt: "The primary additive colors of light are red, green, and blue.",
        tiers: [
            { tier: 1, name: "Exact Reference", text: "The primary additive colors of light are red, green, and blue." },
            { tier: 2, name: "Rich Paraphrase", text: "Red, green, and blue are the three additive primary colors of light." },
            { tier: 3, name: "Concise List", text: "Red, green, blue" },
            { tier: 4, name: "Partial 2 of 3 (RG)", text: "Red and green are primary additive colors of light." },
            { tier: 5, name: "Partial 1 of 3 (R)", text: "Red is an additive primary color." },
            { tier: 6, name: "Substituted Item (RYB)", text: "The primary additive colors of light are red, yellow, and blue." },
            { tier: 7, name: "Complete Distractor", text: "Cyan, magenta, and yellow are primary additive colors of light." }
        ]
    },
    {
        domain: "Geography (Capital Spectrum)",
        q: "What is the capital of France?",
        gt: "Paris is the capital of France.",
        tiers: [
            { tier: 1, name: "Exact Reference", text: "Paris is the capital of France." },
            { tier: 2, name: "Rich Paraphrase", text: "The official capital city of France is Paris." },
            { tier: 3, name: "Concise Direct", text: "Paris" },
            { tier: 5, name: "Topical Vague", text: "France is a country in Western Europe with many historic cities." },
            { tier: 7, name: "False Entity", text: "The capital of France is London." },
            { tier: 7, name: "Direct Negation", text: "Paris is not the capital of France." }
        ]
    }
];

// ============================================================================
// EVALUATOR ENGINE
// ============================================================================
async function runV4Evaluation() {
    console.log("==========================================================================================");
    console.log("             TELEGRAPH WASM V4.0: 7-TIER MONOTONIC ORDINAL RANKING SUITE                  ");
    console.log("==========================================================================================");

    const v4 = await loadScorer("telegraph_scoring.wasm");
    const champ = await loadScorer("C:\\Users\\LENOVO\\Downloads\\chat_k24c50.wasm");

    let totalPairs = 0;
    let v4ConcordantPairs = 0;
    let champConcordantPairs = 0;
    let minV4Margin = Infinity;

    for (const fixture of SEVEN_TIER_FIXTURES) {
        console.log(`\n[DOMAIN: ${fixture.domain}]`);
        console.log(`Q : "${fixture.q}"`);
        console.log(`GT: "${fixture.gt}"`);
        console.log("-".repeat(90));

        const scored = fixture.tiers.map(item => {
            const sV4 = v4.score(fixture.q, fixture.gt, item.text);
            const sChamp = champ.score(fixture.q, fixture.gt, item.text);
            return { ...item, sV4, sChamp };
        });

        scored.forEach(s => {
            console.log(`  Tier ${s.tier} | [${s.name.padEnd(25)}] | V4.0: ${s.sV4.toFixed(4)} | Champ: ${s.sChamp.toFixed(4)} | "${s.text}"`);
        });

        // Pairwise Monotonicity Checks
        for (let i = 0; i < scored.length; i++) {
            for (let j = i + 1; j < scored.length; j++) {
                const a = scored[i];
                const b = scored[j];
                if (a.tier !== b.tier) {
                    totalPairs++;
                    const betterIsA = a.tier < b.tier;
                    const diffV4 = betterIsA ? (a.sV4 - b.sV4) : (b.sV4 - a.sV4);
                    const diffChamp = betterIsA ? (a.sChamp - b.sChamp) : (b.sChamp - a.sChamp);

                    if (diffV4 >= 0) v4ConcordantPairs++;
                    if (diffChamp >= 0) champConcordantPairs++;

                    if (diffV4 < minV4Margin) minV4Margin = diffV4;
                }
            }
        }
    }

    const tauV4 = (v4ConcordantPairs - (totalPairs - v4ConcordantPairs)) / totalPairs;
    const tauChamp = (champConcordantPairs - (totalPairs - champConcordantPairs)) / totalPairs;

    console.log("\n==========================================================================================");
    console.log("                        7-TIER ORDINAL RANKING METRICS                                    ");
    console.log("==========================================================================================");
    console.log(`• Total Pairwise Evaluations : ${totalPairs}`);
    console.log(`• V4.0 Pairwise Concordance  : ${v4ConcordantPairs} / ${totalPairs} (${((v4ConcordantPairs/totalPairs)*100).toFixed(1)}%) | Kendall Tau = ${tauV4.toFixed(4)}`);
    console.log(`• Champ Pairwise Concordance : ${champConcordantPairs} / ${totalPairs} (${((champConcordantPairs/totalPairs)*100).toFixed(1)}%) | Kendall Tau = ${tauChamp.toFixed(4)}`);
    console.log(`• V4.0 Minimum Pairwise Margin (delta_min) : +${minV4Margin.toFixed(4)}`);

    // ============================================================================
    // 2. 20-FIXTURE BENCHMARK TOURNAMENT (V4.0 vs Champion #1297)
    // ============================================================================
    console.log("\n==========================================================================================");
    console.log("             SUITE 1: 20 FACTUAL BENCHMARK TOURNAMENT (V4.0 vs Champ #1297)               ");
    console.log("==========================================================================================");

    let v4Wins = 0, champWins = 0, ties = 0;
    let v4Margins = [], champMargins = [];
    let fullOrderPass = 0;

    BENCHMARK_CASES.forEach(c => {
        const sExact = v4.score(c.question, c.ground_truth, c.exact);
        const sPara = v4.score(c.question, c.ground_truth, c.paraphrase);
        const sWrong = v4.score(c.question, c.ground_truth, c.wrong);
        const marginV4 = sPara - sWrong;
        v4Margins.push(marginV4);

        if (sExact >= sPara && sPara > sWrong) fullOrderPass++;

        const kExact = champ.score(c.question, c.ground_truth, c.exact);
        const kPara = champ.score(c.question, c.ground_truth, c.paraphrase);
        const kWrong = champ.score(c.question, c.ground_truth, c.wrong);
        const marginChamp = kPara - kWrong;
        champMargins.push(marginChamp);

        let verdict = "TIE";
        if (marginV4 > marginChamp + 0.005) { v4Wins++; verdict = "V4.0 (+Margin)"; }
        else if (marginChamp > marginV4 + 0.005) { champWins++; verdict = "CHAMPION (+Margin)"; }
        else { ties++; }

        console.log(`Case ${String(c.id).padStart(2, "0")} | V4.0 (P=${sPara.toFixed(4)} W=${sWrong.toFixed(4)} M=+${marginV4.toFixed(4)}) | Champ (P=${kPara.toFixed(4)} W=${kWrong.toFixed(4)} M=+${marginChamp.toFixed(4)}) | ${verdict}`);
    });

    const avgV4Margin = v4Margins.reduce((a,b)=>a+b,0)/v4Margins.length;
    const avgChampMargin = champMargins.reduce((a,b)=>a+b,0)/champMargins.length;

    console.log("==========================================================================================");
    console.log("                             TOURNAMENT FINAL SUMMARY                                     ");
    console.log("==========================================================================================");
    console.log(`• V4.0 Full Order Pass Rate  : ${fullOrderPass} / ${BENCHMARK_CASES.length} (${((fullOrderPass/BENCHMARK_CASES.length)*100).toFixed(1)}%)`);
    console.log(`• V4.0 Tournament Wins       : ${v4Wins} / ${BENCHMARK_CASES.length} (${((v4Wins/BENCHMARK_CASES.length)*100).toFixed(1)}%)`);
    console.log(`• Champion Tournament Wins   : ${champWins} / ${BENCHMARK_CASES.length} (${((champWins/BENCHMARK_CASES.length)*100).toFixed(1)}%)`);
    console.log(`• V4.0 Avg Separation Margin : +${avgV4Margin.toFixed(4)}`);
    console.log(`• Champ Avg Separation Margin: +${avgChampMargin.toFixed(4)}`);
    console.log(`• Separation Margin Delta    : +${(avgV4Margin - avgChampMargin).toFixed(4)}`);
}

runV4Evaluation().catch(console.error);
