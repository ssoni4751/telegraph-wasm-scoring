const { loadScorer } = require("./test_adversarial_matrix.js");

const TEMPORAL_PAIRS = [
    ["before", "after"],
    ["preceded", "succeeded"],
    ["preceding", "succeeding"],
    ["prior to", "following"],
    ["earlier than", "later than"],
    ["earlier", "later"],
    ["bce", "ce"],
    ["bc", "ad"],
    ["b.c.", "a.d."],
    ["b.c.e.", "c.e."]
];

function checkTemporalRelationConflict(gt, ma) {
    const gtL = gt.toLowerCase();
    const maL = ma.toLowerCase();

    for (const [w1, w2] of TEMPORAL_PAIRS) {
        if ((gtL.includes(w1) && maL.includes(w2)) || (gtL.includes(w2) && maL.includes(w1))) {
            return true;
        }
    }
    return false;
}

function extractYears(text) {
    const lower = text.toLowerCase();
    const isBce = lower.includes("bce") || lower.includes("bc") || lower.includes("b.c.");
    const matches = text.match(/\b(1\d{3}|20\d{2}|[1-9]\d{0,2})\b/g) || [];
    const years = [];
    for (const m of matches) {
        const y = parseInt(m, 10);
        // Valid historical years or era numbers
        if ((y >= 1000 && y <= 2099) || isBce) {
            years.push({ year: y, isBce });
        }
    }
    return years;
}

function checkTemporalPointConflict(gt, ma) {
    const gtYears = extractYears(gt);
    const maYears = extractYears(ma);

    if (gtYears.length > 0 && maYears.length > 0) {
        // If MA asserts a year, it must match at least one year in GT
        for (const m of maYears) {
            const match = gtYears.some(g => g.year === m.year && g.isBce === m.isBce);
            if (!match) {
                return true; // Contradictory year asserted!
            }
        }
    }
    return false;
}

// Test prototype logic
console.log("==========================================================================================");
console.log("                 PROTOTYPE TEMPORAL DETECTION LOGIC TEST                                  ");
console.log("==========================================================================================");

const tests = [
    { gt: "World War I occurred before World War II.", ma: "World War I occurred after World War II.", expect: true },
    { gt: "The Renaissance occurred prior to the Industrial Revolution.", ma: "The Renaissance occurred following the Industrial Revolution.", expect: true },
    { gt: "Apollo 11 landed on July 20, 1969.", ma: "Apollo 11 landed on July 20, 1970.", expect: true },
    { gt: "Apollo 11 landed on July 20, 1969.", ma: "Apollo 11 landed in 1969.", expect: false },
    { gt: "Albert Einstein formulated general relativity in 1915.", ma: "Einstein formulated general relativity.", expect: false },
    { gt: "Julius Caesar was assassinated in 44 BCE.", ma: "Julius Caesar was assassinated in 44 CE.", expect: true }
];

tests.forEach(t => {
    const relConf = checkTemporalRelationConflict(t.gt, t.ma);
    const pointConf = checkTemporalPointConflict(t.gt, t.ma);
    const detected = relConf || pointConf;
    const pass = detected === t.expect;
    console.log(`GT: "${t.gt}" | MA: "${t.ma}"`);
    console.log(`  -> RelConflict: ${relConf}, PointConflict: ${pointConf} | Pass: ${pass ? "PASS ✓" : "FAIL ✗"}`);
});
