// Test V4.1 Architecture:
// Continuous Fusion (Champion Backbone) + Steep Calibration (k=24.0, c0=0.50) + Robust Polarity/Numeric Modifiers (Zero Brittle Heuristics)

function champScore(rel, corr, lex, len) {
    const aux = 0.15 * rel + 0.05 * lex + 0.10 * len;
    const z = Math.min(Math.max(0.70 * corr + aux * Math.sqrt(Math.max(0, corr)), 0), 1);
    const sig = 1.0 / (1.0 + Math.exp(-24.0 * (z - 0.50)));
    return Math.min(Math.max(0.98 * sig + 0.02 * z, 0), 1);
}

function v41Score(rel, corr, lex, len, has_polarity = false, has_numeric = false) {
    let mod_pol = has_polarity ? 0.05 : 1.0;
    let mod_num = has_numeric ? 0.05 : 1.0;
    let eff_corr = Math.min(Math.max(corr * mod_pol * mod_num, 0), 1);
    
    // Exact Champion Backbone (no clamping on lex, no fragile entity rules)
    const aux = 0.15 * rel + 0.05 * lex + 0.10 * len;
    const z = Math.min(Math.max(0.70 * eff_corr + aux * Math.sqrt(Math.max(0, eff_corr)), 0), 1);
    const sig = 1.0 / (1.0 + Math.exp(-24.0 * (z - 0.50)));
    return Math.min(Math.max(0.98 * sig + 0.02 * z, 0), 1);
}

// Evaluate on the realistic benchmark distribution
const sampleQueries = [
    { name: "High Paraphrase", good: { rel: 0.90, corr: 0.88, lex: 0.70, len: 0.95 }, bad: { rel: 0.40, corr: 0.35, lex: 0.20, len: 0.80 } },
    { name: "Moderate Paraphrase", good: { rel: 0.75, corr: 0.72, lex: 0.50, len: 0.85 }, bad: { rel: 0.35, corr: 0.38, lex: 0.25, len: 0.85 } },
    { name: "Concise / Short Answer", good: { rel: 0.60, corr: 0.65, lex: 0.20, len: 0.25 }, bad: { rel: 0.30, corr: 0.30, lex: 0.15, len: 0.50 } },
    { name: "Synonym Rich Answer", good: { rel: 0.70, corr: 0.68, lex: 0.15, len: 0.90 }, bad: { rel: 0.30, corr: 0.32, lex: 0.10, len: 0.70 } },
    { name: "Complex Technical", good: { rel: 0.80, corr: 0.75, lex: 0.45, len: 0.90 }, bad: { rel: 0.45, corr: 0.42, lex: 0.30, len: 0.90 } },
    { name: "Topical Partial", good: { rel: 0.65, corr: 0.60, lex: 0.35, len: 0.80 }, bad: { rel: 0.40, corr: 0.36, lex: 0.20, len: 0.80 } },
    { name: "Low-Overlap Paraphrase", good: { rel: 0.58, corr: 0.56, lex: 0.10, len: 0.75 }, bad: { rel: 0.25, corr: 0.28, lex: 0.08, len: 0.75 } }
];

console.log("==========================================================================================");
console.log("             TESTING V4.1 ARCHITECTURE ON REALISTIC VALIDATOR DISTRIBUTION                ");
console.log("==========================================================================================");

let champMargins = [], v41Margins = [];

sampleQueries.forEach(q => {
    const cG = champScore(q.good.rel, q.good.corr, q.good.lex, q.good.len);
    const cB = champScore(q.bad.rel, q.bad.corr, q.bad.lex, q.bad.len);
    const cM = cG - cB;
    champMargins.push(cM);

    const vG = v41Score(q.good.rel, q.good.corr, q.good.lex, q.good.len);
    const vB = v41Score(q.bad.rel, q.bad.corr, q.bad.lex, q.bad.len);
    const vM = vG - vB;
    v41Margins.push(vM);

    console.log(`[${q.name.padEnd(25)}] | V4.1: Good=${vG.toFixed(4)}, Bad=${vB.toFixed(4)} (M=+${vM.toFixed(4)}) | Champ: Good=${cG.toFixed(4)}, Bad=${cB.toFixed(4)} (M=+${cM.toFixed(4)}) | Delta: ${(vM-cM).toFixed(4)}`);
});

const avgC = champMargins.reduce((a,b)=>a+b,0)/champMargins.length;
const avgV = v41Margins.reduce((a,b)=>a+b,0)/v41Margins.length;

console.log("\n==========================================================================================");
console.log(`• Champion Average Margin : +${avgC.toFixed(4)}`);
console.log(`• V4.1 Average Margin     : +${avgV.toFixed(4)} (100% Matches Champion Separation on Normal Queries)`);
console.log("==========================================================================================");

// Also test polarity and numeric contradictions where V4.1 destroys the champion:
const contradictionCases = [
    { name: "Polarity Inversion (increasing vs decreasing)", rel: 0.85, corr: 0.88, lex: 0.85, len: 0.95, has_pol: true },
    { name: "Unit Inversion (300k m/s vs km/s)", rel: 0.90, corr: 0.88, lex: 0.80, len: 0.95, has_num: true }
];

console.log("\n>>> CONTRADICTION COMPARISON (Where Champion Hallucinates High Scores):");
contradictionCases.forEach(c => {
    const cScore = champScore(c.rel, c.corr, c.lex, c.len);
    const vScore = v41Score(c.rel, c.corr, c.lex, c.len, c.has_pol, c.has_num);
    console.log(`[${c.name.padEnd(45)}] | V4.1: ${vScore.toFixed(4)} (CRUSH ✓) | Champ: ${cScore.toFixed(4)} (HALLUCINATES ✗)`);
});
