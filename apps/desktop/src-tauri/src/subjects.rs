use std::fs;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};

const CACHE_FILE: &str = "subjects-cache.json";

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Subject {
    pub id: String,
    pub name: String,
    #[serde(rename = "parentId", default)]
    pub parent_id: Option<String>,
}

pub fn parse_subjects(body: &str) -> Result<Vec<Subject>, serde_json::Error> {
    serde_json::from_str(body)
}

pub fn cache_path(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map(|dir| dir.join(CACHE_FILE))
        .map_err(|_| "The app data folder is unavailable.".to_string())
}

pub fn read_cache(path: &Path) -> Option<Vec<Subject>> {
    let raw = fs::read_to_string(path).ok()?;

    serde_json::from_str(&raw).ok()
}

pub fn write_cache(path: &Path, subjects: &[Subject]) -> std::io::Result<()> {
    let raw = serde_json::to_string(subjects).map_err(std::io::Error::other)?;
    let temp = path.with_extension("json.tmp");

    fs::write(&temp, raw)?;
    fs::rename(temp, path)
}

pub fn clear_cache(path: &Path) -> std::io::Result<()> {
    match fs::remove_file(path) {
        Ok(()) => Ok(()),
        Err(err) if err.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(err) => Err(err),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_cache(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("postanki-subjects-{}", std::process::id()));
        fs::create_dir_all(&dir).expect("temp dir");

        dir.join(name)
    }

    #[test]
    fn should_map_each_api_subject_to_id_and_name_and_ignore_other_fields() {
        let body = r#"[{"id":"s1","name":"Biology","kind":"leaf","sortOrder":2,"parentId":null}]"#;

        assert_eq!(
            parse_subjects(body).expect("valid list"),
            vec![Subject { id: "s1".to_string(), name: "Biology".to_string(), parent_id: None }]
        );
    }

    #[test]
    fn should_read_parent_id_from_the_api_field() {
        let body = r#"[{"id":"s2","name":"Cold sales","parentId":"s1"}]"#;

        assert_eq!(
            parse_subjects(body).expect("valid list"),
            vec![Subject {
                id: "s2".to_string(),
                name: "Cold sales".to_string(),
                parent_id: Some("s1".to_string()),
            }]
        );
    }

    #[test]
    fn should_treat_a_missing_parent_id_as_a_root_subject() {
        let body = r#"[{"id":"s1","name":"Biology"}]"#;

        assert_eq!(parse_subjects(body).expect("valid list")[0].parent_id, None);
    }

    #[test]
    fn should_load_an_old_cache_without_parent_id() {
        let path = temp_cache("old-format.json");
        fs::write(&path, r#"[{"id":"s1","name":"Biology"}]"#).expect("write old cache");

        assert_eq!(
            read_cache(&path),
            Some(vec![Subject { id: "s1".to_string(), name: "Biology".to_string(), parent_id: None }])
        );
    }

    #[test]
    fn should_reject_a_response_that_is_not_a_list() {
        assert!(parse_subjects(r#"{"error":"unauthorized"}"#).is_err());
    }

    #[test]
    fn should_return_the_saved_list_after_a_write() {
        let path = temp_cache("roundtrip.json");
        let subjects = vec![
            Subject { id: "s1".to_string(), name: "Business".to_string(), parent_id: None },
            Subject { id: "s2".to_string(), name: "Sales".to_string(), parent_id: Some("s1".to_string()) },
        ];

        write_cache(&path, &subjects).expect("write cache");

        assert_eq!(read_cache(&path), Some(subjects));
    }

    #[test]
    fn should_report_no_cache_when_the_file_is_missing_or_cleared() {
        let path = temp_cache("cleared.json");

        clear_cache(&path).expect("clear cache");

        assert_eq!(read_cache(&path), None);
    }
}
