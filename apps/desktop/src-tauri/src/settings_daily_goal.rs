use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

const MIN_TARGET: u32 = 1;
const MAX_TARGET: u32 = 10_000;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DailyGoal {
    pub daily_review_target: Option<u32>,
}

pub fn parse_daily_goal(body: &str) -> Result<DailyGoal, serde_json::Error> {
    serde_json::from_str(body)
}

pub fn goal_body(target: Option<u32>) -> Result<Value, String> {
    match target {
        None => Ok(json!({ "dailyReviewTarget": null })),
        Some(count) if (MIN_TARGET..=MAX_TARGET).contains(&count) => {
            Ok(json!({ "dailyReviewTarget": count }))
        }
        Some(_) => Err(format!("Enter a whole number from {MIN_TARGET} to {MAX_TARGET}, or leave it empty.")),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn should_send_null_when_the_goal_is_cleared() {
        assert_eq!(goal_body(None).expect("valid goal"), json!({ "dailyReviewTarget": null }));
    }

    #[test]
    fn should_refuse_a_goal_of_zero_or_above_ten_thousand() {
        assert!(goal_body(Some(0)).is_err());
        assert!(goal_body(Some(10_001)).is_err());
        assert!(goal_body(Some(10_000)).is_ok());
    }

    #[test]
    fn should_read_a_null_target_as_no_goal() {
        assert_eq!(
            parse_daily_goal(r#"{"dailyReviewTarget":null}"#).expect("valid goal").daily_review_target,
            None
        );
    }
}
