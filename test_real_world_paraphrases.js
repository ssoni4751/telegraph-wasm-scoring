const { loadScorer } = require("./test_adversarial_matrix.js");

async function testRealWorldParaphrases() {
    const v4 = await loadScorer("telegraph_scoring.wasm");
    const champ = await loadScorer("C:\\Users\\LENOVO\\Downloads\\chat_k24c50.wasm");

    console.log("==========================================================================================");
    console.log("             TESTING REAL-WORLD PARAPHRASES FOR FALSE POSITIVE PENALTIES                  ");
    console.log("==========================================================================================");

    const realWorldCases = [
        {
            name: "Omitted First Name (Albert Einstein -> Einstein)",
            q: "Who formulated the general theory of relativity?",
            gt: "Albert Einstein formulated the general theory of relativity in 1915.",
            good: "The general theory of relativity was formulated by Einstein in 1915.",
            bad: "Isaac Newton formulated the general theory of relativity in 1915."
        },
        {
            name: "Capitalization Variation (General Relativity vs general relativity)",
            q: "What is general relativity?",
            gt: "Albert Einstein proposed General Relativity in 1915.",
            good: "Einstein proposed the theory of general relativity.",
            bad: "Albert Einstein proposed Quantum Mechanics in 1915."
        },
        {
            name: "Acronym vs Full Name (United States -> US)",
            q: "What is the capital of the United States?",
            gt: "Washington, D.C. is the capital of the United States.",
            good: "The capital of the US is Washington, D.C.",
            bad: "New York City is the capital of the United States."
        },
        {
            name: "Historical Country Name (Soviet Union -> USSR)",
            q: "Which nation launched the first artificial satellite?",
            gt: "The Soviet Union launched Sputnik 1 in 1957.",
            good: "Sputnik 1 was launched by the USSR in 1957.",
            bad: "The United States launched Sputnik 1 in 1957."
        }
    ];

    realWorldCases.forEach(c => {
        const sGood = v4.score(c.q, c.gt, c.good);
        const sBad = v4.score(c.q, c.gt, c.bad);
        const marginV4 = sGood - sBad;

        const kGood = champ.score(c.q, c.gt, c.good);
        const kBad = champ.score(c.q, c.gt, c.bad);
        const marginChamp = kGood - kBad;

        console.log(`[${c.name}]`);
        console.log(`  V4.0 : Good=${sGood.toFixed(4)}, Bad=${sBad.toFixed(4)} | Margin: +${marginV4.toFixed(4)}`);
        console.log(`  Champ: Good=${kGood.toFixed(4)}, Bad=${kBad.toFixed(4)} | Margin: +${marginChamp.toFixed(4)}`);
        console.log("-".repeat(90));
    });
}

testRealWorldParaphrases();
