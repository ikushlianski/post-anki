use reqwest::Method;
use serde_json::{json, Value};

use crate::triage::validate_id;
use crate::triage_api::{delete_empty, post_empty, require_token, send};
use crate::triage_lists::{parse_bulk_result, BulkApprovalResult};

const SNOOZE_MIN_DAYS: u32 = 1;
const SNOOZE_MAX_DAYS: u32 = 30;
const BULK_MAX_IDS: usize = 200;

#[derive(Debug, Clone, Copy, PartialEq)]
pub enum UndoStep {
    RestoreDecided,
    ReturnFromInbox,
}

pub fn undo_step(decision: &str) -> Result<UndoStep, String> {
    match decision {
        "accept" | "reject" => Ok(UndoStep::RestoreDecided),
        "skip" => Ok(UndoStep::ReturnFromInbox),
        _ => Err("Only accept, reject or skip can be undone.".to_string()),
    }
}

pub fn validate_snooze_days(days: u32) -> Result<u32, String> {
    if (SNOOZE_MIN_DAYS..=SNOOZE_MAX_DAYS).contains(&days) {
        Ok(days)
    } else {
        Err(format!("Snooze between {SNOOZE_MIN_DAYS} and {SNOOZE_MAX_DAYS} days."))
    }
}

pub fn validate_ids(ids: &[String]) -> Result<(), String> {
    if ids.is_empty() || ids.len() > BULK_MAX_IDS {
        return Err(format!("Choose between 1 and {BULK_MAX_IDS} items."));
    }

    ids.iter().try_for_each(|id| validate_id(id))
}

pub fn clean_body(text: &str) -> Result<String, String> {
    let trimmed = text.trim();

    if trimmed.is_empty() {
        Err("The card text cannot be empty.".to_string())
    } else {
        Ok(trimmed.to_string())
    }
}

pub fn bring_back_body(suspended: bool, variant_id: Option<&str>) -> Value {
    let mut body = if suspended {
        json!({ "suspended": false })
    } else {
        json!({ "buried": false })
    };

    if let Some(variant) = variant_id {
        body["variantId"] = json!(variant);
    }

    body
}

#[tauri::command]
pub async fn undo_triage_decision(id: String, decision: String) -> Result<(), String> {
    validate_id(&id)?;
    let step = undo_step(&decision)?;
    let token = require_token("Sign in to undo decisions.")?;

    let result = match step {
        UndoStep::RestoreDecided => {
            post_empty(&token, &format!("/knowledge-bits/{id}/restore"), "Undoing the decision").await
        }
        UndoStep::ReturnFromInbox => {
            delete_empty(&token, &format!("/knowledge-bits/{id}/inbox"), "Undoing the decision").await
        }
    };

    result.map_err(|err| err.message())
}

#[tauri::command]
pub async fn send_to_chat(id: String) -> Result<(), String> {
    validate_id(&id)?;
    let token = require_token("Sign in to send items to chat.")?;

    post_empty(&token, &format!("/knowledge-bits/{id}/chat-queue"), "Sending to chat")
        .await
        .map_err(|err| err.message())
}

#[tauri::command]
pub async fn return_from_chat(id: String) -> Result<(), String> {
    validate_id(&id)?;
    let token = require_token("Sign in to change chat items.")?;

    delete_empty(&token, &format!("/knowledge-bits/{id}/chat-queue"), "Returning from chat")
        .await
        .map_err(|err| err.message())
}

#[tauri::command]
pub async fn snooze_chat(id: String, days: u32) -> Result<(), String> {
    validate_id(&id)?;
    let days = validate_snooze_days(days)?;
    let token = require_token("Sign in to snooze items.")?;

    send(
        Method::POST,
        &format!("/knowledge-bits/{id}/chat-queue/snooze"),
        &token,
        Some(json!({ "days": days })),
        "Snoozing",
    )
    .await
    .map(|_| ())
    .map_err(|err| err.message())
}

#[tauri::command]
pub async fn return_from_inbox(id: String) -> Result<(), String> {
    validate_id(&id)?;
    let token = require_token("Sign in to change the inbox.")?;

    delete_empty(&token, &format!("/knowledge-bits/{id}/inbox"), "Returning from the inbox")
        .await
        .map_err(|err| err.message())
}

