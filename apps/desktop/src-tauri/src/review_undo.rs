use std::path::Path;

use serde::Serialize;
use tauri::AppHandle;

use crate::review::Card;
use crate::review_api::{self, is_plain_id, HttpFailure};
use crate::review_cache::{self, CacheFile, PendingGrade};
use crate::review_history::{self, HistoryEntry};
use crate::review_scope::ReviewScope;
use crate::session;

const IN_FLIGHT_MESSAGE: &str = "That grade is still being saved. Try again in a moment.";
const REFUSED_MESSAGE: &str = "That grade can't be undone any more, because the card was reviewed again since.";
const NOTHING_MESSAGE: &str = "Nothing to undo.";

#[derive(Debug, Clone, PartialEq)]
pub enum UndoPlan {
    Local,
    Server(String),
    Refuse(&'static str),
}

pub fn plan_undo(entry: &HistoryEntry, pending: &[PendingGrade]) -> UndoPlan {
    if let Some(review_id) = &entry.review_id {
        return UndoPlan::Server(review_id.clone());
    }

    let in_flight = pending
        .iter()
        .any(|queued| queued.in_flight && queued.card_id == entry.card.id && queued.grade == entry.grade);

    if in_flight {
        UndoPlan::Refuse(IN_FLIGHT_MESSAGE)
    } else {
        UndoPlan::Local
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UndoOutcome {
    pub card: Card,
    pub pending: usize,
}

enum Step {
    Nothing,
    Refused(&'static str),
    Done(UndoOutcome),
    Server { review_id: String, card: Card },
}

fn take_local_or_plan(state: &mut CacheFile, key: &str) -> Step {
    let Some(entry) = review_history::last_for_scope(&state.history, key) else {
        return Step::Nothing;
    };

    match plan_undo(&entry, &state.pending) {
        UndoPlan::Refuse(message) => Step::Refused(message),
        UndoPlan::Server(review_id) => Step::Server { review_id, card: entry.card },
        UndoPlan::Local => {
            state.history.pop();
            review_cache::remove_pending(&mut state.pending, &entry.card.id, &entry.grade);
            review_cache::restore_card_in_scope(state, key, entry.card.clone());

            Step::Done(UndoOutcome { card: entry.card, pending: state.pending.len() })
        }
    }
}

#[tauri::command]
pub async fn undo_last_grade(app: AppHandle, scope: Option<ReviewScope>) -> Result<UndoOutcome, String> {
    let key = ReviewScope::resolve(scope)?.key();
    let dir = review_cache::dir_of(&app)?;

    match review_cache::update(&dir, |state| take_local_or_plan(state, &key))? {
        Step::Nothing => Err(NOTHING_MESSAGE.to_string()),
        Step::Refused(message) => Err(message.to_string()),
        Step::Done(outcome) => Ok(outcome),
        Step::Server { review_id, card } => undo_on_server(&dir, &key, review_id, card).await,
    }
}

async fn undo_on_server(dir: &Path, key: &str, review_id: String, card: Card) -> Result<UndoOutcome, String> {
    if !is_plain_id(&review_id) {
        return Err(REFUSED_MESSAGE.to_string());
    }

    let token = session::load_token()?.ok_or_else(|| "Sign in to undo a grade.".to_string())?;

    match review_api::undo_review(&token, &review_id).await {
        Ok(()) => review_cache::update(dir, |state| {
            review_history::pop_if_review(&mut state.history, &review_id);
            review_cache::restore_card_in_scope(state, key, card.clone());

            UndoOutcome { card, pending: state.pending.len() }
        }),
        Err(HttpFailure::Status(404 | 409)) => {
            review_cache::update(dir, |state| review_history::pop_if_review(&mut state.history, &review_id))?;

            Err(REFUSED_MESSAGE.to_string())
        }
        Err(failure) => Err(failure.into_api("Undo").message()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn entry(review_id: Option<&str>) -> HistoryEntry {
        HistoryEntry {
            scope: "all|0".to_string(),
            card: Card {
                id: "v1".to_string(),
                knowledge_bit_id: "k1".to_string(),
                question: "Q".to_string(),
                answer: "A".to_string(),
                phase: "review".to_string(),
                card_key: None,
                intervals: None,
            },
            grade: "good".to_string(),
            review_id: review_id.map(str::to_string),
        }
    }

    fn queued(in_flight: bool) -> PendingGrade {
        PendingGrade { card_id: "v1".to_string(), grade: "good".to_string(), in_flight }
    }

    #[test]
    fn should_undo_a_sent_grade_on_the_server_by_its_review_id() {
        assert_eq!(plan_undo(&entry(Some("r1")), &[]), UndoPlan::Server("r1".to_string()));
    }

    #[test]
    fn should_remove_an_unsent_grade_locally_when_it_is_not_being_saved() {
        assert_eq!(plan_undo(&entry(None), &[queued(false)]), UndoPlan::Local);
    }

    #[test]
    fn should_refuse_to_undo_a_grade_that_is_being_saved_right_now() {
        assert_eq!(plan_undo(&entry(None), &[queued(true)]), UndoPlan::Refuse(IN_FLIGHT_MESSAGE));
    }
}
