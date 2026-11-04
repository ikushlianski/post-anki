use reqwest::{Client, Method};
use serde::Deserialize;

use crate::api_client::{ApiError, API_BASE_URL};
use crate::review::{Card, Intervals, ReviewCounts, DUE_CARD_LIMIT};
use crate::review_scope::ReviewScope;

const REVIEW_CARDS_PATH: &str = "/knowledge-bits/review-cards";
const REVIEWS_PATH: &str = "/knowledge-bits/reviews";
const KNOWLEDGE_BITS_PATH: &str = "/knowledge-bits";
const QUESTION_VARIANTS_PATH: &str = "/knowledge-bits/question-variants";
const GRADES: [&str; 4] = ["again", "hard", "good", "easy"];

#[derive(Debug, PartialEq)]
pub enum HttpFailure {
    Unreachable,
    Status(u16),
}

#[derive(Debug, PartialEq)]
pub enum SendFailure {
    Network,
    Status(u16),
}

impl HttpFailure {
    pub fn into_api(self, action: &str) -> ApiError {
        match self {
            Self::Unreachable => ApiError::Unreachable,
            Self::Status(401) => ApiError::Message("Your session has expired. Sign in again.".to_string()),
            Self::Status(code) => ApiError::Message(format!("{action} failed (HTTP {code}).")),
        }
    }
}

