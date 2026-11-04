use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::settings_fields::{
    exam_date, flag, new_cards, nullable, one_of, patch_body, retention, steps, DETAIL_LEVELS,
    STUDY_INTENTS,
};

const UNSUPPORTED: &str = "That study option is not supported.";

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OwnOptions {
    pub new_cards_per_day: Option<u32>,
    pub learning_steps_minutes: Option<Vec<u32>>,
    pub relearning_steps_minutes: Option<Vec<u32>>,
    pub desired_retention: Option<f64>,
    pub study_intent: Option<String>,
    pub exam_date: Option<String>,
    pub detail_level: Option<String>,
    pub hinting_enabled: Option<bool>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IntentView {
    pub study_intent: String,
    pub exam_date: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EffectiveOptions {
    pub new_cards_per_day: u32,
    pub learning_steps_minutes: Vec<u32>,
    pub relearning_steps_minutes: Vec<u32>,
    pub desired_retention: f64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SubjectStudyOptions {
    pub own: OwnOptions,
    pub intent: IntentView,
    pub effective: EffectiveOptions,
}

pub fn study_options_path(subject_id: &str) -> String {
    format!("/subjects/{subject_id}/study-options")
}

pub fn parse_options(body: &str) -> Result<SubjectStudyOptions, serde_json::Error> {
    serde_json::from_str(body)
}

pub fn options_patch_body(patch: &Value) -> Result<Value, String> {
    patch_body(patch, checked_field)
}

fn checked_field(key: &str, value: &Value) -> Result<Value, String> {
    match key {
        "studyIntent" => nullable(value, |candidate| one_of(candidate, &STUDY_INTENTS)),
        "examDate" => nullable(value, exam_date),
        "desiredRetention" => nullable(value, retention),
        "newCardsPerDay" => nullable(value, new_cards),
        "learningStepsMinutes" | "relearningStepsMinutes" => nullable(value, steps),
        "detailLevel" => nullable(value, |candidate| one_of(candidate, &DETAIL_LEVELS)),
        "hintingEnabled" => nullable(value, flag),
        _ => Err(UNSUPPORTED.to_string()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    const SAMPLE: &str = r#"{
        "own": {"newCardsPerDay":null,"learningStepsMinutes":null,"relearningStepsMinutes":null,
                "desiredRetention":0.95,"studyIntent":"exam","examDate":"2027-06-15",
                "detailLevel":null,"hintingEnabled":null},
        "intent": {"studyIntent":"exam","examDate":"2027-06-15","source":"s1"},
        "effective": {"newCardsPerDay":20,"learningStepsMinutes":[1,10],
                      "relearningStepsMinutes":[10],"desiredRetention":0.95},
        "sources": {"newCardsPerDay":"app"}
    }"#;

    #[test]
    fn should_read_own_overrides_as_null_when_the_subject_inherits() {
        let options = parse_options(SAMPLE).expect("valid options");

        assert_eq!(options.own.desired_retention, Some(0.95));
        assert_eq!(options.own.new_cards_per_day, None);
        assert_eq!(options.effective.learning_steps_minutes, vec![1, 10]);
    }

    #[test]
    fn should_send_a_null_retention_as_a_reset_to_the_inherited_value() {
        assert_eq!(
            options_patch_body(&json!({ "desiredRetention": null })).expect("valid patch"),
            json!({ "desiredRetention": null })
        );
    }

    #[test]
    fn should_refuse_a_patch_key_the_subject_options_do_not_support() {
        assert!(options_patch_body(&json!({ "modelTier": "cheap" })).is_err());
    }

    #[test]
    fn should_refuse_an_exam_date_with_a_retention_that_is_out_of_range() {
        assert!(options_patch_body(&json!({ "desiredRetention": 1.5 })).is_err());
    }

    #[test]
    fn should_build_a_path_under_the_subject_study_options_route() {
        assert_eq!(study_options_path("s1"), "/subjects/s1/study-options");
    }
}
