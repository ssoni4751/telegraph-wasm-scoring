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

/// Check if two numeric tokens match exactly or are close approximations.
fn nums_match(a: &str, b: &str) -> bool {
    if a == b {
        return true;
    }
    // For large numbers (> 1000), accept rounded approximations within 5%
    if let (Ok(na), Ok(nb)) = (parse_f32(a), parse_f32(b)) {
        if na > 1000.0 && nb > 1000.0 {
            let ratio = na / nb;
            if ratio >= 0.95 && ratio <= 1.05 {
                return true;
            }
        }
    }
    false
}

/// Lightweight no_std ascii float parser.
fn parse_f32(s: &str) -> Result<f32, ()> {
    let mut val = 0.0f32;
    for &b in s.as_bytes() {
        if b.is_ascii_digit() {
            val = val * 10.0 + ((b - b'0') as f32);
        } else {
            return Err(());
        }
    }
    Ok(val)
}

/// Check if candidate introduces conflicting numbers compared to reference.
pub fn check_numeric_conflict(gt: &str, ma: &str) -> bool {
    let gt_terms = tokenise(gt);
    let ma_terms = tokenise(ma);

    let gt_nums: Vec<&str> = gt_terms
        .iter()
        .filter(|t| t.chars().all(|c| c.is_ascii_digit()))
        .map(|s| s.as_str())
        .collect();
    let ma_nums: Vec<&str> = ma_terms
        .iter()
        .filter(|t| t.chars().all(|c| c.is_ascii_digit()))
        .map(|s| s.as_str())
        .collect();

    if !gt_nums.is_empty() && !ma_nums.is_empty() {
        let has_novel_num = ma_nums.iter().any(|m| !gt_nums.iter().any(|g| nums_match(g, m)));
        let missing_gt_num = gt_nums.iter().any(|g| !ma_nums.iter().any(|m| nums_match(g, m)));
        if has_novel_num && missing_gt_num {
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

    crate::math::clamp01(raw / max_raw)
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
        assert!(s > 0.35, "exact match should be > 0.35, got {s:.4}");
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
