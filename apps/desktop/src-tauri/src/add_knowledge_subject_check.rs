use reqwest::Method;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

use crate::add_knowledge_http::send;
use crate::add_knowledge_input::{classify, KnowledgeInput};
use crate::session;

const SUBJECT_CHECKS_PATH: &str = "/knowledge-sources/subject-checks";
const EXCERPT_MAX_UTF16_UNITS: usize = 1_500;

#[derive(Debug, PartialEq, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Confidence {
    High,
    Medium,
    Low,
}

#[derive(Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Recommendation {
    pub subject_id: String,
    pub subject_label: String,
    pub confidence: Confidence,
    pub reason: String,
}

#[derive(Debug, PartialEq, Serialize, Deserialize)]
#[serde(tag = "status", rename_all = "lowercase")]
pub enum SubjectAdvice {
    Ok { recommendations: Vec<Recommendation> },
    #[serde(rename = "none")]
    Nothing,
    Unavailable { reason: String },
}

pub fn unavailable(reason: &str) -> SubjectAdvice {
    SubjectAdvice::Unavailable { reason: reason.to_string() }
}

pub fn excerpt(text: &str) -> String {
    let mut used = 0;

    text.chars()
        .take_while(|character| {
            used += character.len_utf16();

            used <= EXCERPT_MAX_UTF16_UNITS
        })
        .collect()
}

pub fn request_body(input: &KnowledgeInput) -> Value {
    let (kind, value) = match input {
        KnowledgeInput::Url(url) => ("url", url),
        KnowledgeInput::Text(text) => ("text", text),
    };

    json!({ "blocks": [{ "type": kind, "value": excerpt(value) }] })
}

pub fn parse_advice(body: &str) -> SubjectAdvice {
    serde_json::from_str(body).unwrap_or_else(|_| unavailable("failed"))
}

#[tauri::command]
pub async fn check_knowledge_subject(text: String) -> Result<SubjectAdvice, String> {
    let input = classify(&text).ok_or_else(|| "Write some knowledge before checking.".to_string())?;
    let token = session::load_token()?.ok_or_else(|| "Sign in to check the subject.".to_string())?;

    match send(Method::POST, SUBJECT_CHECKS_PATH, &token, Some(request_body(&input))).await {
        Ok((status, raw)) if status.is_success() => Ok(parse_advice(&raw)),
        _ => Ok(unavailable("failed")),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn should_cap_the_excerpt_at_the_api_limit_in_utf16_units() {
        let capped = excerpt(&"😀".repeat(1_000));

        assert!(capped.encode_utf16().count() <= EXCERPT_MAX_UTF16_UNITS);
        assert_eq!(excerpt(&"a".repeat(2_000)).len(), EXCERPT_MAX_UTF16_UNITS);
    }

    #[test]
    fn should_send_a_link_as_a_url_block() {
        let body = request_body(&KnowledgeInput::Url("https://example.com".to_string()));

        assert_eq!(body["blocks"][0]["type"], "url");
        assert_eq!(body["blocks"][0]["value"], "https://example.com");
    }

    #[test]
    fn should_parse_recommendations_and_ignore_fields_the_desktop_does_not_show() {
        let body = r#"{"status":"ok","recommendations":[{"subjectId":"s1","subjectLabel":"Biology","confidence":"high","reason":"Cells"}],"newSubject":null}"#;

        assert_eq!(
            parse_advice(body),
            SubjectAdvice::Ok {
                recommendations: vec![Recommendation {
                    subject_id: "s1".to_string(),
                    subject_label: "Biology".to_string(),
                    confidence: Confidence::High,
                    reason: "Cells".to_string(),
                }],
            }
        );
    }

    #[test]
    fn should_parse_a_no_match_answer() {
        assert_eq!(parse_advice(r#"{"status":"none"}"#), SubjectAdvice::Nothing);
    }

    #[test]
    fn should_keep_the_unavailable_reason_the_server_gives() {
        assert_eq!(
            parse_advice(r#"{"status":"unavailable","reason":"budget"}"#),
            unavailable("budget")
        );
    }

    #[test]
    fn should_treat_an_unreadable_answer_as_unavailable() {
        assert_eq!(parse_advice("<html>oops</html>"), unavailable("failed"));
    }
}
