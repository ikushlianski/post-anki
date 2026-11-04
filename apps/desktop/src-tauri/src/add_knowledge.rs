use reqwest::{Method, StatusCode};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

use crate::add_knowledge_http::send;
use crate::add_knowledge_input::{classify, within_limit, KnowledgeInput};
use crate::session;

const KNOWLEDGE_SOURCES_PATH: &str = "/knowledge-sources";

#[derive(Debug, PartialEq, Serialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum AddKnowledgeError {
    Duplicate { message: String },
    Message { message: String },
}

#[derive(Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AddedKnowledge {
    pub source_id: String,
    pub truncated: bool,
}

#[derive(Deserialize)]
struct ErrorBody {
    message: Option<String>,
}

#[derive(Deserialize)]
struct CreatedSource {
    id: String,
    truncated: Option<bool>,
}

fn message(text: impl Into<String>) -> AddKnowledgeError {
    AddKnowledgeError::Message { message: text.into() }
}

pub fn request_body(input: &KnowledgeInput, subject_id: Option<&str>, force: bool) -> Value {
    let mut body = match input {
        KnowledgeInput::Url(url) => json!({ "url": url, "force": force }),
        KnowledgeInput::Text(text) => json!({ "text": text, "force": force }),
    };

    if let Some(subject) = subject_id {
        body["subjectId"] = json!(subject);
    }

    body
}

pub fn parse_created(body: &str) -> Result<AddedKnowledge, AddKnowledgeError> {
    serde_json::from_str::<CreatedSource>(body)
        .map(|created| AddedKnowledge {
            source_id: created.id,
            truncated: created.truncated.unwrap_or(false),
        })
        .map_err(|_| message("Unexpected response from the server."))
}

pub fn add_failure(status: StatusCode, body: &str) -> AddKnowledgeError {
    let server_message = serde_json::from_str::<ErrorBody>(body)
        .ok()
        .and_then(|parsed| parsed.message)
        .filter(|text| !text.trim().is_empty());

    match status {
        StatusCode::UNAUTHORIZED => message("Your session has expired. Sign in again."),
        StatusCode::CONFLICT => AddKnowledgeError::Duplicate {
            message: "This knowledge is already in your library.".to_string(),
        },
        _ => match server_message {
            Some(text) => message(text),
            None => message(format!("Could not save the knowledge (HTTP {}).", status.as_u16())),
        },
    }
}

#[tauri::command]
pub async fn add_knowledge(
    subject_id: Option<String>,
    text: String,
    force: Option<bool>,
) -> Result<AddedKnowledge, AddKnowledgeError> {
    let input = classify(&text).ok_or_else(|| message("Write some knowledge before saving."))?;

    if matches!(&input, KnowledgeInput::Text(value) if !within_limit(value)) {
        return Err(message("This knowledge is too long to add. Shorten it and try again."));
    }

    let token = session::load_token()
        .map_err(|reason| message(reason))?
        .ok_or_else(|| message("Sign in to add knowledge."))?;
    let subject = subject_id.as_deref().map(str::trim).filter(|value| !value.is_empty());
    let body = request_body(&input, subject, force.unwrap_or(false));
    let (status, raw) = send(Method::POST, KNOWLEDGE_SOURCES_PATH, &token, Some(body))
        .await
        .map_err(|err| message(err.message()))?;

    if status.is_success() {
        return parse_created(&raw);
    }

    Err(add_failure(status, &raw))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn should_send_text_with_the_subject_and_force_flag() {
        let body = request_body(&KnowledgeInput::Text("Mitochondria make ATP.".to_string()), Some("subj-1"), false);

        assert_eq!(body["text"], "Mitochondria make ATP.");
        assert_eq!(body["subjectId"], "subj-1");
        assert_eq!(body["force"], false);
        assert!(body.get("url").is_none());
    }

    #[test]
    fn should_send_a_link_as_url_without_text() {
        let body = request_body(&KnowledgeInput::Url("https://example.com/a".to_string()), None, true);

        assert_eq!(body["url"], "https://example.com/a");
        assert_eq!(body["force"], true);
        assert!(body.get("text").is_none());
    }

    #[test]
    fn should_leave_the_subject_out_when_none_is_chosen() {
        let body = request_body(&KnowledgeInput::Text("Some note".to_string()), None, false);

        assert!(body.get("subjectId").is_none());
    }

    #[test]
    fn should_report_a_duplicate_on_conflict() {
        assert_eq!(
            add_failure(StatusCode::CONFLICT, r#"{"error":"already_added"}"#),
            AddKnowledgeError::Duplicate {
                message: "This knowledge is already in your library.".to_string(),
            }
        );
    }

    #[test]
    fn should_show_the_server_message_for_a_rejected_text() {
        assert_eq!(
            add_failure(StatusCode::BAD_REQUEST, r#"{"error":"invalid_input","message":"Too long."}"#),
            message("Too long.")
        );
    }

    #[test]
    fn should_fall_back_to_the_status_when_the_body_has_no_message() {
        assert_eq!(
            add_failure(StatusCode::INTERNAL_SERVER_ERROR, "<html>oops</html>"),
            message("Could not save the knowledge (HTTP 500).")
        );
    }

    #[test]
    fn should_ask_for_sign_in_again_when_unauthorized() {
        assert_eq!(
            add_failure(StatusCode::UNAUTHORIZED, ""),
            message("Your session has expired. Sign in again.")
        );
    }

    #[test]
    fn should_read_the_created_source_id_and_truncation_flag() {
        assert_eq!(
            parse_created(r#"{"id":"src-1","truncated":true}"#),
            Ok(AddedKnowledge { source_id: "src-1".to_string(), truncated: true })
        );
    }

    #[test]
    fn should_refuse_a_created_response_without_an_id() {
        assert_eq!(
            parse_created("<html>oops</html>"),
            Err(message("Unexpected response from the server."))
        );
    }
}
