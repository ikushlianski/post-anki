use serde::{Deserialize, Serialize};
use tauri::AppHandle;

use crate::review_api::{self, validate_grade};
use crate::review_cache::{self, merge_queue};
use crate::review_history::{push_history, HistoryEntry};
use crate::review_scope::ReviewScope;
use crate::review_sync;
use crate::session;

pub const DUE_CARD_LIMIT: usize = 20;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Intervals {
    pub again: u64,
    pub hard: u64,
    pub good: u64,
    pub easy: u64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Card {
    pub id: String,
    #[serde(default)]
    pub knowledge_bit_id: String,
    pub question: String,
    pub answer: String,
    #[serde(default)]
    pub phase: String,
    #[serde(default)]
    pub card_key: Option<serde_json::Value>,
    #[serde(default)]
    pub intervals: Option<Intervals>,
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Serialize, Deserialize)]
pub struct ReviewCounts {
    #[serde(rename = "new", default)]
    pub new_cards: u32,
    #[serde(default)]
    pub learning: u32,
    #[serde(default)]
    pub review: u32,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReviewBatch {
    pub cards: Vec<Card>,
    pub offline: bool,
    pub pending: usize,
    pub counts: Option<ReviewCounts>,
}

#[derive(Serialize)]
pub struct SyncStatus {
    pub pending: usize,
}

#[tauri::command]
pub async fn get_due_cards(app: AppHandle, scope: Option<ReviewScope>) -> Result<ReviewBatch, String> {
    let scope = ReviewScope::resolve(scope)?;
    let key = scope.key();
    let dir = review_cache::dir_of(&app)?;
    let token = session::load_token()?.ok_or_else(|| "Sign in to start a review.".to_string())?;

    review_sync::start_flush(app.clone());

    match review_api::fetch_due_cards(&token, &scope).await {
        Ok(page) => {
            let state = review_cache::update(&dir, |state| {
                review_cache::claim_scope(state, &key);
                state.cards = merge_queue(&state.cards, &state.pending, page.cards, DUE_CARD_LIMIT);

                state.clone()
            })?;

            Ok(ReviewBatch {
                cards: state.cards,
                offline: false,
                pending: state.pending.len(),
                counts: Some(page.counts),
            })
        }
        Err(err) => {
            let state = review_cache::snapshot(&dir);
            let cards = review_cache::cards_for_scope(&state, &key);

            if cards.is_empty() {
                return Err(err.message());
            }

            Ok(ReviewBatch { cards, offline: true, pending: state.pending.len(), counts: None })
        }
    }
}

#[tauri::command]
pub async fn grade_card(
    app: AppHandle,
    card_id: String,
    grade: String,
    scope: Option<ReviewScope>,
    card: Option<Card>,
) -> Result<SyncStatus, String> {
    if card_id.trim().is_empty() {
        return Err("Choose a card to grade.".to_string());
    }

    let grade = validate_grade(&grade)?;
    let key = ReviewScope::resolve(scope)?.key();
    let dir = review_cache::dir_of(&app)?;
    let pending = review_cache::update(&dir, |state| {
        let known = card
            .filter(|sent| sent.id == card_id)
            .or_else(|| state.cards.iter().find(|held| held.id == card_id).cloned());

        state.cards.retain(|held| held.id != card_id);
        review_cache::enqueue_grade(&mut state.pending, &card_id, grade);

        if let Some(known) = known {
            push_history(
                &mut state.history,
                HistoryEntry { scope: key.clone(), card: known, grade: grade.to_string(), review_id: None },
            );
        }

        state.pending.len()
    })?;

    review_sync::start_flush(app);

    Ok(SyncStatus { pending })
}

#[tauri::command]
pub async fn sync_pending_grades(app: AppHandle) -> Result<SyncStatus, String> {
    let dir = review_cache::dir_of(&app)?;

    review_sync::flush(app).await;

    Ok(SyncStatus { pending: review_cache::snapshot(&dir).pending.len() })
}
