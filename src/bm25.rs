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
    // Chronological and temporal directional pairs
    ("before", "after"),
    ("preceded", "succeeded"),
    ("preceding", "succeeding"),
    ("prior", "following"),
    ("earlier", "later"),
    ("bce", "ce"),
    ("bc", "ad"),
    ("ancient", "modern"),
];

/// Check if text contains explicit negation tokens or directional polarity conflicts.
pub fn has_polarity_conflict(gt: &str, ma: &str) -> bool {
    let neg_gt = has_negation(gt);
    let neg_ma = has_negation(ma);
    if neg_gt != neg_ma {
        return true;
    }

    let gt_terms = tokenise(gt);
    let ma_terms = tokenise(ma);
    for &(w1, w2) in DIRECTIONAL_PAIRS {
        let gt_has_w1 = gt_terms.iter().any(|t| t == w1);
        let gt_has_w2 = gt_terms.iter().any(|t| t == w2);
        let ma_has_w1 = ma_terms.iter().any(|t| t == w1);
        let ma_has_w2 = ma_terms.iter().any(|t| t == w2);

        // A conflict occurs ONLY if GT asserts w1 (and not w2), while MA inverts it to w2 (and not w1)
        if (gt_has_w1 && !gt_has_w2 && ma_has_w2 && !ma_has_w1) || 
           (gt_has_w2 && !gt_has_w1 && ma_has_w1 && !ma_has_w2) {
            return true;
        }
    }

    false
}

/// Helper struct for parsed historical calendar years and eras.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct YearInfo {
    pub year: i32,
    pub is_bce: bool,
}

/// Extract all historical calendar years (1000..=2099 or explicit BCE numbers) from text.
pub fn extract_all_years(text: &str) -> Vec<YearInfo> {
    let lower = text.to_lowercase();
    let is_bce = lower.contains("bce") || lower.contains("bc") || lower.contains("b.c.");
    let words: Vec<&str> = lower.split_whitespace().collect();
    let mut years = Vec::new();

    for &w in &words {
        let clean: String = w.chars().filter(|c| c.is_ascii_digit()).collect();
        if !clean.is_empty() {
            if let Ok(num) = clean.parse::<i32>() {
                if (num >= 1000 && num <= 2099) || (is_bce && num > 0 && num < 10000) {
                    let y = YearInfo { year: num, is_bce };
                    if !years.contains(&y) {
                        years.push(y);
                    }
                }
            }
        }
    }
    years
}

