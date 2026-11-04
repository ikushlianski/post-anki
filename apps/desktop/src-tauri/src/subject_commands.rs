use reqwest::Method;

use crate::cram::is_safe_id;
use crate::session;
use crate::subject_http::send;
use crate::subject_requests::{
    create_body, overview_url, parse_page, parse_subject, rename_body, subject_url, subjects_url,
    SubjectBitPage,
};
use crate::subjects::Subject;

const UNEXPECTED: &str = "Unexpected subject response from the server.";

fn token() -> Result<String, String> {
    session::load_token()?.ok_or_else(|| "Sign in to manage subjects.".to_string())
}

fn checked_id(subject_id: &str) -> Result<&str, String> {
    if is_safe_id(subject_id) {
        Ok(subject_id)
    } else {
        Err("That subject id is not valid.".to_string())
    }
}

#[tauri::command]
pub async fn create_subject(name: String, parent_id: Option<String>) -> Result<Subject, String> {
    let body = create_body(&name, parent_id.as_deref())?;
    let raw = send(Method::POST, &subjects_url(), &token()?, Some(&body))
        .await
        .map_err(|err| err.message())?;

    parse_subject(&raw).map_err(|_| UNEXPECTED.to_string())
}

#[tauri::command]
pub async fn rename_subject(subject_id: String, name: String) -> Result<Subject, String> {
    let url = subject_url(checked_id(&subject_id)?);
    let body = rename_body(&name)?;
    let raw = send(Method::PATCH, &url, &token()?, Some(&body))
        .await
        .map_err(|err| err.message())?;

    parse_subject(&raw).map_err(|_| UNEXPECTED.to_string())
}

#[tauri::command]
pub async fn delete_subject(subject_id: String) -> Result<(), String> {
    let url = subject_url(checked_id(&subject_id)?);

    send(Method::DELETE, &url, &token()?, None)
        .await
        .map(|_| ())
        .map_err(|err| err.message())
}

#[tauri::command]
pub async fn get_subject_bits(subject_id: String) -> Result<SubjectBitPage, String> {
    let url = overview_url(checked_id(&subject_id)?);
    let raw = send(Method::GET, &url, &token()?, None)
        .await
        .map_err(|err| err.message())?;

    parse_page(&raw).map_err(|_| UNEXPECTED.to_string())
}
