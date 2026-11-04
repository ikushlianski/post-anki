use std::path::Path;
use std::sync::atomic::{AtomicBool, Ordering};

use tauri::AppHandle;

use crate::review_api::{self, should_retry};
use crate::review_cache::{self, PendingGrade};
use crate::review_history;
use crate::session;

static FLUSHING: AtomicBool = AtomicBool::new(false);

pub fn start_flush(app: AppHandle) {
    tauri::async_runtime::spawn(async move { flush(app).await });
}

pub async fn flush(app: AppHandle) {
    let Ok(dir) = review_cache::dir_of(&app) else {
        return;
    };

    loop {
        if FLUSHING.compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst).is_err() {
            return;
        }

        let finished = drain(&dir).await;

        FLUSHING.store(false, Ordering::SeqCst);

        if !finished || review_cache::snapshot(&dir).pending.is_empty() {
            return;
        }
    }
}

async fn drain(dir: &Path) -> bool {
    let Ok(Some(token)) = session::load_token() else {
        return false;
    };

    loop {
        let Some(next) = review_cache::snapshot(dir).pending.into_iter().next() else {
            return true;
        };

        let marked = review_cache::update(dir, |state| {
            review_cache::set_in_flight(&mut state.pending, &next.card_id, &next.grade, true)
        });

        if marked.is_err() {
            return false;
        }

        match review_api::submit_grade(&token, &next.card_id, &next.grade).await {
            Ok(review_id) => {
                if !record_sent(dir, &next, review_id.as_deref()) {
                    return false;
                }
            }
            Err(failure) => {
                let _ = review_cache::update(dir, |state| {
                    review_cache::set_in_flight(&mut state.pending, &next.card_id, &next.grade, false)
                });

                if should_retry(&failure) {
                    return false;
                }

                if !remove(dir, &next) {
                    return false;
                }
            }
        }
    }
}

fn record_sent(dir: &Path, sent: &PendingGrade, review_id: Option<&str>) -> bool {
    review_cache::update(dir, |state| {
        review_cache::remove_pending(&mut state.pending, &sent.card_id, &sent.grade);

        if let Some(review_id) = review_id {
            review_history::attach_review_id(&mut state.history, &sent.card_id, &sent.grade, review_id);
        }
    })
    .is_ok()
}

fn remove(dir: &Path, sent: &PendingGrade) -> bool {
    review_cache::update(dir, |state| review_cache::remove_pending(&mut state.pending, &sent.card_id, &sent.grade))
        .is_ok()
}