/// Check if candidate asserts an explicit historical year that conflicts with reference.
pub fn check_temporal_year_conflict(gt: &str, ma: &str) -> bool {
    if gt.trim().eq_ignore_ascii_case(ma.trim()) {
        return false;
    }
    let gt_years = extract_all_years(gt);
    let ma_years = extract_all_years(ma);

    if !gt_years.is_empty() && !ma_years.is_empty() {
        for m in &ma_years {
            if !gt_years.iter().any(|g| g.year == m.year && g.is_bce == m.is_bce) {
                return true; // Candidate asserted a contradictory calendar year!
            }
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

/// Lightweight no_std ascii float parser supporting decimals, signs, and scientific notation (e.g. 2.99792e5).
fn parse_f32(s: &str) -> Result<f32, ()> {
    if s.is_empty() || !s.chars().any(|c| c.is_ascii_digit()) {
        return Err(());
    }
    let bytes = s.as_bytes();
    let mut i = 0;
    let mut negative = false;
    if bytes[0] == b'-' {
        negative = true;
        i += 1;
    } else if bytes[0] == b'+' {
        i += 1;
    }

    let mut val = 0.0f32;
    let mut decimal = false;
    let mut divisor = 1.0f32;
    let mut exp_mode = false;
    let mut exp_val = 0i32;
    let mut exp_negative = false;

    while i < bytes.len() {
        let b = bytes[i];
        if b.is_ascii_digit() {
            if exp_mode {
                exp_val = exp_val * 10 + (b - b'0') as i32;
            } else if decimal {
                divisor *= 10.0;
                val += ((b - b'0') as f32) / divisor;
            } else {
                val = val * 10.0 + ((b - b'0') as f32);
            }
        } else if (b == b'e' || b == b'E') && !exp_mode {
            exp_mode = true;
            if i + 1 < bytes.len() && bytes[i + 1] == b'-' {
                exp_negative = true;
                i += 1;
            } else if i + 1 < bytes.len() && bytes[i + 1] == b'+' {
                i += 1;
            }
        } else if b == b'.' && !decimal && !exp_mode {
            decimal = true;
        } else if b == b',' {
            // Ignore thousands separator
        } else {
            break;
        }
        i += 1;
    }

    if negative {
        val = -val;
    }
    if exp_mode {
        let power = if exp_negative { -exp_val } else { exp_val };
        val *= libm::powf(10.0, power as f32);
    }
    Ok(val)
}

/// Helper struct for parsed physical quantities.
#[derive(Clone, Copy, Debug)]
pub struct Quantity {
    pub num: f32,
    pub is_discrete: bool,
    pub unit_code: u8, // 0: none, 1: km/s, 2: m/s, 3: celsius, 4: fahrenheit, 5: days, 6: percent
}

/// Extract all normalized quantities from text (supporting scale words e.g. "0.3 million", decimals, units).
pub fn extract_all_quantities(text: &str) -> Vec<Quantity> {
    let lower = text.to_lowercase();
    let words: Vec<&str> = lower.split_whitespace().collect();
    let mut quantities = Vec::new();

    let mut global_unit = 0u8;
    if lower.contains("km/s") || lower.contains("kilometers per second") || lower.contains("km per second") {
        global_unit = 1;
    } else if lower.contains("m/s") || lower.contains("meters per second") || lower.contains("m per second") {
        global_unit = 2;
    } else if lower.contains("celsius") || lower.contains("°c") {
        global_unit = 3;
    } else if lower.contains("fahrenheit") || lower.contains("°f") {
        global_unit = 4;
    } else if lower.contains("days") || lower.contains("day") {
        global_unit = 5;
    } else if lower.contains("percent") || lower.contains("%") {
        global_unit = 6;
    }

    for (i, &w) in words.iter().enumerate() {
        if !w.chars().any(|c| c.is_ascii_digit()) {
            continue;
        }
        let clean: String = w.chars().filter(|c| c.is_ascii_digit() || *c == '.' || *c == 'e' || *c == 'E' || *c == '+' || *c == '-').collect();
        if let Ok(mut num) = parse_f32(&clean) {
            let has_decimal = clean.contains('.') || clean.contains('e') || clean.contains('E');
            
            // Check next word for magnitude scale words
            if i + 1 < words.len() {
                let next = words[i + 1];
                if next.starts_with("million") {
                    num *= 1_000_000.0;
                } else if next.starts_with("billion") {
                    num *= 1_000_000_000.0;
                } else if next.starts_with("thousand") || next == "k" {
                    num *= 1_000.0;
                }
            }

            let is_discrete = !has_decimal && num < 1000.0 && global_unit == 5; // e.g. discrete calendar days
            quantities.push(Quantity { num, is_discrete, unit_code: global_unit });
        }
    }
    quantities
}

/// Check if candidate introduces conflicting numbers or unit mismatches compared to reference.
pub fn check_quantity_conflict(gt: &str, ma: &str) -> bool {
    let q_gt = extract_all_quantities(gt);
    let q_ma = extract_all_quantities(ma);

    if !q_gt.is_empty() && !q_ma.is_empty() {
        // A conflict occurs if MA asserts a number that does not match ANY valid quantity in GT
        for m in &q_ma {
            let mut matched = false;
            for g in &q_gt {
                let mut v_ma = m.num;
                // Unit conversion km/s <-> m/s
                if g.unit_code == 1 && m.unit_code == 2 {
                    v_ma /= 1000.0;
                } else if g.unit_code == 2 && m.unit_code == 1 {
                    v_ma *= 1000.0;
                } else if g.unit_code != 0 && m.unit_code != 0 && g.unit_code != m.unit_code {
                    return true; // Dimensional unit mismatch
                }

                if g.is_discrete {
                    if (g.num - v_ma).abs() < 0.001 {
                        matched = true;
                        break;
                    }
                } else if g.num > 0.0 && v_ma > 0.0 {
                    let ratio = v_ma / g.num;
                    if ratio >= 0.95 && ratio <= 1.05 {
                        matched = true;
                        break;
                    }
                } else if (g.num - v_ma).abs() < 0.001 {
                    matched = true;
                    break;
                }
            }
            if !matched {
                return true; // Candidate asserted a conflicting number not found in GT!
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
    if gt.trim().eq_ignore_ascii_case(ma.trim()) {
        return false;
    }
    let gt_lower = gt.to_lowercase();
    let ma_lower = ma.to_lowercase();

    for &(p1, p2) in PREDICATE_PAIRS {
        let gt_has_p1 = gt_lower.contains(p1);
        let gt_has_p2 = gt_lower.contains(p2);
        let ma_has_p1 = ma_lower.contains(p1);
        let ma_has_p2 = ma_lower.contains(p2);

        if (gt_has_p1 && !gt_has_p2 && ma_has_p2 && !ma_has_p1) || 
           (gt_has_p2 && !gt_has_p1 && ma_has_p1 && !ma_has_p2) {
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
