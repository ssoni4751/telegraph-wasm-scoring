const { loadScorer } = require("./test_adversarial_matrix.js");

const TEMPORAL_BENCHMARK_FIXTURES = [
    // ------------------------------------------------------------------------
    // Group 1: Exact Date vs Coarse Resolution vs Contradiction
    // ------------------------------------------------------------------------
    {
        id: "TEMP-01",
        category: "Point - Moon Landing",
        q: "When did the Apollo 11 Moon landing happen?",
        gt: "Apollo 11 landed on the Moon on July 20, 1969.",
        candidates: [
            { tier: "Exact Match", text: "Apollo 11 landed on July 20, 1969.", expectRank: 1 },
            { tier: "Year Only (Coarse)", text: "Apollo 11 landed in 1969.", expectRank: 2 },
            { tier: "Decade (Coarse)", text: "The Apollo 11 moon landing occurred in the late 1960s.", expectRank: 3 },
            { tier: "Wrong Year (+1 yr)", text: "Apollo 11 landed on July 20, 1970.", expectRank: 4 },
            { tier: "Wrong Decade", text: "Apollo 11 landed on July 20, 1985.", expectRank: 5 }
        ]
    },
    {
        id: "TEMP-02",
        category: "Point - Fall of Berlin Wall",
        q: "When did the Berlin Wall fall?",
        gt: "The Berlin Wall fell on November 9, 1989.",
        candidates: [
            { tier: "Exact Match", text: "The Berlin Wall fell on November 9, 1989.", expectRank: 1 },
            { tier: "Year Only (Coarse)", text: "The Berlin Wall was brought down in 1989.", expectRank: 2 },
            { tier: "Wrong Year", text: "The Berlin Wall fell on November 9, 1991.", expectRank: 3 },
            { tier: "Wrong Era", text: "The Berlin Wall fell in 1945.", expectRank: 4 }
        ]
    },
    {
        id: "TEMP-03",
        category: "Point - French Revolution",
        q: "In what year did the French Revolution begin?",
        gt: "The French Revolution began in 1789.",
        candidates: [
            { tier: "Exact Match", text: "The French Revolution began in 1789.", expectRank: 1 },
            { tier: "Century (Coarse)", text: "The French Revolution broke out in the late 18th century.", expectRank: 2 },
            { tier: "Wrong Year (+10 yrs)", text: "The French Revolution began in 1799.", expectRank: 3 },
            { tier: "Wrong Century", text: "The French Revolution began in 1889.", expectRank: 4 }
        ]
    },

    // ------------------------------------------------------------------------
    // Group 2: Chronological Ordering & Directional Relations (Before vs After)
    // ------------------------------------------------------------------------
    {
        id: "TEMP-04",
        category: "Relational - World Wars",
        q: "Did World War I occur before or after World War II?",
        gt: "World War I occurred before World War II.",
        candidates: [
            { tier: "Exact Paraphrase", text: "World War I preceded World War II.", expectRank: 1 },
            { tier: "Direct Match", text: "World War I took place before World War II.", expectRank: 1 },
            { tier: "Contradiction (After)", text: "World War I occurred after World War II.", expectRank: 3 },
            { tier: "Contradiction (Succeeded)", text: "World War I succeeded World War II.", expectRank: 3 }
        ]
    },
    {
        id: "TEMP-05",
        category: "Relational - Industrial Revolution",
        q: "Did the Renaissance happen before the Industrial Revolution?",
        gt: "The Renaissance occurred prior to the Industrial Revolution.",
        candidates: [
            { tier: "Exact Paraphrase", text: "The Renaissance happened earlier than the Industrial Revolution.", expectRank: 1 },
            { tier: "Direct Match", text: "The Renaissance occurred prior to the Industrial Revolution.", expectRank: 1 },
            { tier: "Contradiction (Following)", text: "The Renaissance occurred following the Industrial Revolution.", expectRank: 3 },
            { tier: "Contradiction (After)", text: "The Renaissance took place after the Industrial Revolution.", expectRank: 3 }
        ]
    },

    // ------------------------------------------------------------------------
    // Group 3: Ancient Eras (BCE vs CE / BC vs AD)
    // ------------------------------------------------------------------------
    {
        id: "TEMP-06",
        category: "Era - Julius Caesar",
        q: "When was Julius Caesar assassinated?",
        gt: "Julius Caesar was assassinated in 44 BCE.",
        candidates: [
            { tier: "Exact Match (BCE)", text: "Julius Caesar was killed in 44 BCE.", expectRank: 1 },
            { tier: "Equivalent BC", text: "Julius Caesar was assassinated in 44 BC.", expectRank: 1 },
            { tier: "Wrong Era (CE/AD)", text: "Julius Caesar was assassinated in 44 CE.", expectRank: 3 },
            { tier: "Wrong Year", text: "Julius Caesar was assassinated in 100 BCE.", expectRank: 3 }
        ]
    },

    // ------------------------------------------------------------------------
    // Group 4: Non-Temporal Control Cases (Ensuring Zero False Positives)
    // ------------------------------------------------------------------------
    {
        id: "TEMP-07",
        category: "Control - General Relativity",
        q: "Who formulated the general theory of relativity?",
        gt: "Albert Einstein formulated the general theory of relativity in 1915.",
        candidates: [
            { tier: "Full with Year", text: "Albert Einstein formulated general relativity in 1915.", expectRank: 1 },
            { tier: "Omitted Year (Valid QA)", text: "Einstein formulated the general theory of relativity.", expectRank: 1 },
            { tier: "Wrong Person", text: "Isaac Newton formulated general relativity in 1915.", expectRank: 3 }
        ]
    },
    {
        id: "TEMP-08",
        category: "Control - DNA Structure",
        q: "Who discovered the structure of DNA?",
        gt: "James Watson and Francis Crick discovered the double helix structure of DNA in 1953.",
        candidates: [
            { tier: "Full with Year", text: "Watson and Crick discovered the double helix structure of DNA in 1953.", expectRank: 1 },
            { tier: "Omitted Year (Valid QA)", text: "The structure of DNA was discovered by James Watson and Francis Crick.", expectRank: 1 },
            { tier: "Wrong Entity", text: "Gregor Mendel discovered the double helix structure of DNA in 1953.", expectRank: 3 }
        ]
    }
];

