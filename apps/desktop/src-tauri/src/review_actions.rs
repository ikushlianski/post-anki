use serde::Serialize;
use serde_json::{json, Value};
use tauri::AppHandle;

use crate::review::Card;
use crate::review_api::{self, is_plain_id};
use crate::review_cache;
use crate::session;

#[derive(Debug, Clone, Copy, PartialEq)]
pub enum ControlAction {
    Bury,
    Suspend,
}

impl ControlAction {
    pub fn parse(value: &str) -> Result<Self, String> {
        match value {
            "bury" => Ok(Self::Bury),
            "suspend" => Ok(Self::Suspend),
            _ => Err("Choose Bury or Suspend.".to_string()),
        }
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EditedCard {
    pub prompt: String,
    pub answer: String,
}

pub fn schedule_body(action: ControlAction, variant_id: Option<&str>) -> Value {
    let mut body = match action {
        ControlAction::Bury => json!({ "buried": true }),
        ControlAction::Suspend => json!({ "suspended": true }),
    };

    body["tz"] = json!("UTC");

    if let Some(id) = variant_id {
        body["variantId"] = json!(id);
    }

    body
}

pub fn hidden_by(card: &Card, knowledge_bit_id: &str, variant_id: Option<&str>) -> bool {
    match variant_id {
        Some(id) => card.id == id,
        None => card.knowledge_bit_id == knowledge_bit_id,
    }
}

pub fn card_text(question: &str, answer: &str) -> Result<(String, String), String> {
    let question = question.trim();
    let answer = answer.trim();

    if question.is_empty() || answer.is_empty() {
        return Err("The question and the answer can't be empty.".to_string());
    }

    Ok((question.to_string(), answer.to_string()))
}

#[tauri::command]
pub async fn control_card(
    app: AppHandle,
    knowledge_bit_id: String,
    variant_id: Option<String>,
    action: String,
) -> Result<(), String> {
    let action = ControlAction::parse(&action)?;

    if !is_plain_id(&knowledge_bit_id) || variant_id.as_deref().is_some_and(|id| !is_plain_id(id)) {
        return Err("Choose a card to change.".to_string());
    }

    let dir = review_cache::dir_of(&app)?;
    let token = session::load_token()?.ok_or_else(|| "Sign in to change a card.".to_string())?;

    review_api::patch_schedule(&token, &knowledge_bit_id, schedule_body(action, variant_id.as_deref()))
        .await
        .map_err(|failure| failure.into_api("Saving the card").message())?;

    review_cache::update(&dir, |state| {
        state.cards.retain(|card| !hidden_by(card, &knowledge_bit_id, variant_id.as_deref()));
    })?;

    Ok(())
}

#[tauri::command]
pub async fn edit_card(app: AppHandle, variant_id: String, question: String, answer: String) -> Result<EditedCard, String> {
    if !is_plain_id(&variant_id) {
        return Err("Choose a card to edit.".to_string());
    }

    let (prompt, answer) = card_text(&question, &answer)?;
    let dir = review_cache::dir_of(&app)?;
    let token = session::load_token()?.ok_or_else(|| "Sign in to edit a card.".to_string())?;

    review_api::patch_question_variant(&token, &variant_id, json!({ "prompt": prompt, "answer": answer }))
        .await
        .map_err(|failure| failure.into_api("Saving the edit").message())?;

    review_cache::update(&dir, |state| {
        for card in state.cards.iter_mut().filter(|card| card.id == variant_id) {
            card.question = prompt.clone();
            card.answer = answer.clone();
        }
    })?;

    Ok(EditedCard { prompt, answer })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn should_send_bury_or_suspend_with_the_card_variant_only_when_given() {
        assert_eq!(schedule_body(ControlAction::Bury, None).to_string(), r#"{"buried":true,"tz":"UTC"}"#);
        assert_eq!(
            schedule_body(ControlAction::Suspend, Some("v1")).to_string(),
            r#"{"suspended":true,"tz":"UTC","variantId":"v1"}"#
        );
    }

    #[test]
    fn should_accept_only_bury_and_suspend_actions() {
        assert_eq!(ControlAction::parse("bury"), Ok(ControlAction::Bury));
        assert_eq!(ControlAction::parse("suspend"), Ok(ControlAction::Suspend));
        assert!(ControlAction::parse("delete").is_err());
    }

    #[test]
    fn should_hide_only_the_variant_when_one_is_given_and_the_whole_card_otherwise() {
        let card = Card {
            id: "v1".to_string(),
            knowledge_bit_id: "k1".to_string(),
            question: "Q".to_string(),
            answer: "A".to_string(),
            phase: "new".to_string(),
            card_key: None,
            intervals: None,
        };

        assert!(hidden_by(&card, "k1", Some("v1")));
        assert!(!hidden_by(&card, "k1", Some("v2")));
        assert!(hidden_by(&card, "k1", None));
        assert!(!hidden_by(&card, "k2", None));
    }

    #[test]
    fn should_trim_the_edited_text_and_reject_a_blank_side() {
        assert_eq!(card_text("  Q  ", " A "), Ok(("Q".to_string(), "A".to_string())));
        assert!(card_text("   ", "A").is_err());
        assert!(card_text("Q", "").is_err());
    }
}
