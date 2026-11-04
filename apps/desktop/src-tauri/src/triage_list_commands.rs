use reqwest::Method;

use crate::triage_api::{require_token, send};
use crate::triage_lists::{parse_chat, parse_inbox, parse_rejected, parse_suspended, ListPage};

const INBOX_LIMIT: u32 = 200;
const PAGE_LIMIT: u32 = 50;

async fn fetch_page(
    token_message: &str,
    path: &str,
    action: &str,
    parse: fn(&str) -> Result<ListPage, crate::api_client::ApiError>,
) -> Result<ListPage, String> {
    let token = require_token(token_message)?;
    let body = send(Method::GET, path, &token, None, action).await.map_err(|err| err.message())?;

    parse(&body).map_err(|err| err.message())
}

#[tauri::command]
pub async fn list_inbox_items() -> Result<ListPage, String> {
    let path = format!("/knowledge-bits/inbox?limit={INBOX_LIMIT}");

    fetch_page("Sign in to open the inbox.", &path, "Loading the inbox", parse_inbox).await
}

#[tauri::command]
pub async fn list_chat_items() -> Result<ListPage, String> {
    fetch_page(
        "Sign in to open the chat queue.",
        "/knowledge-bits/chat-queue",
        "Loading the chat queue",
        parse_chat,
    )
    .await
}

#[tauri::command]
pub async fn list_rejected_items(offset: u32) -> Result<ListPage, String> {
    let path = format!("/knowledge-bits/rejected?limit={PAGE_LIMIT}&offset={offset}");

    fetch_page("Sign in to open rejected cards.", &path, "Loading rejected cards", parse_rejected).await
}

#[tauri::command]
pub async fn list_suspended_items(offset: u32) -> Result<ListPage, String> {
    let path = format!("/knowledge-bits/suspended?limit={PAGE_LIMIT}&offset={offset}");

    fetch_page("Sign in to open suspended cards.", &path, "Loading suspended cards", parse_suspended).await
}
