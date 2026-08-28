const { loadScorer } = require("./test_adversarial_matrix.js");

// Suite 2: Unseen Domain Generalization Suite
// Tests unseen domain slots and relations that were NOT part of initial test cases.
const UNSEEN_DOMAIN_FIXTURES = [
    {
        id: "UNSEEN-01-PLANET",
        domain: "Astronomy (Planet Slot: Mars vs Venus)",
        question: "Which planet is known as the Red Planet?",
        ground_truth: "Mars is known as the Red Planet due to its iron oxide surface.",
        good: "The planet Mars is referred to as the Red Planet.",
        bad: "Venus is known as the Red Planet due to its iron oxide surface."
    },
    {
        id: "UNSEEN-02-ELEMENT",
        domain: "Chemistry (Element Slot: Nitrogen vs Oxygen)",
        question: "What is the most abundant gas in Earth's atmosphere?",
        ground_truth: "Nitrogen makes up approximately 78 percent of Earth's atmosphere.",
        good: "Nitrogen is the most abundant gas in the atmosphere of Earth.",
        bad: "Oxygen makes up approximately 78 percent of Earth's atmosphere."
    },
    {
        id: "UNSEEN-03-CAPITAL",
        domain: "Geography (Capital Slot: Madrid vs Lisbon)",
        question: "What is the capital of Spain?",
        ground_truth: "Madrid is the official capital and largest city of Spain.",
        good: "The capital city of Spain is Madrid.",
        bad: "Lisbon is the official capital and largest city of Spain."
    },
    {
        id: "UNSEEN-04-MINERAL",
        domain: "Geology (Mineral Slot: Diamond vs Quartz)",
        question: "What is the hardest naturally occurring mineral on Earth?",
        ground_truth: "Diamond is the hardest natural mineral, rated 10 on the Mohs scale.",
        good: "The hardest natural mineral found on Earth is diamond.",
        bad: "Quartz is the hardest natural mineral, rated 10 on the Mohs scale."
    },
    {
        id: "UNSEEN-05-RELATION",
        domain: "Medicine (Relation: causes vs prevents)",
        question: "What is the health effect of regular cardiovascular exercise?",
        ground_truth: "Regular aerobic exercise prevents cardiovascular disease.",
        good: "Aerobic exercise reduces and prevents heart disease.",
        bad: "Regular aerobic exercise causes cardiovascular disease."
    }
];

async function runUnseenDomainSuite() {
    console.log("==========================================================================================");
    console.log("                 SUITE 2: UNSEEN DOMAIN GENERALIZATION BENCHMARK                          ");
    console.log("==========================================================================================");

    const cand = await loadScorer("telegraph_scoring.wasm");
    const champ = await loadScorer("C:\\Users\\LENOVO\\Downloads\\chat_k24c50.wasm");

    let candWins = 0, champWins = 0;
    let candMargins = [], champMargins = [];

    UNSEEN_DOMAIN_FIXTURES.forEach(f => {
        const cP = cand.score(f.question, f.ground_truth, f.good);
        const cW = cand.score(f.question, f.ground_truth, f.bad);
        const candMargin = cP - cW;
        candMargins.push(candMargin);

        const kP = champ.score(f.question, f.ground_truth, f.good);
        const kW = champ.score(f.question, f.ground_truth, f.bad);
        const champMargin = kP - kW;
        champMargins.push(champMargin);

        let verdict = "TIE";
        if (candMargin > champMargin + 0.005) { candWins++; verdict = "CANDIDATE (+Margin)"; }
        else if (champMargin > candMargin + 0.005) { champWins++; verdict = "CHAMPION (+Margin)"; }

        console.log(`[${f.id.padEnd(18)}] (${f.domain})`);
        console.log(`  Cand -> Good: ${cP.toFixed(4)}, Bad: ${cW.toFixed(4)} | Margin: +${candMargin.toFixed(4)}`);
        console.log(`  Champ-> Good: ${kP.toFixed(4)}, Bad: ${kW.toFixed(4)} | Margin: +${champMargin.toFixed(4)} | ${verdict}`);
        console.log("-".repeat(90));
    });

    const avgCand = candMargins.reduce((a,b)=>a+b,0)/candMargins.length;
    const avgChamp = champMargins.reduce((a,b)=>a+b,0)/champMargins.length;
    console.log(`Summary: Candidate Wins = ${candWins}/${UNSEEN_DOMAIN_FIXTURES.length} | Avg Cand Margin = +${avgCand.toFixed(4)} vs Champ = +${avgChamp.toFixed(4)}`);
}

runUnseenDomainSuite().catch(console.error);
