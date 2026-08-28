//! BM25 single-document lexical scorer.
//!
//! Standard BM25 requires a corpus to compute IDF. For our use case —
//! scoring one miner answer against one ground-truth string — we use a
//! simplified single-document variant where IDF is treated as constant
//! (every query term is assumed to be relevant). This reduces the formula to
//! a TF-saturation model that rewards:
//!
//!   - Exact keyword overlap with the ground truth
//!   - Longer, more complete answers (up to a natural saturation point)
//!   - Without over-rewarding repetition (k1 saturation)
//!
//! Parameters: k1 = 1.5, b = 0.75 (standard TREC values).
//! Output is normalised to [0, 1] so it can be combined linearly with
//! cosine similarity scores in `rank_answer`.

extern crate alloc;

use alloc::{string::String, vec::Vec};

const K1: f32 = 1.5;
const B: f32 = 0.75;

const STOPWORDS: &[&str] = &[
    "a", "about", "above", "after", "again", "against", "all", "am", "an", "and", "any", "are",
    "as", "at", "be", "because", "been", "before", "being", "below", "between", "both",
    "but", "by", "could", "did", "do", "does", "doing", "down", "during",
    "each", "few", "for", "from", "further", "had", "has", "have", "having", "he", "her", "here",
    "hers", "herself", "him", "himself", "his", "how", "i", "if", "in", "into", "is", "it", "its",
    "itself", "me", "more", "most", "my", "myself", "of", "off", "on", "once",
    "only", "or", "other", "ought", "our", "ours", "ourselves", "out", "over", "own", "same", "she",
    "should", "so", "some", "such", "than", "that", "the", "their", "theirs", "them", "themselves",
    "then", "there", "these", "they", "this", "those", "through", "to", "too", "under", "until",
    "up", "very", "was", "we", "were", "what", "when", "where", "which", "while", "who", "whom",
    "why", "with", "would", "you", "your", "yours", "yourself", "yourselves"
];

const NEGATIONS: &[&str] = &[
    "not", "never", "no", "without", "neither", "nor", "none", "cannot", "cant",
    "isnt", "arent", "wasnt", "werent", "dont", "doesnt", "didnt", "hasnt", "havent",
    "hadnt", "wont", "wouldnt", "shouldnt"
];

/// Check if text contains explicit negation tokens.
pub fn has_negation(text: &str) -> bool {
    let terms = tokenise(text);
    terms.iter().any(|t| NEGATIONS.iter().any(|&n| n == t.as_str()))
}

const DIRECTIONAL_PAIRS: &[(&str, &str)] = &[
    ("increase", "decrease"),
    ("increased", "decreased"),
    ("increasing", "decreasing"),
    ("rise", "fall"),
    ("rises", "falls"),
    ("rising", "falling"),
    ("rose", "fell"),
    ("higher", "lower"),
    ("highest", "lowest"),
    ("above", "below"),
    ("over", "under"),
    ("gain", "loss"),
    ("gains", "losses"),
    ("positive", "negative"),
    ("growth", "decline"),
    ("growing", "declining"),
    ("grew", "declined"),
    ("more", "less"),
    ("up", "down"),
];

/// Check if text contains explicit negation tokens or directional polarity conflicts.
pub fn has_polarity_conflict(gt: &str, ma: &str) -> bool {
    let neg_gt = has_negation(gt);
    let neg_ma = has_negation(ma);
    if neg_gt != neg_ma {
        return true;
    }

    let gt_lower = gt.to_lowercase();
    let ma_lower = ma.to_lowercase();
    for &(w1, w2) in DIRECTIONAL_PAIRS {
        if (gt_lower.contains(w1) && ma_lower.contains(w2)) || (gt_lower.contains(w2) && ma_lower.contains(w1)) {
            return true;
        }
    }

    false
}

/// Check if two numeric tokens match exactly or are close approximations.
fn nums_match(a: &str, b: &str) -> bool {
    if a == b {
        return true;
    }
    let has_decimal = a.contains('.') || b.contains('.');
    if let (Ok(na), Ok(nb)) = (parse_f32(a), parse_f32(b)) {
        if na > 0.0 && nb > 0.0 {
            // Allow +-5% tolerance for large measurements (> 1000) or explicit float measurements
            if (na > 1000.0 && nb > 1000.0) || has_decimal {
                let ratio = na / nb;
                if ratio >= 0.95 && ratio <= 1.05 {
                    return true;
                }
            }
        }
    }
    false
}