#[tauri::command]
pub async fn discard_from_inbox(id: String) -> Result<(), String> {
    validate_id(&id)?;
    let token = require_token("Sign in to discard items.")?;

    post_empty(&token, &format!("/knowledge-bits/{id}/inbox/discard"), "Discarding")
        .await
        .map_err(|err| err.message())
}

#[tauri::command]
pub async fn approve_inbox_item(id: String) -> Result<(), String> {
    validate_id(&id)?;
    let token = require_token("Sign in to approve items.")?;

    delete_empty(&token, &format!("/knowledge-bits/{id}/inbox"), "Approving")
        .await
        .map_err(|err| err.message())?;

    post_empty(&token, &format!("/knowledge-bits/{id}/approve"), "Approving")
        .await
        .map_err(|err| format!("{} The item is back in triage.", err.message()))
}

#[tauri::command]
pub async fn edit_knowledge_bit(id: String, body: String, background: Option<String>) -> Result<(), String> {
    validate_id(&id)?;
    let body = clean_body(&body)?;
    let background = background.map(|text| text.trim().to_string()).filter(|text| !text.is_empty());
    let token = require_token("Sign in to edit items.")?;

    send(
        Method::PATCH,
        &format!("/knowledge-bits/{id}"),
        &token,
        Some(json!({ "body": body, "background": background })),
        "Saving the edit",
    )
    .await
    .map(|_| ())
    .map_err(|err| err.message())
}

#[tauri::command]
pub async fn approve_bulk(ids: Vec<String>) -> Result<BulkApprovalResult, String> {
    validate_ids(&ids)?;
    let token = require_token("Sign in to approve items.")?;

    let body = send(
        Method::POST,
        "/knowledge-bits/approvals",
        &token,
        Some(json!({ "knowledgeBitIds": ids })),
        "Approving",
    )
    .await
    .map_err(|err| err.message())?;

    parse_bulk_result(&body).map_err(|err| err.message())
}

#[tauri::command]
pub async fn restore_rejected(id: String) -> Result<(), String> {
    validate_id(&id)?;
    let token = require_token("Sign in to restore items.")?;

    post_empty(&token, &format!("/knowledge-bits/{id}/restore-rejected"), "Restoring")
        .await
        .map_err(|err| err.message())
}

#[tauri::command]
pub async fn bring_back_suspended(id: String, variant_id: Option<String>, suspended: bool) -> Result<(), String> {
    validate_id(&id)?;

    if let Some(variant) = variant_id.as_deref() {
        validate_id(variant)?;
    }

    let token = require_token("Sign in to change schedules.")?;

    send(
        Method::PATCH,
        &format!("/knowledge-bits/{id}/schedule"),
        &token,
        Some(bring_back_body(suspended, variant_id.as_deref())),
        "Bringing the card back",
    )
    .await
    .map(|_| ())
    .map_err(|err| err.message())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn should_undo_accept_and_reject_by_restoring_and_skip_by_returning_from_inbox() {
        assert_eq!(undo_step("accept"), Ok(UndoStep::RestoreDecided));
        assert_eq!(undo_step("reject"), Ok(UndoStep::RestoreDecided));
        assert_eq!(undo_step("skip"), Ok(UndoStep::ReturnFromInbox));
        assert!(undo_step("delete").is_err());
    }

    #[test]
    fn should_keep_snooze_within_the_api_range_of_one_to_thirty_days() {
        assert!(validate_snooze_days(0).is_err());
        assert_eq!(validate_snooze_days(7), Ok(7));
        assert!(validate_snooze_days(31).is_err());
    }

    #[test]
    fn should_reject_empty_or_oversized_bulk_selections_and_unsafe_ids() {
        assert!(validate_ids(&[]).is_err());
        assert!(validate_ids(&["b1".to_string(), "../x".to_string()]).is_err());
        assert!(validate_ids(&vec!["b1".to_string(); BULK_MAX_IDS + 1]).is_err());
        assert!(validate_ids(&["b1".to_string(), "b2".to_string()]).is_ok());
    }

    #[test]
    fn should_trim_card_text_and_refuse_blank_text() {
        assert_eq!(clean_body("  Mitochondria  "), Ok("Mitochondria".to_string()));
        assert!(clean_body("   ").is_err());
    }

    #[test]
    fn should_clear_only_the_flag_that_is_set_and_target_the_variant_when_given() {
        assert_eq!(bring_back_body(true, None), json!({ "suspended": false }));
        assert_eq!(bring_back_body(false, Some("v1")), json!({ "buried": false, "variantId": "v1" }));
    }

}
