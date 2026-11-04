use serde::{Deserialize, Serialize};

use crate::review::Card;

pub const HISTORY_LIMIT: usize = 50;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct HistoryEntry {
    pub scope: String,
    pub card: Card,
    pub grade: String,
    #[serde(default)]
    pub review_id: Option<String>,
}

pub fn push_history(history: &mut Vec<HistoryEntry>, entry: HistoryEntry) {
    history.push(entry);

    let overflow = history.len().saturating_sub(HISTORY_LIMIT);

    history.drain(..overflow);
}

pub fn attach_review_id(history: &mut [HistoryEntry], card_id: &str, grade: &str, review_id: &str) {
    if let Some(entry) = history
        .iter_mut()
        .rev()
        .find(|entry| entry.card.id == card_id && entry.grade == grade && entry.review_id.is_none())
    {
        entry.review_id = Some(review_id.to_string());
    }
}

pub fn last_for_scope(history: &[HistoryEntry], scope: &str) -> Option<HistoryEntry> {
    history.last().filter(|entry| entry.scope == scope).cloned()
}

pub fn pop_if_review(history: &mut Vec<HistoryEntry>, review_id: &str) -> Option<HistoryEntry> {
    let matches = history.last().is_some_and(|entry| entry.review_id.as_deref() == Some(review_id));

    if matches { history.pop() } else { None }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn entry(scope: &str, card_id: &str, review_id: Option<&str>) -> HistoryEntry {
        HistoryEntry {
            scope: scope.to_string(),
            card: Card {
                id: card_id.to_string(),
                knowledge_bit_id: format!("kb-{card_id}"),
                question: format!("Q{card_id}"),
                answer: format!("A{card_id}"),
                phase: "review".to_string(),
                card_key: None,
                intervals: None,
            },
            grade: "good".to_string(),
            review_id: review_id.map(str::to_string),
        }
    }

    #[test]
    fn should_cap_the_undo_history_at_the_limit_dropping_the_oldest() {
        let mut history = Vec::new();

        for index in 0..(HISTORY_LIMIT + 3) {
            push_history(&mut history, entry("all|0", &index.to_string(), None));
        }

        assert_eq!(history.len(), HISTORY_LIMIT);
        assert_eq!(history[0].card.id, "3");
    }

    #[test]
    fn should_attach_the_server_review_id_to_the_matching_unsent_grade() {
        let mut history = vec![entry("all|0", "a", None), entry("all|0", "b", None)];

        attach_review_id(&mut history, "a", "good", "r1");

        assert_eq!(history[0].review_id, Some("r1".to_string()));
        assert_eq!(history[1].review_id, None);
    }

    #[test]
    fn should_only_offer_the_last_grade_when_it_belongs_to_the_asked_scope() {
        let history = vec![entry("all|0", "a", Some("r1")), entry("s1|0", "b", None)];

        assert_eq!(last_for_scope(&history, "s1|0").map(|e| e.card.id), Some("b".to_string()));
        assert_eq!(last_for_scope(&history, "all|0"), None);
    }

    #[test]
    fn should_pop_the_history_entry_only_when_it_is_the_latest_review() {
        let mut history = vec![entry("all|0", "a", Some("r1")), entry("all|0", "b", Some("r2"))];

        assert!(pop_if_review(&mut history, "r1").is_none());
        assert!(pop_if_review(&mut history, "r2").is_some());
        assert_eq!(history.len(), 1);
    }
}
