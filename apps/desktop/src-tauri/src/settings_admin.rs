use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::settings_fields::{new_cards, one_of, patch_body, retention, steps, MODEL_TIERS};

const UNSUPPORTED: &str = "That admin setting is not supported.";

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AdminSettings {
    pub model_tier: Option<String>,
    pub new_cards_per_day: Option<u32>,
    pub learning_steps_minutes: Option<Vec<u32>>,
    pub relearning_steps_minutes: Option<Vec<u32>>,
    pub desired_retention: Option<f64>,
}

pub fn parse_admin_settings(body: &str) -> Result<AdminSettings, serde_json::Error> {
    serde_json::from_str(body)
}

pub fn admin_patch_body(patch: &Value) -> Result<Value, String> {
    patch_body(patch, checked_field)
}

fn checked_field(key: &str, value: &Value) -> Result<Value, String> {
    match key {
        "modelTier" => one_of(value, &MODEL_TIERS),
        "newCardsPerDay" => new_cards(value),
        "learningStepsMinutes" | "relearningStepsMinutes" => steps(value),
        "desiredRetention" => retention(value),
        _ => Err(UNSUPPORTED.to_string()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn should_leave_a_field_missing_from_the_response_as_none_so_the_ui_hides_it() {
        let settings = parse_admin_settings(r#"{"modelTier":"cheap","newCardsPerDay":20}"#)
            .expect("valid settings");

        assert_eq!(settings.model_tier.as_deref(), Some("cheap"));
        assert_eq!(settings.desired_retention, None);
    }

    #[test]
    fn should_accept_a_model_tier_change_and_refuse_the_test_toggle() {
        assert!(admin_patch_body(&json!({ "modelTier": "balanced" })).is_ok());
        assert!(admin_patch_body(&json!({ "testToggle": true })).is_err());
    }

    #[test]
    fn should_refuse_a_null_model_tier_because_the_server_has_no_reset_for_it() {
        assert!(admin_patch_body(&json!({ "modelTier": null })).is_err());
    }
}
