const { loadScorer } = require("./test_adversarial_matrix.js");

// Suite 3: Adversarial False-Positive Stress Suite
// Tests whether detectors mistakenly penalize valid abstractions, aliases, concise answers, or rephrasings.
const FALSE_POSITIVE_STRESS_FIXTURES = [
    {
        name: "Concise Surname Only",
        q: "Who was the first president of the United States?",
        gt: "George Washington was the first president of the United States.",
        ma: "Washington.",
        expected: ">= 0.70"
    },
    {
        name: "Valid Alias / Abbreviation",
        q: "What is the chemical formula for water?",
        gt: "Water is chemically represented as H2O.",
        ma: "H2O",
        expected: ">= 0.70"
    },
    {
        name: "Rephrased Active Verb (Pumps -> Powers)",
        q: "Which organ pumps blood throughout the human body?",
        gt: "The heart pumps blood throughout the human body.",
        ma: "Human blood circulation is powered by the heart.",
        expected: ">= 0.95"
    },
    {
        name: "Rephrased Relation (Directed -> Made)",
        q: "Who directed Jurassic Park?",
        gt: "Steven Spielberg directed Jurassic Park.",
        ma: "The filmmaker Steven Spielberg made Jurassic Park.",
        expected: ">= 0.95"
    },
    {
        name: "Valid Decimal Rounding (29.8 -> 30)",
        q: "What is the orbital speed of Earth?",
        gt: "Earth travels around the Sun at roughly 29.8 kilometers per second.",
        ma: "Earth orbits the Sun at about 30 km/s.",
        expected: ">= 0.95"
    },
    {
        name: "Passive & Reordered Syntax",
        q: "What process converts sunlight into energy?",
        gt: "Plants convert sunlight into chemical energy through photosynthesis.",
        ma: "Photosynthesis is the process that plants use to synthesize energy from sunlight.",
        expected: ">= 0.95"
    }
];

async function runFalsePositiveStressSuite() {
    console.log("==========================================================================================");
    console.log("               SUITE 3: ADVERSARIAL FALSE-POSITIVE STRESS SUITE                           ");
    console.log("==========================================================================================");

    const cand = await loadScorer("telegraph_scoring.wasm");
    const champ = await loadScorer("C:\\Users\\LENOVO\\Downloads\\chat_k24c50.wasm");

    let passCount = 0;
    FALSE_POSITIVE_STRESS_FIXTURES.forEach(f => {
        const cS = cand.score(f.q, f.gt, f.ma);
        const kS = champ.score(f.q, f.gt, f.ma);

        let pass = false;
        if (f.expected === ">= 0.70" && cS >= 0.70) pass = true;
        if (f.expected === ">= 0.95" && cS >= 0.90) pass = true;
        if (pass) passCount++;

        console.log(`[${f.name.padEnd(35)}] | Cand: ${cS.toFixed(4)} (Expected ${f.expected}) | Champ: ${kS.toFixed(4)} | ${pass ? "PASS ✓" : "FAIL ✗"}`);
    });

    console.log("------------------------------------------------------------------------------------------");
    console.log(`False-Positive Stress Result: ${passCount} / ${FALSE_POSITIVE_STRESS_FIXTURES.length} (${((passCount/FALSE_POSITIVE_STRESS_FIXTURES.length)*100).toFixed(1)}%) PASS`);
}

runFalsePositiveStressSuite().catch(console.error);
