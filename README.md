# Telegraph WASM Scoring Module — Optimized Challenger

A production-grade, deterministic WebAssembly scoring module for the **Telegraph Protocol Decentralized Validator Network**.

This module evaluates candidate miner answers against a question and ground-truth reference by combining INT8-quantized MiniLM-L6-v2 transformer embeddings, stopword-dampened BM25 lexical overlap, polarity/negation contradiction detection, numeric mismatch resolution, and relative Gaussian length quality into a calibrated composite score.

```
telegraph-wasm-baseline/
├── src/
│   ├── lib.rs              # WASM exports: rank_answer, rank_answer_cached, breakdown_answer, embed, cosine_sim, bm25_score, alloc, dealloc
│   ├── embed.rs            # INT8 MiniLM-L6-v2 transformer forward pass (384 dims, L2 normalized)
│   ├── tokenizer.rs        # BERT WordPiece tokenizer with embedded 30,522-token vocabulary table
│   ├── bm25.rs             # Stopword-dampened, number-preserving BM25 & contradiction detection
│   ├── math.rs             # Pure libm IEEE-754 float math: cosine, Gaussian relative length similarity, L2 norm
│   └── allocator.rs        # no_std dlmalloc allocator + #[cfg(not(test))] panic handler
├── build.rs                # Compiles vocab.txt into binary lookup table at build time
├── vocab.txt               # BERT uncased vocabulary (30,522 tokens)
├── weights/
│   └── minilm_l6_v2_q8.bin # INT8 quantized MiniLM-L6-v2 weights (~22.5 MB)
├── test_scoring.js         # WASM export & cached scoring equivalence test
├── test_cases.js           # 20-case factual benchmark evaluation suite
├── test_fuzz.js            # Stage 1 edge case, unicode, and robustness test suite
├── test_head_to_head.js    # Champion vs Challenger head-to-head tournament arena
├── test_breakdown.js       # Signal decomposition diagnostic tool
└── test_scoring_embed.js   # Isolated embedding similarity inspector
```

---

## Benchmark & Tournament Results

### 1. Factual Benchmark (`test_cases.js`)
Evaluated across 20 canonical factual intents with candidate triads: `[Exact, Paraphrase, Wrong]`.

| Metric | Baseline Champion | Optimized Challenger | Improvement |
|---|:---:|:---:|:---:|
| **Exact > Paraphrase** | 80.0% (16/20) | **100.0% (20/20)** | **+20.0%** |
| **Paraphrase > Wrong** | 30.0% (6/20) | **100.0% (20/20)** | **+70.0%** |
| **Exact > Wrong** | 65.0% (13/20) | **100.0% (20/20)** | **+35.0%** |
| **Full Order Concordance** | **20.0% (4/20)** | **100.0% (20/20)** | **+80.0% (5x boost)** |

### 2. Stage 1 Robustness & Fuzz Suite (`test_fuzz.js`)
Passed 11/11 (**100.0%**) edge cases without trapping in WebAssembly linear memory:
- Empty & whitespace-only miner answers $\to$ returns `0.0000` immediately.
- Emoji strings (`🌍 🚀 ✨`), CJK characters (Chinese & Japanese), and Spanish accents.
- Special punctuation & tags (`<tag>{}[]\|`).
- Extreme text inputs up to 10,000 characters.

### 3. Head-to-Head Tournament (`test_head_to_head.js`)
- **Challenger Win Rate**: **55.0%** (11 wins, 6 ties, 3 champion wins).
- **Discrimination Margin**: Challenger provides a wider positive margin separating legitimate answers from distractors.

---

## Key Algorithmic Innovations

1. **Numeric & Entity Contradiction Penalty**:
   - Identifies false number substitutions (e.g. `12` instead of `8`, `50` instead of `100`) while gracefully handling close approximations ($\pm 5\%$, e.g. `299,792` vs `300,000`).
   - Penalizes numeric contradictions with a $0.45\times$ factor.

2. **Negation & Polarity Inversion Detection**:
   - Explicitly flags polar inversions (`not`, `never`, `without`, `cannot`) and applies a $0.35\times$ penalty factor.

3. **Relative Gaussian Length Quality**:
   - Replaced arbitrary length threshold with a relative log-ratio Gaussian model against ground-truth length:
     $$\text{Length Quality} = \exp\left(-1.5 \cdot \left(\ln\frac{L_{ma} + 10}{L_{gt} + 10}\right)^2\right)$$

4. **Stopword-Dampened BM25**:
   - Differentiates content keywords from syntactic filler so template-copied wrong answers do not gain artificial lexical advantages.

5. **Calibrated Composite Scoring Formula**:
   $$\text{Composite} = 0.15 \times \text{Relevance} + 0.65 \times \text{Correctness} + 0.10 \times \text{Lexical} + 0.10 \times \text{Length}$$

---

## Building the Module

### Prerequisites
- Rust with `wasm32-unknown-unknown` target:
  ```bash
  rustup target add wasm32-unknown-unknown
  ```

### Build Command (Release with Real Weights)
```bash
cargo build --release --target wasm32-unknown-unknown --features real_weights
```

**Artifact Output**:
`target/wasm32-unknown-unknown/release/telegraph_scoring.wasm`

**SHA-256 Checksum**:
`BD906D5E60CD0BDFF34016CE8F7C7F02C3EC0ED686046462EB4386DAE558FB8D`

---

## Running the Verification Test Battery

```bash
# 1. Native Rust unit tests (20/20 passed)
cargo test --lib

# 2. WASM export & cached scoring equivalence check
node test_scoring.js

# 3. 20-case factual benchmark (100% full order pass rate)
node test_cases.js

# 4. Stage 1 robustness and edge-case fuzzing suite (100% pass)
node test_fuzz.js

# 5. Champion vs Challenger Head-to-Head Arena
node test_head_to_head.js
```

---

## WASM ABI Exports

| Export | Signature | Description |
|---|---|---|
| `rank_answer` | `(i32, i32, i32, i32, i32, i32) -> f32` | Primary composite scoring entry point |
| `rank_answer_cached` | `(i32, i32, i32, i32, i32, i32) -> f32` | High-throughput cached variant reusing precomputed Q & GT vectors |
| `breakdown_answer` | `(i32, i32, i32, i32, i32, i32) -> i32` | Returns pointer to `[Relevance, Correctness, Lexical, Length, Composite]` |
| `embed` | `(i32, i32) -> i32` | Runs MiniLM inference; returns pointer to `f32[384]` vector |
| `cosine_sim` | `(i32, i32, i32) -> f32` | Computes cosine similarity of two in-memory vectors |
| `bm25_score` | `(i32, i32, i32, i32) -> f32` | Normalized single-pair BM25 lexical overlap |
| `alloc` / `dealloc` | `(i32) -> i32` / `(i32, i32)` | Linear memory heap allocator |
