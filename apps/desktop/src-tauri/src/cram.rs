use reqwest::{Client, StatusCode};
use serde::{Deserialize, Serialize};

use crate::api_client::{ApiError, API_BASE_URL};
use crate::session;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct CramCard {
    pub id: String,
    pub question: String,
    pub answer: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct CurriculumRef {
    id: String,
    subject_id: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct CardRow {
    variant_id: String,
    prompt: String,
    answer: String,
}

pub fn curricula_url(subject_id: &str) -> String {
    format!("{API_BASE_URL}/curricula?subjectId={subject_id}")
}

pub fn curriculum_cards_url(curriculum_id: &str) -> String {
    format!("{API_BASE_URL}/curricula/{curriculum_id}/cards")
}

pub fn is_safe_id(id: &str) -> bool {
    !id.is_empty() && id.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
}

pub fn cards_failure(status: StatusCode) -> ApiError {
    match status {
        StatusCode::UNAUTHORIZED => {
            ApiError::Message("Your session has expired. Sign in again.".to_string())
        }
        other => ApiError::Message(format!("Cards request failed (HTTP {}).", other.as_u16())),
    }
}

fn parse_curricula(body: &str) -> Result<Vec<CurriculumRef>, serde_json::Error> {
    serde_json::from_str(body)
}

fn parse_card_rows(body: &str) -> Result<Vec<CardRow>, serde_json::Error> {
    serde_json::from_str(body)
}

fn to_cram_cards(rows: Vec<CardRow>) -> Vec<CramCard> {
    rows.into_iter()
        .map(|row| CramCard { id: row.variant_id, question: row.prompt, answer: row.answer })
        .collect()
}

async fn get_body(token: &str, url: &str) -> Result<String, ApiError> {
    let client = Client::builder()
        .build()
        .map_err(|_| ApiError::Message("Could not start the network client.".to_string()))?;
    let response = client
        .get(url)
        .bearer_auth(token)
        .send()
        .await
        .map_err(|_| ApiError::Unreachable)?;

    if !response.status().is_success() {
        return Err(cards_failure(response.status()));
    }

    response.text().await.map_err(|_| ApiError::Unreachable)
}

fn unexpected() -> ApiError {
    ApiError::Message("Unexpected cards response from the server.".to_string())
}

async fn fetch_subject_cards(token: &str, subject_id: &str) -> Result<Vec<CramCard>, ApiError> {
    let curricula = parse_curricula(&get_body(token, &curricula_url(subject_id)).await?)
        .map_err(|_| unexpected())?;
    let mut cards = Vec::new();

    for curriculum in curricula.iter().filter(|item| item.subject_id == subject_id) {
        let body = get_body(token, &curriculum_cards_url(&curriculum.id)).await?;
        let rows = parse_card_rows(&body).map_err(|_| unexpected())?;

        cards.extend(to_cram_cards(rows));
    }

    Ok(cards)
}

#[tauri::command]
pub async fn get_subject_cards(subject_id: String) -> Result<Vec<CramCard>, String> {
    if !is_safe_id(&subject_id) {
        return Err("That subject id is not valid.".to_string());
    }

    let token = session::load_token()?.ok_or_else(|| "Sign in to start a cram.".to_string())?;

    fetch_subject_cards(&token, &subject_id).await.map_err(|err| err.message())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn should_build_the_curricula_url_filtered_by_subject() {
        assert_eq!(
            curricula_url("subj-1"),
            format!("{API_BASE_URL}/curricula?subjectId=subj-1")
        );
    }

    #[test]
    fn should_build_the_cards_url_for_one_curriculum() {
        assert_eq!(
            curriculum_cards_url("cur-9"),
            format!("{API_BASE_URL}/curricula/cur-9/cards")
        );
    }

    #[test]
    fn should_reject_subject_ids_that_could_change_the_url() {
        assert!(is_safe_id("abc-123_X"));
        assert!(!is_safe_id(""));
        assert!(!is_safe_id("a/../b"));
        assert!(!is_safe_id("a&subjectId=other"));
    }

    #[test]
    fn should_map_each_browser_row_to_a_cram_card_with_its_variant_id() {
        let body = r#"[{"variantId":"v1","cardId":"c1","concept":"x","prompt":"Q?","answer":"A","topicId":"t","topicTitle":"T"}]"#;
        let rows = parse_card_rows(body).expect("valid rows");

        assert_eq!(
            to_cram_cards(rows),
            vec![CramCard { id: "v1".to_string(), question: "Q?".to_string(), answer: "A".to_string() }]
        );
    }

    #[test]
    fn should_keep_only_the_curricula_that_belong_to_the_subject() {
        let body = r#"[{"id":"c1","subjectId":"s1","name":"a"},{"id":"c2","subjectId":"s2","name":"b"}]"#;
        let kept: Vec<String> = parse_curricula(body)
            .expect("valid list")
            .into_iter()
            .filter(|item| item.subject_id == "s1")
            .map(|item| item.id)
            .collect();

        assert_eq!(kept, vec!["c1".to_string()]);
    }

    #[test]
    fn should_ask_for_sign_in_again_when_the_cards_request_is_unauthorized() {
        assert_eq!(
            cards_failure(StatusCode::UNAUTHORIZED),
            ApiError::Message("Your session has expired. Sign in again.".to_string())
        );
    }
}
