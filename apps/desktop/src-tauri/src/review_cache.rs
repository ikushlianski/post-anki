use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};

use crate::review::Card;
use crate::review_history::HistoryEntry;

const CACHE_FILE: &str = "review-cache.json";
static STORE_LOCK: Mutex<()> = Mutex::new(());

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct PendingGrade {
    pub card_id: String,
    pub grade: String,
    #[serde(default)]
    pub in_flight: bool,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub struct CacheFile {
    #[serde(default)]
    pub scope: String,
    #[serde(default)]
    pub cards: Vec<Card>,
    #[serde(default)]
    pub pending: Vec<PendingGrade>,
    #[serde(default)]
    pub history: Vec<HistoryEntry>,
}

pub fn cards_for_scope(state: &CacheFile, scope: &str) -> Vec<Card> {
    if state.scope == scope {
        state.cards.clone()
    } else {
        Vec::new()
    }
}

pub fn claim_scope(state: &mut CacheFile, scope: &str) {
    if state.scope != scope {
        state.scope = scope.to_string();
        state.cards.clear();
    }
}

pub fn restore_card_in_scope(state: &mut CacheFile, scope: &str, card: Card) {
    if state.scope == scope && !state.cards.iter().any(|known| known.id == card.id) {
        state.cards.insert(0, card);
    }
}

pub fn merge_queue(cached: &[Card], pending: &[PendingGrade], fresh: Vec<Card>, limit: usize) -> Vec<Card> {
    let complete = fresh.len() < limit;
    let fresh_ids: HashSet<String> = fresh.iter().map(|card| card.id.clone()).collect();
    let graded: HashSet<&str> = pending.iter().map(|grade| grade.card_id.as_str()).collect();
    let mut merged: Vec<Card> = cached
        .iter()
        .filter(|card| !complete || fresh_ids.contains(&card.id))
        .cloned()
        .collect();
    let mut seen: HashSet<String> = merged.iter().map(|card| card.id.clone()).collect();

    for card in fresh {
        if graded.contains(card.id.as_str()) || !seen.insert(card.id.clone()) {
            continue;
        }

        merged.push(card);
    }

    merged
}

pub fn enqueue_grade(pending: &mut Vec<PendingGrade>, card_id: &str, grade: &str) {
    let duplicate = pending.iter().any(|entry| entry.card_id == card_id && entry.grade == grade);

    if !duplicate {
        pending.push(PendingGrade { card_id: card_id.to_string(), grade: grade.to_string(), in_flight: false });
    }
}

pub fn remove_pending(pending: &mut Vec<PendingGrade>, card_id: &str, grade: &str) {
    pending.retain(|entry| !(entry.card_id == card_id && entry.grade == grade));
}

pub fn set_in_flight(pending: &mut [PendingGrade], card_id: &str, grade: &str, value: bool) {
    for entry in pending.iter_mut().filter(|entry| entry.card_id == card_id && entry.grade == grade) {
        entry.in_flight = value;
    }
}

pub fn dir_of(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map_err(|_| "The app data folder is unavailable.".to_string())
}

pub fn snapshot(dir: &Path) -> CacheFile {
    let _guard = STORE_LOCK.lock().unwrap_or_else(|poisoned| poisoned.into_inner());

    read(&dir.join(CACHE_FILE))
}

pub fn update<T>(dir: &Path, change: impl FnOnce(&mut CacheFile) -> T) -> Result<T, String> {
    let _guard = STORE_LOCK.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
    let path = dir.join(CACHE_FILE);
    let mut state = read(&path);
    let result = change(&mut state);

    write(&path, &state)?;

    Ok(result)
}

fn read(path: &Path) -> CacheFile {
    let Ok(text) = std::fs::read_to_string(path) else {
        return CacheFile::default();
    };

    match serde_json::from_str(&text) {
        Ok(state) => state,
        Err(_) => {
            let _ = std::fs::rename(path, path.with_extension("unreadable.json"));

            CacheFile::default()
        }
    }
}

fn write(path: &Path, state: &CacheFile) -> Result<(), String> {
    let text = serde_json::to_string(state).map_err(|_| "Could not save the review cache.".to_string())?;
    let temporary = path.with_extension("json.tmp");

    std::fs::write(&temporary, text)
        .and_then(|_| std::fs::rename(&temporary, path))
        .map_err(|_| "Could not save the review cache.".to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::review::Intervals;

    fn card(id: &str) -> Card {
        Card {
            id: id.to_string(),
            knowledge_bit_id: format!("kb-{id}"),
            question: format!("Q{id}"),
            answer: format!("A{id}"),
            phase: "review".to_string(),
            card_key: None,
            intervals: None,
        }
    }

    fn grade(card_id: &str, grade: &str) -> PendingGrade {
        PendingGrade { card_id: card_id.to_string(), grade: grade.to_string(), in_flight: false }
    }

    #[test]
    fn should_keep_held_cards_and_append_new_ones_when_the_batch_is_full() {
        let merged = merge_queue(&[card("a")], &[], vec![card("a"), card("b")], 2);

        assert_eq!(merged.iter().map(|c| c.id.as_str()).collect::<Vec<_>>(), vec!["a", "b"]);
    }

    #[test]
    fn should_drop_a_held_card_the_server_no_longer_lists_when_the_batch_is_short() {
        let merged = merge_queue(&[card("a"), card("gone")], &[], vec![card("a")], 20);

        assert_eq!(merged, vec![card("a")]);
    }

    #[test]
    fn should_not_queue_a_card_that_has_a_grade_waiting_to_sync() {
        let merged = merge_queue(&[], &[grade("a", "good")], vec![card("a"), card("b")], 20);

        assert_eq!(merged, vec![card("b")]);
    }

    #[test]
    fn should_return_no_cached_cards_when_asked_for_a_different_scope() {
        let state = CacheFile { scope: "s1|0".to_string(), cards: vec![card("a")], ..Default::default() };

        assert_eq!(cards_for_scope(&state, "s1|0"), vec![card("a")]);
        assert!(cards_for_scope(&state, "all|0").is_empty());
    }

    #[test]
    fn should_clear_held_cards_when_claiming_a_new_scope() {
        let mut state = CacheFile { scope: "s1|0".to_string(), cards: vec![card("a")], ..Default::default() };

        claim_scope(&mut state, "s2|0");

        assert_eq!(state.scope, "s2|0");
        assert!(state.cards.is_empty());
    }

    #[test]
    fn should_record_a_grade_once_for_the_same_card_and_grade() {
        let mut pending = Vec::new();

        enqueue_grade(&mut pending, "a", "good");
        enqueue_grade(&mut pending, "a", "good");
        enqueue_grade(&mut pending, "a", "again");

        assert_eq!(pending, vec![grade("a", "good"), grade("a", "again")]);
    }

    #[test]
    fn should_remove_only_the_sent_card_and_grade_pair() {
        let mut pending = vec![grade("a", "good"), grade("a", "again")];

        remove_pending(&mut pending, "a", "good");

        assert_eq!(pending, vec![grade("a", "again")]);
    }

    #[test]
    fn should_keep_interval_previews_when_the_cache_is_saved() {
        let mut with_intervals = card("a");

        with_intervals.intervals = Some(Intervals { again: 60, hard: 600, good: 3600, easy: 86400 });

        let text = serde_json::to_string(&with_intervals).expect("serialize");
        let back: Card = serde_json::from_str(&text).expect("deserialize");

        assert_eq!(back, with_intervals);
    }

    #[test]
    fn should_persist_the_cache_and_read_it_back() {
        let dir = std::env::temp_dir().join(format!("review-cache-test-{}", std::process::id()));
        std::fs::create_dir_all(&dir).expect("temp dir");

        update(&dir, |state| {
            state.scope = "s1|0".to_string();
            state.cards = vec![card("a")];
            state.pending = vec![grade("b", "easy")];
        })
        .expect("write");

        let saved = snapshot(&dir);
        let _ = std::fs::remove_dir_all(&dir);

        assert_eq!(saved.scope, "s1|0");
        assert_eq!(saved.cards, vec![card("a")]);
        assert_eq!(saved.pending, vec![grade("b", "easy")]);
    }
}
