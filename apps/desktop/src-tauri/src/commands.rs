use tauri::AppHandle;

use crate::api_client::{self, ApiError};
use crate::session;
use crate::subjects::{self, Subject};

#[tauri::command]
pub fn has_session() -> bool {
    session::has_session()
}

#[tauri::command]
pub async fn sign_in(app: AppHandle, email: String, password: String) -> Result<(), String> {
    let token = api_client::sign_in(&email, &password).await.map_err(|err| err.message())?;
    session::save_token(&token)?;
    let _ = subjects::clear_cache(&subjects::cache_path(&app)?);

    Ok(())
}

#[tauri::command]
pub fn sign_out(app: AppHandle) -> Result<(), String> {
    session::clear_token()?;
    let _ = subjects::clear_cache(&subjects::cache_path(&app)?);

    Ok(())
}

#[tauri::command]
pub async fn get_subjects(app: AppHandle) -> Result<Vec<Subject>, String> {
    let cache = subjects::cache_path(&app)?;
    let token = session::load_token()?.ok_or_else(|| "Sign in to load subjects.".to_string())?;

    match api_client::fetch_subjects(&token).await {
        Ok(list) => {
            let _ = subjects::write_cache(&cache, &list);
            Ok(list)
        }
        Err(ApiError::Unreachable) => subjects::read_cache(&cache).ok_or_else(|| {
            "Could not reach the server and no saved subjects exist yet.".to_string()
        }),
        Err(err) => Err(err.message()),
    }
}
