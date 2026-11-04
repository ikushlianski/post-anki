use reqwest::StatusCode;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

use crate::api_client::{ApiError, API_BASE_URL};
use crate::cram::is_safe_id;
use crate::subjects::Subject;

const MAX_NAME_LENGTH: usize = 120;
const OVERVIEW_LIMIT: u32 = 100;
const DEFAULT_KIND: &str = "architecture-mentor";

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SubjectBit {
    #[serde(rename = "knowledgeBitId")]
    pub id: String,
    pub question: String,
    pub answer: String,
    pub state: String,
    pub due_at: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SubjectBitPage {
    pub items: Vec<SubjectBit>,
    pub has_more: bool,
}

pub fn clean_name(raw: &str) -> Result<String, String> {
    let name = raw.trim();

    if name.is_empty() {
        return Err("Enter a subject name.".to_string());
    }

    if name.chars().count() > MAX_NAME_LENGTH {
        return Err(format!("Subject names are at most {MAX_NAME_LENGTH} characters."));
    }

    Ok(name.to_string())
}

pub fn create_body(raw_name: &str, parent_id: Option<&str>) -> Result<Value, String> {
    let name = clean_name(raw_name)?;

    if let Some(parent) = parent_id {
        if !is_safe_id(parent) {
            return Err("That parent subject id is not valid.".to_string());
        }
    }

    Ok(json!({ "name": name, "kind": DEFAULT_KIND, "parentId": parent_id }))
}

pub fn rename_body(raw_name: &str) -> Result<Value, String> {
    Ok(json!({ "name": clean_name(raw_name)? }))
}

pub fn subjects_url() -> String {
    format!("{API_BASE_URL}/subjects")
}

pub fn subject_url(subject_id: &str) -> String {
    format!("{API_BASE_URL}/subjects/{subject_id}")
}

pub fn overview_url(subject_id: &str) -> String {
    format!("{API_BASE_URL}/knowledge-bits/overview?subjectId={subject_id}&limit={OVERVIEW_LIMIT}")
}

pub fn parse_subject(body: &str) -> Result<Subject, serde_json::Error> {
    serde_json::from_str(body)
}

pub fn parse_page(body: &str) -> Result<SubjectBitPage, serde_json::Error> {
    serde_json::from_str(body)
}

pub fn mutation_failure(status: StatusCode) -> ApiError {
    match status {
        StatusCode::UNAUTHORIZED => {
            ApiError::Message("Your session has expired. Sign in again.".to_string())
        }
        StatusCode::NOT_FOUND => {
            ApiError::Message("That subject no longer exists. Refresh the list.".to_string())
        }
        StatusCode::BAD_REQUEST => {
            ApiError::Message("The server rejected that change.".to_string())
        }
        other => ApiError::Message(format!("Subject request failed (HTTP {}).", other.as_u16())),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn should_trim_a_subject_name_before_sending_it() {
        assert_eq!(clean_name("  Biology  "), Ok("Biology".to_string()));
    }

    #[test]
    fn should_reject_a_blank_subject_name() {
        assert_eq!(clean_name("   "), Err("Enter a subject name.".to_string()));
    }

    #[test]
    fn should_reject_a_name_longer_than_120_characters() {
        assert!(clean_name(&"a".repeat(121)).is_err());
        assert!(clean_name(&"a".repeat(120)).is_ok());
    }

    #[test]
    fn should_create_a_root_subject_with_a_null_parent() {
        assert_eq!(
            create_body("Biology", None).expect("valid body"),
            json!({ "name": "Biology", "kind": "architecture-mentor", "parentId": null })
        );
    }

    #[test]
    fn should_create_a_sub_subject_under_the_given_parent() {
        assert_eq!(
            create_body("Sales", Some("sub_1")).expect("valid body")["parentId"],
            json!("sub_1")
        );
    }

    #[test]
    fn should_refuse_a_parent_id_with_path_characters() {
        assert!(create_body("Sales", Some("../etc")).is_err());
    }

    #[test]
    fn should_send_only_the_trimmed_name_on_rename() {
        assert_eq!(rename_body(" Sales ").expect("valid body"), json!({ "name": "Sales" }));
    }

    #[test]
    fn should_build_subject_and_overview_urls_from_the_prod_paths() {
        assert_eq!(subjects_url(), format!("{API_BASE_URL}/subjects"));
        assert_eq!(subject_url("s1"), format!("{API_BASE_URL}/subjects/s1"));
        assert_eq!(
            overview_url("s1"),
            format!("{API_BASE_URL}/knowledge-bits/overview?subjectId=s1&limit=100")
        );
    }

    #[test]
    fn should_parse_a_created_subject_and_ignore_extra_fields() {
        let body = r#"{"id":"s9","name":"Sales","kind":"architecture-mentor","parentId":"s1","sortOrder":null}"#;

        assert_eq!(
            parse_subject(body).expect("valid subject"),
            Subject { id: "s9".to_string(), name: "Sales".to_string(), parent_id: Some("s1".to_string()) }
        );
    }

    #[test]
    fn should_parse_an_overview_page_with_optional_due_date() {
        let body = r#"{"items":[{"knowledgeBitId":"kb1","question":"Q","answer":"A","subjectId":"s1","state":"new","dueAt":null,"lapses":0,"sourceLinks":[]}],"hasMore":false}"#;

        assert_eq!(
            parse_page(body).expect("valid page"),
            SubjectBitPage {
                items: vec![SubjectBit {
                    id: "kb1".to_string(),
                    question: "Q".to_string(),
                    answer: "A".to_string(),
                    state: "new".to_string(),
                    due_at: None,
                }],
                has_more: false,
            }
        );
    }

    #[test]
    fn should_ask_for_sign_in_again_when_a_change_is_unauthorized() {
        assert_eq!(
            mutation_failure(StatusCode::UNAUTHORIZED),
            ApiError::Message("Your session has expired. Sign in again.".to_string())
        );
    }
}
