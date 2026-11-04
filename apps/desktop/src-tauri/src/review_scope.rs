use reqwest::Method;
use serde::{Deserialize, Serialize};

use crate::api_client::API_BASE_URL;
use crate::review_api::{is_plain_id, send};
use crate::session;

pub const MAX_AHEAD_DAYS: u8 = 30;
const SUBJECT_DUE_COUNTS_PATH: &str = "/subjects/review-due-counts";

#[derive(Debug, Clone, Default, PartialEq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReviewScope {
    #[serde(default)]
    pub subject_id: Option<String>,
    #[serde(default)]
    pub ahead_days: u8,
}

impl ReviewScope {
    pub fn resolve(scope: Option<ReviewScope>) -> Result<ReviewScope, String> {
        let scope = scope.unwrap_or_default();

        if scope.ahead_days > MAX_AHEAD_DAYS {
            return Err("Learn ahead can be 0 to 30 days.".to_string());
        }

        if scope.subject_id.as_deref().is_some_and(|id| !is_plain_id(id)) {
            return Err("Choose a valid subject.".to_string());
        }

        Ok(scope)
    }

    pub fn key(&self) -> String {
        format!("{}|{}", self.subject_id.as_deref().unwrap_or("all"), self.ahead_days)
    }

    pub fn subject_query(&self) -> String {
        match &self.subject_id {
            Some(id) => format!("&subjectId={id}"),
            None => String::new(),
        }
    }
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DueBucket {
    pub due_count: u32,
    pub new_count: u32,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SubjectDueCount {
    pub subject_id: String,
    pub due_count: u32,
    pub new_count: u32,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SubjectDueCounts {
    pub subjects: Vec<SubjectDueCount>,
    pub unsorted: DueBucket,
    pub new_remaining_today: u32,
}

pub fn parse_subject_due_counts(body: &str) -> Result<SubjectDueCounts, serde_json::Error> {
    serde_json::from_str(body)
}

#[tauri::command]
pub async fn get_review_due_counts() -> Result<SubjectDueCounts, String> {
    let token = session::load_token()?.ok_or_else(|| "Sign in to start a review.".to_string())?;
    let url = format!("{API_BASE_URL}{SUBJECT_DUE_COUNTS_PATH}?tz=UTC");
    let text = send(Method::GET, url, &token, None)
        .await
        .map_err(|failure| failure.into_api("Loading due counts").message())?;

    parse_subject_due_counts(&text).map_err(|_| "Unexpected due counts response from the server.".to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn should_read_per_subject_and_unsorted_due_counts() {
        let body = r#"{"subjects":[{"subjectId":"s1","dueCount":3,"newCount":2}],"unsorted":{"dueCount":1,"newCount":0},"newRemainingToday":7}"#;
        let counts = parse_subject_due_counts(body).expect("valid response");

        assert_eq!(counts.subjects, vec![SubjectDueCount { subject_id: "s1".into(), due_count: 3, new_count: 2 }]);
        assert_eq!(counts.unsorted, DueBucket { due_count: 1, new_count: 0 });
        assert_eq!(counts.new_remaining_today, 7);
    }

    #[test]
    fn should_reject_a_scope_with_more_than_thirty_ahead_days() {
        let scope = ReviewScope { subject_id: None, ahead_days: 31 };

        assert!(ReviewScope::resolve(Some(scope)).is_err());
    }

    #[test]
    fn should_reject_a_subject_id_that_is_not_a_plain_id() {
        let scope = ReviewScope { subject_id: Some("s1&x=1".into()), ahead_days: 0 };

        assert!(ReviewScope::resolve(Some(scope)).is_err());
    }

    #[test]
    fn should_key_each_scope_by_subject_and_ahead_days() {
        let all = ReviewScope::default();
        let one = ReviewScope { subject_id: Some("s1".into()), ahead_days: 2 };

        assert_eq!(all.key(), "all|0");
        assert_eq!(one.key(), "s1|2");
        assert_eq!(one.subject_query(), "&subjectId=s1");
        assert_eq!(all.subject_query(), "");
    }

    #[test]
    fn should_default_to_all_subjects_when_no_scope_is_sent() {
        assert_eq!(ReviewScope::resolve(None), Ok(ReviewScope::default()));
    }
}
