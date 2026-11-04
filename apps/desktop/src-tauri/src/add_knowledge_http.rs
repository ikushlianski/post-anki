use reqwest::{Client, Method, StatusCode};
use serde_json::Value;

use crate::api_client::{ApiError, API_BASE_URL};

pub async fn send(
    method: Method,
    path: &str,
    token: &str,
    body: Option<Value>,
) -> Result<(StatusCode, String), ApiError> {
    let client = Client::builder()
        .build()
        .map_err(|_| ApiError::Message("Could not start the network client.".to_string()))?;

    let mut request = client
        .request(method, format!("{API_BASE_URL}{path}"))
        .bearer_auth(token);

    if let Some(body) = body {
        request = request.json(&body);
    }

    let response = request.send().await.map_err(|_| ApiError::Unreachable)?;
    let status = response.status();
    let text = response.text().await.unwrap_or_default();

    Ok((status, text))
}
