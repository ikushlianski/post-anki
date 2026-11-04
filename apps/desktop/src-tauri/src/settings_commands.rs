use reqwest::Method;
use serde_json::Value;

use crate::cram::is_safe_id;
use crate::session;
use crate::settings_account::{name_body, parse_account, Account};
use crate::settings_admin::{admin_patch_body, parse_admin_settings, AdminSettings};
use crate::settings_daily_goal::{goal_body, parse_daily_goal, DailyGoal};
use crate::settings_http::{api_url, send};
use crate::settings_subject_options::{
    options_patch_body, parse_options, study_options_path, SubjectStudyOptions,
};

const UNEXPECTED: &str = "Unexpected response from the server.";
const SIGN_IN: &str = "Sign in to change settings.";
const SUBJECT_FORBIDDEN: &str = "This account is not allowed to change this subject.";
const ADMIN_FORBIDDEN: &str = "This account is not allowed to change admin settings.";
const GENERAL_FORBIDDEN: &str = "This account is not allowed to do that.";

fn token() -> Result<String, String> {
    session::load_token()?.ok_or_else(|| SIGN_IN.to_string())
}

fn checked_subject_url(subject_id: &str) -> Result<String, String> {
    if !is_safe_id(subject_id) {
        return Err("That subject id is not valid.".to_string());
    }

    Ok(api_url(&study_options_path(subject_id)))
}

#[tauri::command]
pub async fn get_subject_study_options(subject_id: String) -> Result<SubjectStudyOptions, String> {
    let url = checked_subject_url(&subject_id)?;
    let raw = send(Method::GET, &url, &token()?, None, SUBJECT_FORBIDDEN).await?;

    parse_options(&raw).map_err(|_| UNEXPECTED.to_string())
}

#[tauri::command]
pub async fn update_subject_study_options(
    subject_id: String,
    patch: Value,
) -> Result<SubjectStudyOptions, String> {
    let url = checked_subject_url(&subject_id)?;
    let body = options_patch_body(&patch)?;
    let raw = send(Method::PATCH, &url, &token()?, Some(&body), SUBJECT_FORBIDDEN).await?;

    parse_options(&raw).map_err(|_| UNEXPECTED.to_string())
}

#[tauri::command]
pub async fn get_admin_settings() -> Result<AdminSettings, String> {
    let url = api_url("/admin/settings");
    let raw = send(Method::GET, &url, &token()?, None, ADMIN_FORBIDDEN).await?;

    parse_admin_settings(&raw).map_err(|_| UNEXPECTED.to_string())
}

#[tauri::command]
pub async fn update_admin_settings(patch: Value) -> Result<AdminSettings, String> {
    let url = api_url("/admin/settings");
    let body = admin_patch_body(&patch)?;
    let raw = send(Method::PATCH, &url, &token()?, Some(&body), ADMIN_FORBIDDEN).await?;

    parse_admin_settings(&raw).map_err(|_| UNEXPECTED.to_string())
}

#[tauri::command]
pub async fn get_daily_goal() -> Result<DailyGoal, String> {
    let url = api_url("/study-goal/daily");
    let raw = send(Method::GET, &url, &token()?, None, GENERAL_FORBIDDEN).await?;

    parse_daily_goal(&raw).map_err(|_| UNEXPECTED.to_string())
}

#[tauri::command]
pub async fn save_daily_goal(target: Option<u32>) -> Result<DailyGoal, String> {
    let url = api_url("/study-goal/daily");
    let body = goal_body(target)?;
    let raw = send(Method::PUT, &url, &token()?, Some(&body), GENERAL_FORBIDDEN).await?;

    parse_daily_goal(&raw).map_err(|_| UNEXPECTED.to_string())
}

#[tauri::command]
pub async fn get_account() -> Result<Account, String> {
    let url = api_url("/account");
    let raw = send(Method::GET, &url, &token()?, None, GENERAL_FORBIDDEN).await?;

    parse_account(&raw).map_err(|_| UNEXPECTED.to_string())
}

#[tauri::command]
pub async fn update_account_name(name: String) -> Result<Account, String> {
    let url = api_url("/account");
    let body = name_body(&name)?;
    let raw = send(Method::PATCH, &url, &token()?, Some(&body), GENERAL_FORBIDDEN).await?;

    parse_account(&raw).map_err(|_| UNEXPECTED.to_string())
}