/// Lightweight no_std ascii float parser supporting decimals.
fn parse_f32(s: &str) -> Result<f32, ()> {
    let mut val = 0.0f32;
    let mut decimal = false;
    let mut divisor = 1.0f32;
    for &b in s.as_bytes() {
        if b.is_ascii_digit() {
            if decimal {
                divisor *= 10.0;
                val += ((b - b'0') as f32) / divisor;
            } else {
                val = val * 10.0 + ((b - b'0') as f32);
            }
        } else if b == b'.' && !decimal {
            decimal = true;
        } else {
            return Err(());
        }
    }
    Ok(val)
}

/// Extract all numeric substrings from text (e.g. "100°C" -> ["100"], "29.8 km/s" -> ["29.8"], "299,792 km/s" -> ["299792"])
fn extract_numbers(text: &str) -> Vec<String> {
    let mut nums = Vec::new();
    let mut curr = String::new();
    let chars: Vec<char> = text.chars().collect();
    for i in 0..chars.len() {
        let c = chars[i];
        if c.is_ascii_digit() {
            curr.push(c);
        } else if c == '.' && i > 0 && i + 1 < chars.len() && chars[i - 1].is_ascii_digit() && chars[i + 1].is_ascii_digit() {
            curr.push(c);
        } else if c == ',' && i > 0 && i + 1 < chars.len() && chars[i - 1].is_ascii_digit() && chars[i + 1].is_ascii_digit() {
            continue;
        } else if !curr.is_empty() {
            nums.push(core::mem::take(&mut curr));
        }
    }
    if !curr.is_empty() {
        nums.push(curr);
    }
    nums
}

/// Check if candidate introduces conflicting numbers compared to reference.
pub fn check_numeric_conflict(gt: &str, ma: &str) -> bool {
    let gt_nums = extract_numbers(gt);
    let ma_nums = extract_numbers(ma);

    if !gt_nums.is_empty() && !ma_nums.is_empty() {
        let has_novel_num = ma_nums.iter().any(|m| !gt_nums.iter().any(|g| nums_match(g, m)));
        let missing_gt_num = gt_nums.iter().any(|g| !ma_nums.iter().any(|m| nums_match(g, m)));
        if has_novel_num && missing_gt_num {
            return true;
        }
    }
    false
}

const KNOWN_SLOT_DOMAINS: &[&[&str]] = &[
    // Organs
    &["heart", "liver", "lung", "lungs", "brain", "kidney", "kidneys", "stomach", "pancreas", "spleen"],
    // Currencies
    &["yen", "euro", "dollar", "dollars", "pound", "pounds", "yuan", "peso", "rupee", "franc"],
    // Biological & Chemical Processes
    &["photosynthesis", "cellular respiration", "respiration", "fermentation", "mitosis", "meiosis", "combustion", "digestion"],
    // Celestial bodies
    &["mercury", "venus", "earth", "mars", "jupiter", "saturn", "uranus", "neptune", "pluto"],
    // Chemical elements
    &["hydrogen", "helium", "oxygen", "nitrogen", "carbon", "gold", "silver", "iron", "copper", "lead", "uranium"],
    // Superlatives / Oceans / Deserts / Minerals
    &["pacific", "atlantic", "indian", "arctic", "sahara", "antarctic", "gobi", "diamond", "corundum", "topaz", "quartz", "talc"]
];

/// Check if candidate substitutes an answer-bearing domain slot with a conflicting slot value.
pub fn check_slot_value_conflict(gt: &str, ma: &str) -> bool {
    let gt_lower = gt.to_lowercase();
    let ma_lower = ma.to_lowercase();

    for domain in KNOWN_SLOT_DOMAINS {
        let gt_has_slot = domain.iter().any(|&val| gt_lower.contains(val));
        if gt_has_slot {
            let ma_matching = domain.iter().any(|&val| gt_lower.contains(val) && ma_lower.contains(val));
            let ma_different = domain.iter().any(|&val| !gt_lower.contains(val) && ma_lower.contains(val));
            if !ma_matching && ma_different {
                return true;
            }
        }
    }
    false
}

const PREDICATE_PAIRS: &[(&str, &str)] = &[
    ("directed", "produced"),
    ("director", "producer"),
    ("wrote", "published"),
    ("author", "editor"),
    ("discovered", "invented"),
    ("causes", "prevents"),
    ("caused", "prevented"),
    ("creates", "destroys"),
    ("created", "destroyed"),
    ("born", "died"),
    ("won", "lost"),
    ("bought", "sold"),
];

/// Check if candidate substitutes a key action or relationship predicate with a conflicting predicate.
pub fn check_predicate_conflict(gt: &str, ma: &str) -> bool {
    let gt_lower = gt.to_lowercase();
    let ma_lower = ma.to_lowercase();

    for &(p1, p2) in PREDICATE_PAIRS {
        if (gt_lower.contains(p1) && ma_lower.contains(p2)) || (gt_lower.contains(p2) && ma_lower.contains(p1)) {
            return true;
        }
    }
    false
}

