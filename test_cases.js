const fs = require('fs');
const path = require('path');

const WASM_PATH = path.join(__dirname, 'target/wasm32-unknown-unknown/release/telegraph_scoring.wasm');

const BENCHMARK_CASES = [
    {
        id: 1,
        question: "Where do humans live?",
        ground_truth: "Humans live on planet Earth.",
        exact: "Humans live on planet Earth.",
        paraphrase: "Earth is the planet where human beings reside.",
        wrong: "Humans live on planet Mars."
    },
    {
        id: 2,
        question: "What is the capital of France?",
        ground_truth: "The capital of France is Paris.",
        exact: "The capital of France is Paris.",
        paraphrase: "Paris is the capital city of France.",
        wrong: "The capital of France is London."
    },
    {
        id: 3,
        question: "What is the chemical formula for water?",
        ground_truth: "The chemical formula for water is H2O.",
        exact: "The chemical formula for water is H2O.",
        paraphrase: "Water consists of hydrogen and oxygen with the formula H2O.",
        wrong: "The chemical formula for water is CO2."
    },
    {
        id: 4,
        question: "Who wrote Romeo and Juliet?",
        ground_truth: "Romeo and Juliet was written by William Shakespeare.",
        exact: "Romeo and Juliet was written by William Shakespeare.",
        paraphrase: "William Shakespeare is the author of Romeo and Juliet.",
        wrong: "Romeo and Juliet was written by Charles Dickens."
    },
    {
        id: 5,
        question: "What is the largest ocean on Earth?",
        ground_truth: "The Pacific Ocean is the largest ocean on Earth.",
        exact: "The Pacific Ocean is the largest ocean on Earth.",
        paraphrase: "Earth's largest ocean is the Pacific Ocean.",
        wrong: "The Atlantic Ocean is the largest ocean on Earth."
    },
    {
        id: 6,
        question: "What speed does light travel in vacuum?",
        ground_truth: "Light travels at approximately 299,792 kilometers per second in a vacuum.",
        exact: "Light travels at approximately 299,792 kilometers per second in a vacuum.",
        paraphrase: "In vacuum, the speed of light is about 300,000 km/s.",
        wrong: "Light travels at approximately 1,000 kilometers per second in a vacuum."
    },
    {
        id: 7,
        question: "What is the boiling point of water at standard sea level?",
        ground_truth: "The boiling point of water at sea level is 100 degrees Celsius.",
        exact: "The boiling point of water at sea level is 100 degrees Celsius.",
        paraphrase: "Water boils at 100 °C at standard atmospheric pressure.",
        wrong: "The boiling point of water at sea level is 50 degrees Celsius."
    },
    {
        id: 8,
        question: "Which organ pumps blood throughout the human body?",
        ground_truth: "The heart pumps blood throughout the human body.",
        exact: "The heart pumps blood throughout the human body.",
        paraphrase: "Blood circulation across the human body is powered by the heart.",
        wrong: "The liver pumps blood throughout the human body."
    },
    {
        id: 9,
        question: "What is the primary gas found in Earth's atmosphere?",
        ground_truth: "Nitrogen is the most abundant gas in Earth's atmosphere.",
        exact: "Nitrogen is the most abundant gas in Earth's atmosphere.",
        paraphrase: "Earth's atmosphere is primarily composed of nitrogen gas.",
        wrong: "Oxygen is the most abundant gas in Earth's atmosphere."
    },
    {
        id: 10,
        question: "In which continent is the Sahara Desert located?",
        ground_truth: "The Sahara Desert is located in Africa.",
        exact: "The Sahara Desert is located in Africa.",
        paraphrase: "Located in northern Africa, the Sahara is a massive desert.",
        wrong: "The Sahara Desert is located in Asia."
    },
    {
        id: 11,
        question: "What is the currency used in Japan?",
        ground_truth: "The currency of Japan is the Japanese Yen.",
        exact: "The currency of Japan is the Japanese Yen.",
        paraphrase: "Japan's official monetary currency is the Yen.",
        wrong: "The currency of Japan is the Euro."
    },
    {
        id: 12,
        question: "What is the square root of 64?",
        ground_truth: "The principal square root of 64 is 8.",
        exact: "The principal square root of 64 is 8.",
        paraphrase: "The square root of 64 equals 8.",
        wrong: "The principal square root of 64 is 12."
    },
    {
        id: 13,
        question: "Which process do plants use to convert sunlight into energy?",
        ground_truth: "Plants convert sunlight into chemical energy through photosynthesis.",
        exact: "Plants convert sunlight into chemical energy through photosynthesis.",
        paraphrase: "Photosynthesis is the mechanism by which plants synthesize energy from sunlight.",
        wrong: "Plants convert sunlight into chemical energy through cellular respiration."
    },
    {
        id: 14,
        question: "Who was the first president of the United States?",
        ground_truth: "George Washington was the first president of the United States.",
        exact: "George Washington was the first president of the United States.",
        paraphrase: "The United States' inaugural president was George Washington.",
        wrong: "Abraham Lincoln was the first president of the United States."
    },
    {
        id: 15,
        question: "What is the hardest natural mineral known on Earth?",
        ground_truth: "Diamond is the hardest known natural mineral on Earth.",
        exact: "Diamond is the hardest known natural mineral on Earth.",
        paraphrase: "On Earth, the hardest naturally occurring mineral substance is diamond.",
        wrong: "Quartz is the hardest known natural mineral on Earth."
    },
    {
        id: 16,
        question: "Which planet is known as the Red Planet?",
        ground_truth: "Mars is commonly known as the Red Planet.",
        exact: "Mars is commonly known as the Red Planet.",
        paraphrase: "The Red Planet is a widely used name for Mars.",
        wrong: "Venus is commonly known as the Red Planet."
    },
    {
        id: 17,
        question: "How many days are in a leap year?",
        ground_truth: "A leap year has 366 days.",
        exact: "A leap year has 366 days.",
        paraphrase: "There are 366 days in a leap year.",
        wrong: "A leap year has 365 days."
    },
    {
        id: 18,
        question: "Who developed the general theory of relativity?",
        ground_truth: "Albert Einstein developed the general theory of relativity.",
        exact: "Albert Einstein developed the general theory of relativity.",
        paraphrase: "The general theory of relativity was formulated by Albert Einstein.",
        wrong: "Isaac Newton developed the general theory of relativity."
    },
    {
        id: 19,
        question: "What is the capital of Australia?",
        ground_truth: "Canberra is the capital city of Australia.",
        exact: "Canberra is the capital city of Australia.",
        paraphrase: "The capital of Australia is Canberra.",
        wrong: "Sydney is the capital city of Australia."
    },
    {
        id: 20,
        question: "What is the main ingredient in traditional guacamole?",
        ground_truth: "Avocado is the main ingredient in traditional guacamole.",
        exact: "Avocado is the main ingredient in traditional guacamole.",
        paraphrase: "Traditional guacamole is primarily made from mashed avocado.",
        wrong: "Tomato is the main ingredient in traditional guacamole."
    }
];

