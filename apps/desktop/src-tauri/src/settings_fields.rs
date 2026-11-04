use serde_json::{json, Map, Value};

pub const MODEL_TIERS: [&str; 3] = ["cheap", "balanced", "premium"];
pub const STUDY_INTENTS: [&str; 2] = ["exam", "long_term"];
pub const DETAIL_LEVELS: [&str; 3] = ["concise", "standard", "deep"];

const MIN_RETENTION: f64 = 0.7;
const MAX_RETENTION: f64 = 0.99;
const MIN_NEW_CARDS: u64 = 1;
const MAX_NEW_CARDS: u64 = 200;
const MIN_STEP_MINUTES: u64 = 1;
const MAX_STEP_MINUTES: u64 = 1440;
const MIN_STEPS: usize = 1;
const MAX_STEPS: usize = 10;

const INVALID_CHOICE: &str = "That choice is not allowed.";
const INVALID_DATE: &str = "Enter the exam date as YYYY-MM-DD.";
const INVALID_RETENTION: &str = "Desired retention must be between 70% and 99%.";
const INVALID_NEW_CARDS: &str = "New cards per day must be from 1 to 200.";
const INVALID_STEPS: &str = "Steps must be 1 to 10 gaps, each from 1 to 1440 minutes.";
const INVALID_FLAG: &str = "That setting must be on or off.";

pub fn patch_body(
    patch: &Value,
    checker: fn(&str, &Value) -> Result<Value, String>,
) -> Result<Value, String> {
    let fields = patch.as_object().ok_or_else(|| "Nothing to save.".to_string())?;

    if fields.is_empty() {
        return Err("Nothing to save.".to_string());
    }

    let mut body = Map::new();

    for (key, value) in fields {
        body.insert(key.clone(), checker(key, value)?);
    }

    Ok(Value::Object(body))
}

pub fn nullable(value: &Value, check: fn(&Value) -> Result<Value, String>) -> Result<Value, String> {
    if value.is_null() {
        Ok(Value::Null)
    } else {
        check(value)
    }
}

pub fn one_of(value: &Value, allowed: &[&str]) -> Result<Value, String> {
    match value.as_str() {
        Some(text) if allowed.contains(&text) => Ok(json!(text)),
        _ => Err(INVALID_CHOICE.to_string()),
    }
}

pub fn exam_date(value: &Value) -> Result<Value, String> {
    let text = value.as_str().ok_or_else(|| INVALID_DATE.to_string())?;
    let shaped = text.len() == 10
        && text.bytes().enumerate().all(|(index, byte)| match index {
            4 | 7 => byte == b'-',
            _ => byte.is_ascii_digit(),
        });

    if shaped {
        Ok(json!(text))
    } else {
        Err(INVALID_DATE.to_string())
    }
}

pub fn retention(value: &Value) -> Result<Value, String> {
    value
        .as_f64()
        .filter(|number| number.is_finite() && (MIN_RETENTION..=MAX_RETENTION).contains(number))
        .map(|number| json!(number))
        .ok_or_else(|| INVALID_RETENTION.to_string())
}

pub fn new_cards(value: &Value) -> Result<Value, String> {
    value
        .as_u64()
        .filter(|number| (MIN_NEW_CARDS..=MAX_NEW_CARDS).contains(number))
        .map(|number| json!(number))
        .ok_or_else(|| INVALID_NEW_CARDS.to_string())
}

pub fn steps(value: &Value) -> Result<Value, String> {
    let entries = value.as_array().ok_or_else(|| INVALID_STEPS.to_string())?;

    if !(MIN_STEPS..=MAX_STEPS).contains(&entries.len()) {
        return Err(INVALID_STEPS.to_string());
    }

    let minutes = entries
        .iter()
        .map(|entry| {
            entry
                .as_u64()
                .filter(|minute| (MIN_STEP_MINUTES..=MAX_STEP_MINUTES).contains(minute))
                .ok_or_else(|| INVALID_STEPS.to_string())
        })
        .collect::<Result<Vec<u64>, String>>()?;

    Ok(json!(minutes))
}

pub fn flag(value: &Value) -> Result<Value, String> {
    value
        .as_bool()
        .map(|on| json!(on))
        .ok_or_else(|| INVALID_FLAG.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn should_accept_a_known_model_tier_and_refuse_any_other_value() {
        assert_eq!(one_of(&json!("premium"), &MODEL_TIERS), Ok(json!("premium")));
        assert!(one_of(&json!("ultra"), &MODEL_TIERS).is_err());
    }

    #[test]
    fn should_accept_a_null_override_as_a_reset_to_inherited() {
        assert_eq!(nullable(&Value::Null, retention), Ok(Value::Null));
    }

    #[test]
    fn should_refuse_retention_outside_seventy_to_ninety_nine_percent() {
        assert!(retention(&json!(0.69)).is_err());
        assert!(retention(&json!(1.0)).is_err());
        assert_eq!(retention(&json!(0.9)), Ok(json!(0.9)));
    }

    #[test]
    fn should_refuse_new_cards_per_day_outside_one_to_two_hundred() {
        assert!(new_cards(&json!(0)).is_err());
        assert!(new_cards(&json!(201)).is_err());
        assert_eq!(new_cards(&json!(20)), Ok(json!(20)));
    }

    #[test]
    fn should_refuse_a_steps_list_with_more_than_ten_gaps_or_a_gap_over_a_day() {
        assert!(steps(&json!([1, 10, 1440])).is_ok());
        assert!(steps(&json!([])).is_err());
        assert!(steps(&json!([1440, 1441])).is_err());
        assert!(steps(&json!([1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1])).is_err());
    }

    #[test]
    fn should_refuse_an_exam_date_that_is_not_shaped_as_a_calendar_day() {
        assert_eq!(exam_date(&json!("2027-06-15")), Ok(json!("2027-06-15")));
        assert!(exam_date(&json!("15/06/2027")).is_err());
        assert!(exam_date(&json!("2027-6-15")).is_err());
    }

    #[test]
    fn should_refuse_an_empty_or_non_object_patch_before_it_reaches_the_server() {
        assert!(patch_body(&json!({}), |_, value| flag(value)).is_err());
        assert!(patch_body(&json!("x"), |_, value| flag(value)).is_err());
    }
}
