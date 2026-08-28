const { BENCHMARK_CASES } = require("./test_cases.js");
const { loadScorer } = require("./test_adversarial_matrix.js");

async function testV41ValidatorSimulation() {
    const v41 = await loadScorer("telegraph_scoring.wasm");
    const champ = await loadScorer("C:\\Users\\LENOVO\\Downloads\\chat_k24c50.wasm");

    console.log("==========================================================================================");
    console.log("             V4.1 VS CHAMPION ON DIVERSE REAL-WORLD QUERY DISTRIBUTIONS                   ");
    console.log("==========================================================================================");

    // Realistic evaluation set containing both normal queries and adversarial edge cases
    const validatorSimQueries = [
        // 1. Standard QA / Natural Paraphrases
        { name: "General Relativity Paraphrase", q: "What is general relativity?", gt: "Albert Einstein proposed General Relativity in 1915.", good: "Einstein proposed the theory of general relativity.", bad: "Newton proposed classical mechanics." },
        { name: "US Capital Acronym", q: "What is the capital of the United States?", gt: "Washington, D.C. is the capital of the United States.", good: "The capital of the US is Washington, D.C.", bad: "New York is the capital." },
        { name: "Historical Satellite", q: "Which nation launched the first satellite?", gt: "The Soviet Union launched Sputnik 1 in 1957.", good: "Sputnik 1 was launched by the USSR in 1957.", bad: "The US launched Apollo 11." },
        { name: "Water Boiling Point", q: "What is water boiling point?", gt: "Water boils at 100 degrees Celsius at standard pressure.", good: "At standard pressure, water boils at 100 °C.", bad: "Water boils at 0 degrees Celsius." },
        { name: "Light Speed Approx", q: "What is the speed of light?", gt: "Light travels at 299,792 km/s in vacuum.", good: "The speed of light is about 300,000 km/s in vacuum.", bad: "Light travels at 1,000 km/s in vacuum." },
        { name: "Titanic Director", q: "Who directed Titanic?", gt: "James Cameron directed Titanic.", good: "The director of Titanic was Cameron.", bad: "Titanic was directed by Spielberg." },
        // 2. Adversarial Edge Cases (Where Champion Fails)
        { name: "Polarity Inversion (Trial Outcome)", q: "What was trial outcome?", gt: "The treatment resulted in patient mortality decreasing by 30 percent.", good: "Patient mortality decreased by 30%.", bad: "The treatment resulted in patient mortality increasing by 30 percent." },
        { name: "Unit Scale Error (Speed of Light)", q: "What is light speed?", gt: "Light travels at 299,792 km/s in vacuum.", good: "Light speed is 299,792 km/s.", bad: "Light travels at 300,000 meters per second in vacuum." },
        { name: "Relation Inversion (Exercise Effect)", q: "How does exercise affect heart disease?", gt: "Regular exercise prevents heart disease.", good: "Exercise prevents cardiovascular disease.", bad: "Regular exercise causes heart disease." }
    ];

    let v41Margins = [], champMargins = [];

    validatorSimQueries.forEach(sq => {
        const sG = v41.score(sq.q, sq.gt, sq.good);
        const sB = v41.score(sq.q, sq.gt, sq.bad);
        const m41 = sG - sB;
        v41Margins.push(m41);

        const kG = champ.score(sq.q, sq.gt, sq.good);
        const kB = champ.score(sq.q, sq.gt, sq.bad);
        const mChamp = kG - kB;
        champMargins.push(mChamp);

        let v = "TIE";
        if (m41 > mChamp + 0.005) v = "V4.1 WIN (+Margin)";
        else if (mChamp > m41 + 0.005) v = "CHAMP WIN (+Margin)";

        console.log(`[${sq.name.padEnd(35)}]`);
        console.log(`  V4.1 : Good=${sG.toFixed(4)}, Bad=${sB.toFixed(4)} | Margin=+${m41.toFixed(4)}`);
        console.log(`  Champ: Good=${kG.toFixed(4)}, Bad=${kB.toFixed(4)} | Margin=+${mChamp.toFixed(4)} | ${v}`);
        console.log("-".repeat(90));
    });

    const avg41 = v41Margins.reduce((a,b)=>a+b,0)/v41Margins.length;
    const avgC = champMargins.reduce((a,b)=>a+b,0)/champMargins.length;

    console.log("==========================================================================================");
    console.log(`• V4.1 Average Separation Margin    : +${avg41.toFixed(4)}`);
    console.log(`• Champion Average Separation Margin : +${avgC.toFixed(4)}`);
    console.log(`• Advantage Delta (V4.1 - Champion)  : +${(avg41 - avgC).toFixed(4)}`);
    console.log("==========================================================================================");
}

testV41ValidatorSimulation().catch(console.error);
