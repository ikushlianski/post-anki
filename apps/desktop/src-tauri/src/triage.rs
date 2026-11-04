use reqwest::Client;
use serde::{Deserialize, Serialize};

use crate::api_client::{ApiError, API_BASE_URL};
use crate::session;
use crate::triage_api::failure;

const PENDING_REVIEW_PATH: &str = "/knowledge-bits/pending-review";

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TriageItem {
    pub id: String,
    pub body: String,
    pub background: Option<String>,
    pub subject_name: Option<String>,
    pub suggested_subject_name: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ApiBit {
    id: String,
    body: String,
    background: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ApiSource {
    subject_name: Option<String>,
    suggested_subject_name: Option<String>,
    bits: Vec<ApiBit>,
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub enum Decision {
    Accept,
    Reject,
    Skip,
}

pub fn parse_triage_items(body: &str) -> Result<Vec<TriageItem>, serde_json::Error> {
    let sources: Vec<ApiSource> = serde_json::from_str(body)?;

    Ok(sources
        .into_iter()
        .flat_map(|source| {
            let ApiSource { subject_name, suggested_subject_name, bits } = source;

            bits.into_iter().map(move |bit| TriageItem {
                id: bit.id,
                body: bit.body,
                background: bit.background.filter(|text| !text.trim().is_empty()),
                subject_name: subject_name.clone(),
                suggested_subject_name: suggested_subject_name.clone(),
            })
        })
        .collect())
}

pub fn parse_decision(decision: &str) -> Result<Decision, String> {
    match decision {
        "accept" => Ok(Decision::Accept),
        "reject" => Ok(Decision::Reject),
        "skip" => Ok(Decision::Skip),
        _ => Err("Choose accept, reject or skip.".to_string()),
    }
}

pub fn validate_id(id: &str) -> Result<(), String> {
    let is_safe = !id.is_empty()
        && id.chars().all(|character| character.is_ascii_alphanumeric() || character == '-' || character == '_');

    if is_safe {
        Ok(())
    } else {
        Err("Choose an item to decide.".to_string())
    }
}

fn decision_path(decision: Decision) -> &'static str {
    match decision {
        Decision::Accept => "approve",
        Decision::Reject => "reject",
        Decision::Skip => "inbox",
    }
}

pub fn pending_review_url() -> String {
    format!("{API_BASE_URL}{PENDING_REVIEW_PATH}")
}

pub fn decision_url(id: &str, decision: Decision) -> String {
    format!("{API_BASE_URL}/knowledge-bits/{id}/{}", decision_path(decision))
}

fn client() -> Result<Client, ApiError> {
    Client::builder()
        .build()
        .map_err(|_| ApiError::Message("Could not start the network client.".to_string()))
}

async fn fetch_triage_items(token: &str) -> Result<Vec<TriageItem>, ApiError> {
    let response = client()?
        .get(pending_review_url())
        .bearer_auth(token)
        .send()
        .await
        .map_err(|_| ApiError::Unreachable)?;

    if !response.status().is_success() {
        return Err(failure(response.status(), "Loading triage"));
    }

    let body = response.text().await.map_err(|_| ApiError::Unreachable)?;

    parse_triage_items(&body)
        .map_err(|_| ApiError::Message("Unexpected triage response from the server.".to_string()))
}

async fn submit_decision(token: &str, id: &str, decision: Decision) -> Result<(), ApiError> {
    let response = client()?
        .post(decision_url(id, decision))
        .bearer_auth(token)
        .send()
        .await
        .map_err(|_| ApiError::Unreachable)?;

    if !response.status().is_success() {
        return Err(failure(response.status(), "Saving the decision"));
    }

    Ok(())
}

#[tauri::command]
pub async fn get_triage_items() -> Result<Vec<TriageItem>, String> {
    let token = session::load_token()?.ok_or_else(|| "Sign in to open triage.".to_string())?;

    fetch_triage_items(&token).await.map_err(|err| err.message())
}

#[tauri::command]
pub async fn decide_triage_item(id: String, decision: String) -> Result<(), String> {
    validate_id(&id)?;
    let decision = parse_decision(&decision)?;
    let token = session::load_token()?.ok_or_else(|| "Sign in to decide items.".to_string())?;

    submit_decision(&token, &id, decision).await.map_err(|err| err.message())
}

#[cfg(test)]
mod tests {
    use super::*;
    use reqwest::StatusCode;

    #[test]
    fn should_flatten_pending_sources_into_one_item_per_bit_with_its_subject() {
        let body = r#"[
            {"knowledgeSourceId":"s1","subjectName":"Biology","suggestedSubjectName":null,
             "bits":[{"id":"b1","body":"Mitochondria make ATP","background":"Cell power","variants":[]},
                     {"id":"b2","body":"Ribosomes make protein","background":null,"variants":[]}]},
            {"knowledgeSourceId":"s2","subjectName":null,"suggestedSubjectName":"Chemistry","bits":[{"id":"b3","body":"Water is polar","background":"  ","variants":[]}]}
        ]"#;

        assert_eq!(
            parse_triage_items(body).expect("valid response"),
            vec![
                TriageItem {
                    id: "b1".to_string(),
                    body: "Mitochondria make ATP".to_string(),
                    background: Some("Cell power".to_string()),
                    subject_name: Some("Biology".to_string()),
                    suggested_subject_name: None,
                },
                TriageItem {
                    id: "b2".to_string(),
                    body: "Ribosomes make protein".to_string(),
                    background: None,
                    subject_name: Some("Biology".to_string()),
                    suggested_subject_name: None,
                },
                TriageItem {
                    id: "b3".to_string(),
                    body: "Water is polar".to_string(),
                    background: None,
                    subject_name: None,
                    suggested_subject_name: Some("Chemistry".to_string()),
                },
            ]
        );
    }

    #[test]
    fn should_return_an_empty_list_when_nothing_awaits_a_decision() {
        assert_eq!(parse_triage_items("[]").expect("valid response"), vec![]);
    }

    #[test]
    fn should_reject_a_triage_response_that_is_not_a_list_of_sources() {
        assert!(parse_triage_items(r#"{"error":"unauthorized"}"#).is_err());
    }

    #[test]
    fn should_accept_only_accept_reject_and_skip() {
        assert_eq!(parse_decision("accept"), Ok(Decision::Accept));
        assert_eq!(parse_decision("reject"), Ok(Decision::Reject));
        assert_eq!(parse_decision("skip"), Ok(Decision::Skip));
        assert!(parse_decision("Accept").is_err());
        assert!(parse_decision("").is_err());
    }

    #[test]
    fn should_reject_ids_that_could_change_the_request_path() {
        assert!(validate_id("kb_123-abc").is_ok());
        assert!(validate_id("").is_err());
        assert!(validate_id("../approve").is_err());
        assert!(validate_id("a/b").is_err());
    }

    #[test]
    fn should_map_each_decision_to_its_existing_api_endpoint() {
        assert_eq!(decision_url("b1", Decision::Accept), format!("{API_BASE_URL}/knowledge-bits/b1/approve"));
        assert_eq!(decision_url("b1", Decision::Reject), format!("{API_BASE_URL}/knowledge-bits/b1/reject"));
        assert_eq!(decision_url("b1", Decision::Skip), format!("{API_BASE_URL}/knowledge-bits/b1/inbox"));
        assert_eq!(pending_review_url(), format!("{API_BASE_URL}/knowledge-bits/pending-review"));
    }

    #[test]
    fn should_ask_for_sign_in_again_when_the_decision_is_unauthorized() {
        assert_eq!(
            failure(StatusCode::UNAUTHORIZED, "Saving the decision"),
            ApiError::Message("Your session has expired. Sign in again.".to_string())
        );
    }
}
