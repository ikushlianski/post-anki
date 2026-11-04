use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

const MAX_NAME_LENGTH: usize = 80;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Account {
    pub email: String,
    pub name: String,
    pub last_sign_in_at: Option<String>,
}

pub fn parse_account(body: &str) -> Result<Account, serde_json::Error> {
    serde_json::from_str(body)
}

pub fn name_body(raw: &str) -> Result<Value, String> {
    let name = raw.trim();

    if name.is_empty() {
        return Err("Enter a name.".to_string());
    }

    if name.chars().count() > MAX_NAME_LENGTH {
        return Err(format!("Names are at most {MAX_NAME_LENGTH} characters."));
    }

    Ok(json!({ "name": name }))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn should_send_the_trimmed_account_name() {
        assert_eq!(name_body("  Ilya ").expect("valid name"), json!({ "name": "Ilya" }));
    }

    #[test]
    fn should_refuse_a_blank_account_name() {
        assert!(name_body("   ").is_err());
    }

    #[test]
    fn should_refuse_a_name_over_eighty_characters() {
        assert!(name_body(&"a".repeat(81)).is_err());
        assert!(name_body(&"a".repeat(80)).is_ok());
    }

    #[test]
    fn should_read_the_email_name_and_last_sign_in_from_the_account_response() {
        let account = parse_account(r#"{"email":"a@b.c","name":"Ilya","lastSignInAt":null}"#)
            .expect("valid account");

        assert_eq!(account.email, "a@b.c");
        assert_eq!(account.last_sign_in_at, None);
    }
}
