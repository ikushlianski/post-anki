use reqwest::{Client, Method, StatusCode};
use serde::Deserialize;
use serde_json::Value;

use crate::api_client::API_BASE_URL;

const UNREACHABLE: &str = "Could not reach the server. Check your connection.";
const EXAM_DATE_CODES: [(&str, &str); 4] = [
    ("exam_date_required", "Pick the exam date to study for an exam."),
    ("exam_date_in_past", "The exam date has to be today or later."),
    ("exam_date_too_far", "The exam date can be at most two years ahead."),
    ("exam_date_requires_exam_intent", "An exam date only works when studying for an Exam."),
];

#[derive(Deserialize)]
struct ErrorBody {
    error: Option<String>,
}

pub fn api_url(path: &str) -> String {
    format!("{API_BASE_URL}{path}")
}

pub async fn send(
    method: Method,
    url: &str,
    token: &str,
    body: Option<&Value>,
    forbidden: &str,
) -> Result<String, String> {
    let client = Client::builder()
        .build()
        .map_err(|_| "Could not start the network client.".to_string())?;
    let mut request = client.request(method, url).bearer_auth(token);

    if let Some(payload) = body {
        request = request.json(payload);
    }

    let response = request.send().await.map_err(|_| UNREACHABLE.to_string())?;
    let status = response.status();
    let text = response.text().await.map_err(|_| UNREACHABLE.to_string())?;

    if status.is_success() {
        return Ok(text);
    }

    Err(failure_message(status, &text, forbidden))
}

pub fn failure_message(status: StatusCode, body: &str, forbidden: &str) -> String {
    if let Some(message) = exam_date_message(body) {
        return message.to_string();
    }

    match status.as_u16() {
        400 => "The server rejected that change.".to_string(),
        401 => "Your session has expired. Sign in again.".to_string(),
        403 => forbidden.to_string(),
        404 => "That item no longer exists. Refresh and try again.".to_string(),
        other => format!("Request failed (HTTP {other})."),
    }
}

fn exam_date_message(body: &str) -> Option<&'static str> {
    let parsed: ErrorBody = serde_json::from_str(body).ok()?;
    let code = parsed.error?;

    EXAM_DATE_CODES
        .iter()
        .find(|(known, _)| *known == code)
        .map(|(_, message)| *message)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn should_explain_an_exam_date_in_the_past_instead_of_a_generic_error() {
        assert_eq!(
            failure_message(StatusCode::BAD_REQUEST, r#"{"error":"exam_date_in_past"}"#, "no"),
            "The exam date has to be today or later."
        );
    }

    #[test]
    fn should_tell_the_user_the_account_is_not_allowed_on_a_forbidden_response() {
        assert_eq!(
            failure_message(StatusCode::FORBIDDEN, "", "This account is not allowed."),
            "This account is not allowed."
        );
    }

    #[test]
    fn should_ask_for_sign_in_again_when_the_session_is_unauthorized() {
        assert_eq!(
            failure_message(StatusCode::UNAUTHORIZED, "{}", "no"),
            "Your session has expired. Sign in again."
        );
    }

    #[test]
    fn should_report_the_status_for_an_unexpected_failure() {
        assert_eq!(
            failure_message(StatusCode::INTERNAL_SERVER_ERROR, "not json", "no"),
            "Request failed (HTTP 500)."
        );
    }
}
