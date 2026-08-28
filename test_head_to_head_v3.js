const { BENCHMARK_CASES, loadWasm, writeStr } = require("./test_cases.js");
const { loadScorer } = require("./test_adversarial_matrix.js");

async function runHeadToHead() {
    const cand = await loadScorer("telegraph_scoring.wasm");
    const champ = await loadScorer("C:\\Users\\LENOVO\\Downloads\\chat_k24c50.wasm");

    console.log("==========================================================================================");
    console.log("          HEAD-TO-HEAD TOURNAMENT: CANDIDATE V3.0 vs INCUMBENT CHAMPION #1297             ");
    console.log("==========================================================================================");

    let candWins = 0, champWins = 0, ties = 0;
    let candMargins = [], champMargins = [];

    BENCHMARK_CASES.forEach(c => {
        const cP = cand.score(c.question, c.ground_truth, c.paraphrase);
        const cW = cand.score(c.question, c.ground_truth, c.wrong);
        const candMargin = cP - cW;
        candMargins.push(candMargin);

        const kP = champ.score(c.question, c.ground_truth, c.paraphrase);
        const kW = champ.score(c.question, c.ground_truth, c.wrong);
        const champMargin = kP - kW;
        champMargins.push(champMargin);

        let verdict = "TIE";
        if (candMargin > champMargin + 0.005) {
            candWins++;
            verdict = "CANDIDATE (+Margin)";
        } else if (champMargin > candMargin + 0.005) {
            champWins++;
            verdict = "CHAMPION (+Margin)";
        } else {
            ties++;
        }

        console.log(`Case ${String(c.id).padStart(2, "0")} | Cand (P=${cP.toFixed(4)} W=${cW.toFixed(4)} M=+${candMargin.toFixed(4)}) | Champ (P=${kP.toFixed(4)} W=${kW.toFixed(4)} M=+${champMargin.toFixed(4)}) | ${verdict}`);
    });

    const avgCandMargin = candMargins.reduce((a,b) => a+b, 0) / candMargins.length;
    const avgChampMargin = champMargins.reduce((a,b) => a+b, 0) / champMargins.length;

    console.log("==========================================================================================");
    console.log("                              HEAD-TO-HEAD TOURNAMENT SUMMARY                             ");
    console.log("==========================================================================================");
    console.log(`• Candidate Wins : ${candWins} / ${BENCHMARK_CASES.length} (${((candWins/BENCHMARK_CASES.length)*100).toFixed(1)}%)`);
    console.log(`• Champion Wins  : ${champWins} / ${BENCHMARK_CASES.length} (${((champWins/BENCHMARK_CASES.length)*100).toFixed(1)}%)`);
    console.log(`• Ties           : ${ties} / ${BENCHMARK_CASES.length}`);
    console.log(`• Candidate Avg Margin : +${avgCandMargin.toFixed(4)}`);
    console.log(`• Champion Avg Margin  : +${avgChampMargin.toFixed(4)}`);
    console.log(`• Margin Delta (Cand - Champ) : +${(avgCandMargin - avgChampMargin).toFixed(4)}`);
}

runHeadToHead().catch(console.error);
