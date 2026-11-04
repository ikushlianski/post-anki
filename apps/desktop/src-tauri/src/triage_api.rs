use reqwest::{Client, Method, StatusCode};
use serde::de::DeserializeOwned;
use serde_json::Value;

use crate::api_client::{ApiError, API_BASE_URL};
use crate::session;

pub fn url(path: &str) -> String {
    format!("{API_BASE_URL}{path}")
}

pub fn failure(status: StatusCode, action: &str) -> ApiError {
    match status {
        StatusCode::UNAUTHORIZED => {
            ApiError::Message("Your session has expired. Sign in again.".to_string())
        }
        StatusCode::NOT_FOUND => ApiError::Message("That item no longer exists.".to_string()),
        StatusCode::CONFLICT => {
            ApiError::Message("That item was already decided elsewhere.".to_string())
        }
        other => ApiError::Message(format!("{action} failed (HTTP {}).", other.as_u16())),
    }
}

pub fn require_token(message: &str) -> Result<String, String> {
    session::load_token()?.ok_or_else(|| message.to_string())
}

pub async fn send(
    method: Method,
    path: &str,
    token: &str,
    body: Option<Value>,
    action: &str,
) -> Result<String, ApiError> {
    let client = Client::builder()
        .build()
        .map_err(|_| ApiError::Message("Could not start the network client.".to_string()))?;

    let mut request = client.request(method, url(path)).bearer_auth(token);

    if let Some(body) = body {
        request = request.json(&body);
    }

    let response = request.send().await.map_err(|_| ApiError::Unreachable)?;
    let status = response.status();

    if !status.is_success() {
        return Err(failure(status, action));
    }

    response.text().await.map_err(|_| ApiError::Unreachable)
}

pub fn parse<T: DeserializeOwned>(body: &str) -> Result<T, ApiError> {
    serde_json::from_str(body)
        .map_err(|_| ApiError::Message("Unexpected response from the server.".to_string()))
}

pub async fn post_empty(token: &str, path: &str, action: &str) -> Result<(), ApiError> {
    send(Method::POST, path, token, None, action).await.map(|_| ())
}

pub async fn delete_empty(token: &str, path: &str, action: &str) -> Result<(), ApiError> {
    send(Method::DELETE, path, token, None, action).await.map(|_| ())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn should_join_paths_onto_the_prod_api_base() {
        assert_eq!(url("/knowledge-bits/inbox"), format!("{API_BASE_URL}/knowledge-bits/inbox"));
    }

    #[test]
    fn should_ask_for_sign_in_again_when_the_request_is_unauthorized() {
        assert_eq!(
            failure(StatusCode::UNAUTHORIZED, "Loading"),
            ApiError::Message("Your session has expired. Sign in again.".to_string())
        );
    }

    #[test]
    fn should_name_the_action_in_other_failures() {
        assert_eq!(
            failure(StatusCode::INTERNAL_SERVER_ERROR, "Discarding"),
            ApiError::Message("Discarding failed (HTTP 500).".to_string())
        );
    }

    #[test]
    fn should_reject_a_body_that_does_not_match_the_expected_shape() {
        let parsed: Result<Vec<String>, ApiError> = parse("{\"items\":1}");

        assert!(parsed.is_err());
    }
}