async function evaluateTemporalBenchmark() {
    console.log("==========================================================================================");
    console.log("                   TELEGRAPH WASM: TEMPORAL REASONING BENCHMARK SUITE                     ");
    console.log("==========================================================================================");

    const vCurrent = await loadScorer("telegraph_scoring.wasm");
    const champ = await loadScorer("C:\\Users\\LENOVO\\Downloads\\chat_k24c50.wasm");

    let totalPairs = 0;
    let vConcordant = 0;
    let champConcordant = 0;

    for (const fixture of TEMPORAL_BENCHMARK_FIXTURES) {
        console.log(`\n[${fixture.id}] ${fixture.category}`);
        console.log(`Q : "${fixture.q}"`);
        console.log(`GT: "${fixture.gt}"`);
        console.log("-".repeat(90));

        const scored = fixture.candidates.map(c => {
            const sV = vCurrent.score(fixture.q, fixture.gt, c.text);
            const sC = champ.score(fixture.q, fixture.gt, c.text);
            return { ...c, sV, sC };
        });

        scored.forEach(s => {
            console.log(`  Rank ${s.expectRank} | [${s.tier.padEnd(25)}] | V_Scorer: ${s.sV.toFixed(4)} | Champ: ${s.sC.toFixed(4)} | "${s.text}"`);
        });

        for (let i = 0; i < scored.length; i++) {
            for (let j = i + 1; j < scored.length; j++) {
                const a = scored[i];
                const b = scored[j];
                if (a.expectRank !== b.expectRank) {
                    totalPairs++;
                    const betterA = a.expectRank < b.expectRank;
                    const diffV = betterA ? (a.sV - b.sV) : (b.sV - a.sV);
                    const diffC = betterA ? (a.sC - b.sC) : (b.sC - a.sC);

                    if (diffV > 0.005) vConcordant++;
                    if (diffC > 0.005) champConcordant++;
                }
            }
        }
    }

    console.log("\n==========================================================================================");
    console.log("                           TEMPORAL BENCHMARK METRICS                                     ");
    console.log("==========================================================================================");
    console.log(`• Total Pairwise Temporal Checks: ${totalPairs}`);
    console.log(`• V_Scorer Concordant Pairs     : ${vConcordant} / ${totalPairs} (${((vConcordant/totalPairs)*100).toFixed(1)}%)`);
    console.log(`• Champion Concordant Pairs     : ${champConcordant} / ${totalPairs} (${((champConcordant/totalPairs)*100).toFixed(1)}%)`);
    console.log("==========================================================================================");
}

evaluateTemporalBenchmark().catch(console.error);