/// Helper struct for parsed physical quantities.
struct Quantity {
    num: f32,
    unit_code: u8, // 1: km/s, 2: m/s, 3: celsius, 4: fahrenheit, 5: days, 6: percent
}

fn parse_first_quantity(text: &str) -> Option<Quantity> {
    let lower = text.to_lowercase();
    let nums = extract_numbers(&lower);
    if nums.is_empty() {
        return None;
    }

    let mut num = parse_f32(&nums[0]).ok()?;
    if lower.contains("million") {
        num *= 1_000_000.0;
    }

    let mut unit_code = 0u8;
    if lower.contains("km/s") || lower.contains("kilometers per second") || lower.contains("km per second") {
        unit_code = 1;
    } else if lower.contains("m/s") || lower.contains("meters per second") || lower.contains("m per second") {
        unit_code = 2;
    } else if lower.contains("celsius") || lower.contains("°c") {
        unit_code = 3;
    } else if lower.contains("fahrenheit") || lower.contains("°f") {
        unit_code = 4;
    } else if lower.contains("days") || lower.contains("day") {
        unit_code = 5;
    } else if lower.contains("percent") || lower.contains("%") {
        unit_code = 6;
    }

    Some(Quantity { num, unit_code })
}

/// Check if candidate introduces a conflicting quantity or incompatible measurement unit.
pub fn check_quantity_conflict(gt: &str, ma: &str) -> bool {
    if let (Some(q_gt), Some(q_ma)) = (parse_first_quantity(gt), parse_first_quantity(ma)) {
        let val_gt = q_gt.num;
        let mut val_ma = q_ma.num;

        // Convert between scale units (e.g. km/s <-> m/s)
        if q_gt.unit_code == 1 && q_ma.unit_code == 2 {
            val_ma /= 1000.0; // 300,000 m/s = 300 km/s != 300,000 km/s
        } else if q_gt.unit_code == 2 && q_ma.unit_code == 1 {
            val_ma *= 1000.0;
        } else if q_gt.unit_code != 0 && q_ma.unit_code != 0 && q_gt.unit_code != q_ma.unit_code {
            // Unit mismatch across incompatible dimensions
            return true;
        }

        if val_gt > 0.0 && val_ma > 0.0 {
            let ratio = val_ma / val_gt;
            if ratio < 0.95 || ratio > 1.05 {
                return true;
            }
        }
    }
    false
}

const FIRST_WORD_IGNORES: &[&str] = &[
    "the", "a", "an", "in", "on", "at", "for", "with", "by", "from",
    "to", "it", "this", "that", "these", "those", "is", "are", "was",
    "were", "be", "what", "where", "when", "who", "why", "how", "all",
    "some", "many", "most", "each", "every", "if", "as", "and", "or", "but"
];

#[inline]
fn is_sentence_start_ignore(term: &str) -> bool {
    FIRST_WORD_IGNORES.iter().any(|&sw| sw == term)
}

/// Check if candidate introduces conflicting proper nouns / named entities compared to reference.
pub fn check_entity_conflict(gt: &str, ma: &str) -> bool {
    fn get_entities(text: &str) -> Vec<String> {
        let mut ents = Vec::new();
        let words: Vec<&str> = text.split_whitespace().collect();
        for (i, &w) in words.iter().enumerate() {
            let clean: String = w.chars().filter(|c| c.is_alphanumeric()).collect();
            if clean.len() >= 2 {
                let first = clean.chars().next().unwrap();
                let is_first_word = i == 0 || words[i - 1].ends_with('.') || words[i - 1].ends_with('!') || words[i - 1].ends_with('?');
                let has_alpha = clean.chars().any(|c| c.is_alphabetic());
                let all_upper = has_alpha && clean.chars().all(|c| c.is_uppercase() || c.is_ascii_digit());
                let lower = clean.to_lowercase();
                
                let should_include = if is_first_word {
                    first.is_uppercase() && has_alpha && !is_sentence_start_ignore(&lower)
                } else {
                    (first.is_uppercase() && has_alpha) || all_upper
                };

                if should_include && !is_stopword(&lower) && !ents.contains(&lower) {
                    ents.push(lower);
                }
            }
        }
        ents
    }

    let gt_ents = get_entities(gt);
    let ma_ents = get_entities(ma);
    let gt_lower = gt.to_lowercase();
    let ma_lower = ma.to_lowercase();

    if !gt_ents.is_empty() && !ma_ents.is_empty() {
        let has_missing_gt = gt_ents.iter().any(|g| !ma_lower.contains(g) && !ma_lower.contains(&g[..3.min(g.len())]));
        let has_novel_ent  = ma_ents.iter().any(|m| !gt_lower.contains(m) && !gt_lower.contains(&m[..3.min(m.len())]));
        
        if has_missing_gt && has_novel_ent {
            return true;
        }
    }
    false
}

