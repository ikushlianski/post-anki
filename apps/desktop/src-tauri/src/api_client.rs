use reqwest::header::{HeaderMap, HeaderValue};
use reqwest::{Client, StatusCode};
use serde::Serialize;

use crate::subjects::{self, Subject};

pub const API_BASE_URL: &str = "https://post-anki-api-pl6jw2mdla-ew.a.run.app";
const SIGN_IN_PATH: &str = "/api/auth/sign-in/email";
const SUBJECTS_PATH: &str = "/subjects";
const TOKEN_HEADER: &str = "set-auth-token";

#[derive(Debug, PartialEq)]
pub enum ApiError {
    Unreachable,
    Message(String),
}

impl ApiError {
    pub fn message(&self) -> String {
        match self {
            Self::Unreachable => "Could not reach the server. Check your connection.".to_string(),
            Self::Message(text) => text.clone(),
        }
    }
}

#[derive(Serialize)]
struct SignInBody<'a> {
    email: &'a str,
    password: &'a str,
}

pub fn sign_in_url() -> String {
    format!("{API_BASE_URL}{SIGN_IN_PATH}")
}

pub fn subjects_url() -> String {
    format!("{API_BASE_URL}{SUBJECTS_PATH}")
}

pub fn token_from_headers(headers: &HeaderMap) -> Option<String> {
    headers
        .get(TOKEN_HEADER)
        .and_then(|value: &HeaderValue| value.to_str().ok())
        .map(str::trim)
        .filter(|token| !token.is_empty())
        .map(str::to_owned)
}

pub fn sign_in_failure(status: StatusCode) -> ApiError {
    match status {
        StatusCode::BAD_REQUEST | StatusCode::UNAUTHORIZED => {
            ApiError::Message("Email or password is incorrect.".to_string())
        }
        other => ApiError::Message(format!("Sign-in failed (HTTP {}).", other.as_u16())),
    }
}

pub fn subjects_failure(status: StatusCode) -> ApiError {
    match status {
        StatusCode::UNAUTHORIZED => {
            ApiError::Message("Your session has expired. Sign in again.".to_string())
        }
        other => ApiError::Message(format!("Subjects request failed (HTTP {}).", other.as_u16())),
    }
}

fn client() -> Result<Client, ApiError> {
    Client::builder()
        .build()
        .map_err(|_| ApiError::Message("Could not start the network client.".to_string()))
}

pub async fn sign_in(email: &str, password: &str) -> Result<String, ApiError> {
    let response = client()?
        .post(sign_in_url())
        .json(&SignInBody { email, password })
        .send()
        .await
        .map_err(|_| ApiError::Unreachable)?;

    if !response.status().is_success() {
        return Err(sign_in_failure(response.status()));
    }

    token_from_headers(response.headers()).ok_or_else(|| {
        ApiError::Message("Sign-in succeeded but the server returned no session.".to_string())
    })
}

pub async fn fetch_subjects(token: &str) -> Result<Vec<Subject>, ApiError> {
    let response = client()?
        .get(subjects_url())
        .bearer_auth(token)
        .send()
        .await
        .map_err(|_| ApiError::Unreachable)?;

    if !response.status().is_success() {
        return Err(subjects_failure(response.status()));
    }

    let body = response.text().await.map_err(|_| ApiError::Unreachable)?;

    subjects::parse_subjects(&body)
        .map_err(|_| ApiError::Message("Unexpected subjects response from the server.".to_string()))
}

#[cfg(test)]
mod tests {
    use super::*;
    use reqwest::header::HeaderMap;

    #[test]
    fn should_read_the_session_token_from_the_set_auth_token_header() {
        let mut headers = HeaderMap::new();
        headers.insert(TOKEN_HEADER, HeaderValue::from_static("abc.def"));

        assert_eq!(token_from_headers(&headers), Some("abc.def".to_string()));
    }

    #[test]
    fn should_ignore_a_missing_or_blank_session_token_header() {
        let mut blank = HeaderMap::new();
        blank.insert(TOKEN_HEADER, HeaderValue::from_static("   "));

        assert_eq!(token_from_headers(&HeaderMap::new()), None);
        assert_eq!(token_from_headers(&blank), None);
    }

    #[test]
    fn should_build_urls_from_the_prod_api_paths() {
        assert_eq!(sign_in_url(), format!("{API_BASE_URL}/api/auth/sign-in/email"));
        assert_eq!(subjects_url(), format!("{API_BASE_URL}/subjects"));
    }

    #[test]
    fn should_report_wrong_credentials_without_echoing_anything_sensitive() {
        assert_eq!(
            sign_in_failure(StatusCode::UNAUTHORIZED),
            ApiError::Message("Email or password is incorrect.".to_string())
        );
    }

    #[test]
    fn should_ask_for_sign_in_again_when_the_subjects_request_is_unauthorized() {
        assert_eq!(
            subjects_failure(StatusCode::UNAUTHORIZED),
            ApiError::Message("Your session has expired. Sign in again.".to_string())
        );
    }
}
