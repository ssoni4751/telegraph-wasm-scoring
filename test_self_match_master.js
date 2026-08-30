const fs = require("fs");

async function main() {
    const wasmBytes = fs.readFileSync("telegraph_scoring.wasm");
    const wasmModule = await WebAssembly.instantiate(wasmBytes, {});
    const { alloc, dealloc, memory, rank_answer } = wasmModule.instance.exports;

    function score(q, gt, ma) {
        const qBytes = Buffer.from(q, "utf8");
        const gtBytes = Buffer.from(gt, "utf8");
        const maBytes = Buffer.from(ma, "utf8");

        const qPtr = alloc(qBytes.length);
        const gtPtr = alloc(gtBytes.length);
        const maPtr = alloc(maBytes.length);

        new Uint8Array(memory.buffer, qPtr, qBytes.length).set(qBytes);
        new Uint8Array(memory.buffer, gtPtr, gtBytes.length).set(gtBytes);
        new Uint8Array(memory.buffer, maPtr, maBytes.length).set(maBytes);

        const res = rank_answer(qPtr, qBytes.length, gtPtr, gtBytes.length, maPtr, maBytes.length);

        dealloc(qPtr, qBytes.length);
        dealloc(gtPtr, gtBytes.length);
        dealloc(maPtr, maBytes.length);

        return res;
    }

    const testCases = [
        ["What happened to the temperature?", "The temperature was higher before noon and lower after sunset."],
        ["What was the financial result?", "The company experienced gains before the market crash and losses after."],
        ["How does the path go?", "The trail goes up the steep hill and down into the valley."],
        ["Who worked on the film?", "Christopher Nolan directed the first movie and produced the second film."],
        ["When was the discovery made?", "Albert Einstein formulated the theory in 1915 and published later."],
        ["When was Caesar assassinated?", "Julius Caesar was assassinated in 44 BCE."],
        ["What are the boiling and freezing points?", "Water freezes at 0 degrees Celsius and boils at 100 degrees Celsius."],
        ["What is the speed of light?", "Light travels at approximately 299,792 kilometers per second in a vacuum."],
        ["Who wrote the book?", "The author wrote the manuscript and the editor published it."],
        ["Did sales rise or fall?", "Sales increased in the first quarter and decreased in the fourth quarter."],
        ["Short answer", "Paris"],
        ["Numeric answer", "42"],
        ["Date only", "July 20, 1969"],
        ["Complex list", "Items include apples, oranges, bananas, and grapes."],
        ["Punctuation test", "Hello, World! Is this 100% working? Yes, it is."]
    ];

    console.log("==========================================================================================");
    console.log("             COMPREHENSIVE 100% SELF-MATCH FIXTURE VERIFICATION SUITE                     ");
    console.log("==========================================================================================");

    let passCount = 0;
    testCases.forEach(([q, gt], idx) => {
        const s = score(q, gt, gt);
        const pass = s >= 0.999;
        if (pass) passCount++;
        console.log(`[Case ${(idx+1).toString().padStart(2, "0")}] Score = ${s.toFixed(6)} | ${pass ? "PASS ✓" : "FAIL ❌"} | "${gt.substring(0, 65)}..."`);
    });

    console.log("==========================================================================================");
    console.log(`Results: ${passCount} / ${testCases.length} Passed (${((passCount/testCases.length)*100).toFixed(1)}%)`);
    console.log("==========================================================================================");
}

main().catch(console.error);