#[inline]
fn is_stopword(term: &str) -> bool {
    STOPWORDS.iter().any(|&sw| sw == term)
}

#[inline]
fn term_weight(term: &str) -> f32 {
    if is_stopword(term) {
        0.2
    } else if term.chars().any(|c| c.is_ascii_digit()) {
        2.5 // Boost numbers and quantities significantly
    } else {
        1.0 // Content words
    }
}

/// Score `doc` against `query`.
///
/// Both strings are lowercased and split on non-alphanumeric characters.
/// Returns a value in [0, 1].
pub fn score(query: &str, doc: &str) -> f32 {
    let q_terms = tokenise(query);
    let d_terms = tokenise(doc);

    if q_terms.is_empty() || d_terms.is_empty() {
        return 0.0;
    }

    // Term frequency map for the doc
    let mut tf: Vec<(&str, f32)> = Vec::new();
    for term in &d_terms {
        if let Some(entry) = tf.iter_mut().find(|(t, _)| *t == term.as_str()) {
            entry.1 += 1.0;
        } else {
            tf.push((term.as_str(), 1.0));
        }
    }

    let doc_len = d_terms.len() as f32;
    let avg_dl = ((q_terms.len() + d_terms.len()) as f32) / 2.0;

    let mut raw = 0.0f32;
    let mut max_raw = 0.0f32;

    for term in &q_terms {
        let weight = term_weight(term.as_str());
        let tf_val = tf
            .iter()
            .find(|(t, _)| *t == term.as_str())
            .map(|(_, c)| *c)
            .unwrap_or(0.0);

        let tf_norm = (tf_val * (K1 + 1.0)) / (tf_val + K1 * (1.0 - B + B * doc_len / avg_dl));

        raw += tf_norm * weight;
        max_raw += (K1 + 1.0) * weight;
    }

    if max_raw == 0.0 {
        return 0.0;
    }

    // Scale by 2.5 (ceiling of 1-to-1 document match) so exact word overlap reaches 1.0
    crate::math::clamp01((raw / max_raw) * (K1 + 1.0))
}

/// Tokenise `text` into lowercase alphanumeric words, joining comma-separated numbers (e.g. 299,792 -> 299792).
fn tokenise(text: &str) -> Vec<String> {
    let mut words = Vec::new();
    let mut current = String::new();
    let chars: Vec<char> = text.chars().collect();

    for i in 0..chars.len() {
        let ch = chars[i];
        if ch.is_alphanumeric() {
            current.push(if ch.is_ascii_uppercase() {
                (ch as u8 + 32) as char
            } else {
                ch
            });
        } else if ch == ',' && i > 0 && i + 1 < chars.len() && chars[i - 1].is_ascii_digit() && chars[i + 1].is_ascii_digit() {
            // Strip thousands separators in numbers (e.g. 299,792 -> 299792)
            continue;
        } else if !current.is_empty() {
            words.push(core::mem::take(&mut current));
        }
    }
    if !current.is_empty() {
        words.push(current);
    }
    words
}

// ── Tests ──────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn exact_match_scores_high() {
        let s = score(
            "the capital of france is paris",
            "the capital of france is paris",
        );
        assert!(s > 0.85, "exact match should be > 0.85, got {s:.4}");
    }

    #[test]
    fn test_nums_match_speed_of_light() {
        assert!(nums_match("299792", "300000"));
        assert!(!nums_match("299792", "1000"));
        assert!(!check_numeric_conflict(
            "Light travels at approximately 299,792 kilometers per second in a vacuum.",
            "In vacuum, the speed of light is about 300,000 km/s."
        ));
        assert!(check_numeric_conflict(
            "Light travels at approximately 299,792 kilometers per second in a vacuum.",
            "Light travels at approximately 1,000 kilometers per second in a vacuum."
        ));
        assert!(!check_entity_conflict(
            "Light travels at approximately 299,792 kilometers per second in a vacuum.",
            "In vacuum, the speed of light is about 300,000 km/s."
        ));
    }

    #[test]
    fn zero_overlap_scores_zero() {
        let s = score("france paris capital", "banana mango tropical fruit");
        assert!(s < 0.05, "no overlap should be < 0.05, got {s:.4}");
    }

    #[test]
    fn partial_overlap_in_range() {
        let s = score(
            "capital of france",
            "france is a country with paris as its main city",
        );
        assert!(
            s > 0.1 && s < 0.9,
            "partial overlap should be mid-range, got {s:.4}"
        );
    }

    #[test]
    fn empty_query_returns_zero() {
        assert_eq!(score("", "some document text"), 0.0);
    }

    #[test]
    fn empty_doc_returns_zero() {
        assert_eq!(score("some query", ""), 0.0);
    }
}
