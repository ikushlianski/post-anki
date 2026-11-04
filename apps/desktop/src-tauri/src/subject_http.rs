use reqwest::{Client, Method};
use serde_json::Value;

use crate::api_client::ApiError;
use crate::subject_requests::mutation_failure;

pub async fn send(
    method: Method,
    url: &str,
    token: &str,
    body: Option<&Value>,
) -> Result<String, ApiError> {
    let client = Client::builder()
        .build()
        .map_err(|_| ApiError::Message("Could not start the network client.".to_string()))?;
    let mut request = client.request(method, url).bearer_auth(token);

    if let Some(payload) = body {
        request = request.json(payload);
    }

    let response = request.send().await.map_err(|_| ApiError::Unreachable)?;

    if !response.status().is_success() {
        return Err(mutation_failure(response.status()));
    }

    response.text().await.map_err(|_| ApiError::Unreachable)
}