pub struct DuePage {
    pub cards: Vec<Card>,
    pub counts: ReviewCounts,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ApiCard {
    variant_id: String,
    knowledge_bit_id: String,
    prompt: String,
    answer: String,
    phase: String,
    card_key: Option<serde_json::Value>,
    interval_preview: Option<Intervals>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ApiDueCards {
    cards: Vec<ApiCard>,
    #[serde(default)]
    counts: ReviewCounts,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ApiReviewRecorded {
    review_id: Option<String>,
}

pub fn is_plain_id(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 64
        && value.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
}

pub fn validate_grade(grade: &str) -> Result<&str, String> {
    GRADES
        .into_iter()
        .find(|known| *known == grade)
        .ok_or_else(|| "Choose Again, Hard, Good or Easy.".to_string())
}

pub fn should_retry(failure: &SendFailure) -> bool {
    match failure {
        SendFailure::Network => true,
        SendFailure::Status(code) => matches!(code, 401 | 408 | 429) || *code >= 500,
    }
}

pub fn due_cards_url(scope: &ReviewScope) -> String {
    format!(
        "{API_BASE_URL}{REVIEW_CARDS_PATH}?limit={DUE_CARD_LIMIT}&tz=UTC&aheadDays={}{}",
        scope.ahead_days,
        scope.subject_query()
    )
}

pub fn reviews_url() -> String {
    format!("{API_BASE_URL}{REVIEWS_PATH}")
}

pub fn grade_body(card_id: &str, grade: &str) -> serde_json::Value {
    serde_json::json!({ "variantId": card_id, "grade": grade })
}

pub fn parse_due_page(body: &str) -> Result<DuePage, serde_json::Error> {
    let parsed: ApiDueCards = serde_json::from_str(body)?;

    Ok(DuePage {
        cards: parsed
            .cards
            .into_iter()
            .map(|card| Card {
                id: card.variant_id,
                knowledge_bit_id: card.knowledge_bit_id,
                question: card.prompt,
                answer: card.answer,
                phase: card.phase,
                card_key: card.card_key,
                intervals: card.interval_preview,
            })
            .collect(),
        counts: parsed.counts,
    })
}

pub fn parse_review_id(body: &str) -> Option<String> {
    serde_json::from_str::<ApiReviewRecorded>(body).ok()?.review_id
}

fn client() -> Result<Client, HttpFailure> {
    Client::builder().build().map_err(|_| HttpFailure::Unreachable)
}

pub async fn send(
    method: Method,
    url: String,
    token: &str,
    body: Option<serde_json::Value>,
) -> Result<String, HttpFailure> {
    let mut request = client()?.request(method, url).bearer_auth(token);

    if let Some(body) = body {
        request = request.json(&body);
    }

    let response = request.send().await.map_err(|_| HttpFailure::Unreachable)?;
    let status = response.status();
    let text = response.text().await.map_err(|_| HttpFailure::Unreachable)?;

    if status.is_success() {
        Ok(text)
    } else {
        Err(HttpFailure::Status(status.as_u16()))
    }
}

pub async fn fetch_due_cards(token: &str, scope: &ReviewScope) -> Result<DuePage, ApiError> {
    let text = send(Method::GET, due_cards_url(scope), token, None)
        .await
        .map_err(|failure| failure.into_api("Loading due cards"))?;

    parse_due_page(&text)
        .map_err(|_| ApiError::Message("Unexpected review response from the server.".to_string()))
}

pub async fn submit_grade(token: &str, card_id: &str, grade: &str) -> Result<Option<String>, SendFailure> {
    match send(Method::POST, reviews_url(), token, Some(grade_body(card_id, grade))).await {
        Ok(text) => Ok(parse_review_id(&text)),
        Err(HttpFailure::Unreachable) => Err(SendFailure::Network),
        Err(HttpFailure::Status(code)) => Err(SendFailure::Status(code)),
    }
}

pub async fn undo_review(token: &str, review_id: &str) -> Result<(), HttpFailure> {
    let url = format!("{}/{review_id}", reviews_url());

    send(Method::DELETE, url, token, None)
        .await
        .map(|_| ())
}

pub async fn patch_schedule(token: &str, knowledge_bit_id: &str, body: serde_json::Value) -> Result<(), HttpFailure> {
    let url = format!("{API_BASE_URL}{KNOWLEDGE_BITS_PATH}/{knowledge_bit_id}/schedule");

    send(Method::PATCH, url, token, Some(body)).await.map(|_| ())
}

pub async fn patch_question_variant(token: &str, variant_id: &str, body: serde_json::Value) -> Result<(), HttpFailure> {
    let url = format!("{API_BASE_URL}{QUESTION_VARIANTS_PATH}/{variant_id}");

    send(Method::PATCH, url, token, Some(body)).await.map(|_| ())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn should_map_each_due_card_and_the_remaining_counts() {
        let body = r#"{"cards":[{"variantId":"v1","knowledgeBitId":"k1","kind":"basic","prompt":"What is ATP?","answer":"Energy currency","phase":"review","cardKey":{"a":1},"intervalPreview":{"again":60,"hard":600,"good":86400,"easy":259200}}],"counts":{"new":4,"learning":1,"review":2},"newRemainingToday":5,"nextDueAt":null}"#;
        let page = parse_due_page(body).expect("valid response");

        assert_eq!(page.cards.len(), 1);
        assert_eq!(page.cards[0].id, "v1");
        assert_eq!(page.cards[0].knowledge_bit_id, "k1");
        assert_eq!(page.cards[0].phase, "review");
        assert_eq!(page.cards[0].intervals.as_ref().map(|i| i.good), Some(86400));
        assert!(page.cards[0].card_key.is_some());
        assert_eq!((page.counts.new_cards, page.counts.learning, page.counts.review), (4, 1, 2));
    }

    #[test]
    fn should_accept_a_response_without_counts_or_card_key() {
        let page = parse_due_page(r#"{"cards":[]}"#).expect("valid response");

        assert!(page.cards.is_empty());
        assert_eq!(page.counts, ReviewCounts::default());
    }

    #[test]
    fn should_reject_a_due_cards_response_without_a_cards_list() {
        assert!(parse_due_page(r#"{"error":"unauthorized"}"#).is_err());
    }

    #[test]
    fn should_read_the_review_id_from_a_recorded_grade() {
        assert_eq!(parse_review_id(r#"{"reviewId":"r9","cardKey":null}"#), Some("r9".to_string()));
        assert_eq!(parse_review_id(r#"{"ok":true}"#), None);
    }

    #[test]
    fn should_send_the_card_as_variant_id_with_the_grade() {
        assert_eq!(grade_body("v1", "good").to_string(), r#"{"grade":"good","variantId":"v1"}"#);
    }

    #[test]
    fn should_accept_only_the_four_server_grades() {
        for grade in ["again", "hard", "good", "easy"] {
            assert_eq!(validate_grade(grade), Ok(grade));
        }

        assert!(validate_grade("Good").is_err());
        assert!(validate_grade("").is_err());
    }

    #[test]
    fn should_add_the_ahead_days_and_subject_to_the_due_cards_url() {
        let scoped = ReviewScope { subject_id: Some("s-1".to_string()), ahead_days: 3 };
        let all = ReviewScope::default();

        assert!(due_cards_url(&scoped).ends_with("/knowledge-bits/review-cards?limit=20&tz=UTC&aheadDays=3&subjectId=s-1"));
        assert!(due_cards_url(&all).ends_with("&aheadDays=0"));
    }

    #[test]
    fn should_keep_a_grade_queued_on_network_loss_and_server_outages() {
        assert!(should_retry(&SendFailure::Network));
        assert!(should_retry(&SendFailure::Status(500)));
        assert!(should_retry(&SendFailure::Status(401)));
        assert!(should_retry(&SendFailure::Status(429)));
    }

    #[test]
    fn should_drop_a_grade_the_server_refuses_for_good() {
        assert!(!should_retry(&SendFailure::Status(404)));
        assert!(!should_retry(&SendFailure::Status(403)));
        assert!(!should_retry(&SendFailure::Status(409)));
    }

    #[test]
    fn should_accept_only_plain_ids_in_urls() {
        assert!(is_plain_id("abc-123_X"));
        assert!(!is_plain_id(""));
        assert!(!is_plain_id("a/b"));
        assert!(!is_plain_id("a?b=c"));
    }
}