async function loadWasm() {
    if (!fs.existsSync(WASM_PATH)) {
        throw new Error(`WASM binary not found at ${WASM_PATH}. Please compile first.`);
    }
    const wasmBuffer = fs.readFileSync(WASM_PATH);
    const wasmModule = await WebAssembly.instantiate(wasmBuffer, {});
    return wasmModule.instance.exports;
}

function writeStr(wasm, str) {
    const bytes = Buffer.from(str, 'utf8');
    const ptr = wasm.alloc(bytes.length);
    const mem = new Uint8Array(wasm.memory.buffer);
    mem.set(bytes, ptr);
    return { ptr, len: bytes.length };
}

async function runBenchmark() {
    const wasm = await loadWasm();
    console.log("=== Running 20 Factual Benchmark Cases ===");

    let exactOverPara = 0;
    let paraOverWrong = 0;
    let exactOverWrong = 0;
    let fullPass = 0;

    for (const c of BENCHMARK_CASES) {
        const q = writeStr(wasm, c.question);
        const gt = writeStr(wasm, c.ground_truth);
        
        const ex = writeStr(wasm, c.exact);
        const pa = writeStr(wasm, c.paraphrase);
        const wr = writeStr(wasm, c.wrong);

        const scoreExact = wasm.rank_answer(q.ptr, q.len, gt.ptr, gt.len, ex.ptr, ex.len);
        const scorePara  = wasm.rank_answer(q.ptr, q.len, gt.ptr, gt.len, pa.ptr, pa.len);
        const scoreWrong = wasm.rank_answer(q.ptr, q.len, gt.ptr, gt.len, wr.ptr, wr.len);

        const ep = scoreExact > scorePara;
        const pw = scorePara > scoreWrong;
        const ew = scoreExact > scoreWrong;
        const pass = ep && pw;

        if (ep) exactOverPara++;
        if (pw) paraOverWrong++;
        if (ew) exactOverWrong++;
        if (pass) fullPass++;

        const status = pass ? "PASS" : "FAIL";
        console.log(`CASE ${String(c.id).padStart(2, '0')} | E=${scoreExact.toFixed(4)} | P=${scorePara.toFixed(4)} | W=${scoreWrong.toFixed(4)} | ${status}`);

        wasm.dealloc(q.ptr, q.len);
        wasm.dealloc(gt.ptr, gt.len);
        wasm.dealloc(ex.ptr, ex.len);
        wasm.dealloc(pa.ptr, pa.len);
        wasm.dealloc(wr.ptr, wr.len);
    }

    const total = BENCHMARK_CASES.length;
    console.log("\n=== Benchmark Summary ===");
    console.log(`EXACT > PARAPHRASE : ${exactOverPara}/${total} (${(exactOverPara / total * 100).toFixed(1)}%)`);
    console.log(`PARAPHRASE > WRONG : ${paraOverWrong}/${total} (${(paraOverWrong / total * 100).toFixed(1)}%)`);
    console.log(`EXACT > WRONG      : ${exactOverWrong}/${total} (${(exactOverWrong / total * 100).toFixed(1)}%)`);
    console.log(`FULL ORDER PASS    : ${fullPass}/${total} (${(fullPass / total * 100).toFixed(1)}%)`);
}

module.exports = { BENCHMARK_CASES, loadWasm, writeStr };

if (require.main === module) {
    runBenchmark().catch(err => {
        console.error("Benchmark error:", err.message);
        process.exit(1);
    });
}
