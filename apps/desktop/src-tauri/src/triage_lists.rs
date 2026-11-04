use serde::{Deserialize, Serialize};

use crate::api_client::ApiError;

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ListRow {
    pub id: String,
    pub body: String,
    pub background: Option<String>,
    pub subject_name: Option<String>,
    pub note: Option<String>,
    pub variant_id: Option<String>,
    pub suspended: bool,
    pub buried: bool,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ListPage {
    pub items: Vec<ListRow>,
    pub has_more: bool,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct InboxBody {
    id: String,
    body: String,
    background: Option<String>,
    subject_name: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct InboxList {
    items: Vec<InboxBody>,
    has_more: bool,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ChatBody {
    id: String,
    body: String,
    background: Option<String>,
    subject_name: Option<String>,
    source_title: Option<String>,
    chat_snoozed_until: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ChatList {
    items: Vec<ChatBody>,
    has_more: bool,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct RejectedBody {
    knowledge_bit_id: String,
    body: String,
    reason_code: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct RejectedList {
    items: Vec<RejectedBody>,
    has_more: bool,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct SuspendedBody {
    knowledge_bit_id: String,
    variant_id: Option<String>,
    item_text: String,
    subject_name: Option<String>,
    reason: String,
    suspended: bool,
    buried_until: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct SuspendedList {
    items: Vec<SuspendedBody>,
    has_more: bool,
}

fn snoozed_label(until: &str) -> String {
    let day = until.get(..10).unwrap_or(until);

    format!("Snoozed until {day}")
}

pub fn parse_inbox(body: &str) -> Result<ListPage, ApiError> {
    let list: InboxList = crate::triage_api::parse(body)?;

    Ok(ListPage {
        items: list
            .items
            .into_iter()
            .map(|row| ListRow {
                id: row.id,
                body: row.body,
                background: non_blank(row.background),
                subject_name: row.subject_name,
                note: None,
                variant_id: None,
                suspended: false,
                buried: false,
            })
            .collect(),
        has_more: list.has_more,
    })
}

pub fn parse_chat(body: &str) -> Result<ListPage, ApiError> {
    let list: ChatList = crate::triage_api::parse(body)?;

    Ok(ListPage {
        items: list
            .items
            .into_iter()
            .map(|row| ListRow {
                id: row.id,
                body: row.body,
                background: non_blank(row.background),
                subject_name: row.subject_name,
                note: row.chat_snoozed_until.as_deref().map(snoozed_label).or(row.source_title),
                variant_id: None,
                suspended: false,
                buried: false,
            })
            .collect(),
        has_more: list.has_more,
    })
}

pub fn parse_rejected(body: &str) -> Result<ListPage, ApiError> {
    let list: RejectedList = crate::triage_api::parse(body)?;

    Ok(ListPage {
        items: list
            .items
            .into_iter()
            .map(|row| ListRow {
                id: row.knowledge_bit_id,
                body: row.body,
                background: None,
                subject_name: None,
                note: Some(row.reason_code.replace('_', " ")),
                variant_id: None,
                suspended: false,
                buried: false,
            })
            .collect(),
        has_more: list.has_more,
    })
}

pub fn parse_suspended(body: &str) -> Result<ListPage, ApiError> {
    let list: SuspendedList = crate::triage_api::parse(body)?;

    Ok(ListPage {
        items: list
            .items
            .into_iter()
            .map(|row| ListRow {
                id: row.knowledge_bit_id,
                body: row.item_text,
                background: None,
                subject_name: row.subject_name,
                note: Some(row.reason),
                variant_id: row.variant_id,
                suspended: row.suspended,
                buried: row.buried_until.is_some(),
            })
            .collect(),
        has_more: list.has_more,
    })
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BulkApprovalResult {
    pub approved: Vec<String>,
    pub skipped: Vec<String>,
}

#[derive(Deserialize)]
struct BulkSkip {
    id: String,
}

#[derive(Deserialize)]
struct BulkRaw {
    approved: Vec<String>,
    skipped: Vec<BulkSkip>,
}

pub fn parse_bulk_result(body: &str) -> Result<BulkApprovalResult, ApiError> {
    let raw: BulkRaw = crate::triage_api::parse(body)?;

    Ok(BulkApprovalResult {
        approved: raw.approved,
        skipped: raw.skipped.into_iter().map(|skip| skip.id).collect(),
    })
}

fn non_blank(text: Option<String>) -> Option<String> {
    text.filter(|value| !value.trim().is_empty())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn should_map_inbox_rows_and_keep_the_has_more_flag() {
        let body = r#"{"items":[{"id":"b1","body":"Cells split","background":" ","subjectName":"Biology","inboxAt":"x","createdAt":"y"}],"count":1,"total":3,"hasMore":true}"#;

        assert_eq!(
            parse_inbox(body).expect("valid inbox"),
            ListPage {
                items: vec![ListRow {
                    id: "b1".to_string(),
                    body: "Cells split".to_string(),
                    background: None,
                    subject_name: Some("Biology".to_string()),
                    note: None,
                    variant_id: None,
                    suspended: false,
                    buried: false,
                }],
                has_more: true,
            }
        );
    }

    #[test]
    fn should_show_the_snooze_date_before_the_source_title_in_the_chat_queue() {
        let body = r#"{"items":[{"id":"b2","body":"Osmosis","background":null,"subjectName":null,"sourceTitle":"Book","chatSnoozedUntil":"2026-11-03T10:00:00.000Z"},{"id":"b3","body":"Mitosis","background":null,"subjectName":null,"sourceTitle":"Notes","chatSnoozedUntil":null}],"count":2,"total":2,"hasMore":false}"#;

        let page = parse_chat(body).expect("valid chat queue");

        assert_eq!(page.items[0].note.as_deref(), Some("Snoozed until 2026-11-03"));
        assert_eq!(page.items[1].note.as_deref(), Some("Notes"));
    }

    #[test]
    fn should_describe_a_rejected_card_by_its_reason_in_plain_words() {
        let body = r#"{"items":[{"knowledgeBitId":"b4","body":"Wrong fact","reasonCode":"not_accurate","decidedAt":"x"}],"hasMore":false}"#;

        let page = parse_rejected(body).expect("valid rejected list");

        assert_eq!(page.items[0].id, "b4");
        assert_eq!(page.items[0].note.as_deref(), Some("not accurate"));
    }

    #[test]
    fn should_flag_buried_and_suspended_cards_so_bring_back_can_clear_each_one() {
        let body = r#"{"items":[{"knowledgeBitId":"b5","variantId":"v1","itemText":"Atom","question":"q","answer":"a","subjectName":null,"reason":"leech","suspended":true,"buriedUntil":"2026-11-02T00:00:00.000Z","lapses":9,"since":null}],"hasMore":true}"#;

        let page = parse_suspended(body).expect("valid suspended list");

        assert_eq!(page.items[0].variant_id.as_deref(), Some("v1"));
        assert!(page.items[0].suspended);
        assert!(page.items[0].buried);
        assert!(page.has_more);
    }

    #[test]
    fn should_split_bulk_approval_into_approved_ids_and_skipped_ids() {
        let body = r#"{"approved":["b1"],"skipped":[{"id":"b2","reason":"already_decided"}]}"#;

        assert_eq!(
            parse_bulk_result(body).expect("valid bulk result"),
            BulkApprovalResult { approved: vec!["b1".to_string()], skipped: vec!["b2".to_string()] }
        );
    }

    #[test]
    fn should_reject_a_list_response_without_items() {
        assert!(parse_inbox(r#"{"count":0}"#).is_err());
    }
}
