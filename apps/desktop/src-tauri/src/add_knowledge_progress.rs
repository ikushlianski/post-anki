use reqwest::{Method, StatusCode};
use serde::{Deserialize, Serialize};

use crate::add_knowledge_http::send;
use crate::session;

const SOURCE_ID_MAX_LEN: usize = 100;

#[derive(Debug, PartialEq, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum RegenerationState {
    Running,
    Done,
    NothingExtracted,
    Failed,
}

#[derive(Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SourceStatus {
    pub status: RegenerationState,
    #[serde(default)]
    pub failure_reason: Option<String>,
    #[serde(default)]
    pub card_count: Option<u32>,
}

pub fn is_valid_source_id(id: &str) -> bool {
    !id.is_empty()
        && id.len() <= SOURCE_ID_MAX_LEN
        && id.chars().all(|character| character.is_ascii_alphanumeric() || character == '_' || character == '-')
}

pub fn parse_status(body: &str) -> Result<SourceStatus, String> {
    serde_json::from_str(body).map_err(|_| "Unexpected progress response from the server.".to_string())
}

pub fn status_failure(status: StatusCode) -> String {
    match status {
        StatusCode::UNAUTHORIZED => "Your session has expired. Sign in again.".to_string(),
        StatusCode::NOT_FOUND => "That item no longer exists.".to_string(),
        other => format!("Could not check progress (HTTP {}).", other.as_u16()),
    }
}

#[tauri::command]
pub async fn get_knowledge_source_status(source_id: String) -> Result<SourceStatus, String> {
    if !is_valid_source_id(&source_id) {
        return Err("Unknown knowledge source.".to_string());
    }

    let token = session::load_token()?.ok_or_else(|| "Sign in to check progress.".to_string())?;
    let path = format!("/knowledge-sources/{source_id}/regeneration");
    let (status, raw) = send(Method::GET, &path, &token, None)
        .await
        .map_err(|err| err.message())?;

    if !status.is_success() {
        return Err(status_failure(status));
    }

    parse_status(&raw)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn should_accept_a_plain_source_id() {
        assert!(is_valid_source_id("abc_DEF-123"));
    }

    #[test]
    fn should_refuse_source_ids_that_could_change_the_request_path() {
        assert!(!is_valid_source_id(""));
        assert!(!is_valid_source_id("../subjects"));
        assert!(!is_valid_source_id(&"a".repeat(SOURCE_ID_MAX_LEN + 1)));
    }

    #[test]
    fn should_read_a_running_status_without_a_card_count() {
        assert_eq!(
            parse_status(r#"{"status":"running","failureReason":null}"#),
            Ok(SourceStatus {
                status: RegenerationState::Running,
                failure_reason: None,
                card_count: None,
            })
        );
    }

    #[test]
    fn should_read_a_finished_status_with_its_card_count() {
        assert_eq!(
            parse_status(r#"{"status":"done","failureReason":null,"cardCount":3}"#),
            Ok(SourceStatus {
                status: RegenerationState::Done,
                failure_reason: None,
                card_count: Some(3),
            })
        );
    }

    #[test]
    fn should_read_a_nothing_extracted_status() {
        assert_eq!(
            parse_status(r#"{"status":"nothing_extracted","failureReason":null}"#).map(|parsed| parsed.status),
            Ok(RegenerationState::NothingExtracted)
        );
    }

    #[test]
    fn should_refuse_a_status_it_does_not_know() {
        assert!(parse_status(r#"{"status":"exploded"}"#).is_err());
    }

    #[test]
    fn should_ask_for_sign_in_again_when_the_progress_request_is_unauthorized() {
        assert_eq!(
            status_failure(StatusCode::UNAUTHORIZED),
            "Your session has expired. Sign in again."
        );
    }
}
