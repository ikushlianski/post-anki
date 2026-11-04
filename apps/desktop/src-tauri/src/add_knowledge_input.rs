use reqwest::Url;

pub const TEXT_MAX_UTF16_UNITS: usize = 50_000;

#[derive(Debug, PartialEq)]
pub enum KnowledgeInput {
    Url(String),
    Text(String),
}

pub fn classify(raw: &str) -> Option<KnowledgeInput> {
    let trimmed = raw.trim();

    if trimmed.is_empty() {
        return None;
    }

    if is_single_web_url(trimmed) {
        return Some(KnowledgeInput::Url(trimmed.to_string()));
    }

    Some(KnowledgeInput::Text(trimmed.to_string()))
}

pub fn within_limit(text: &str) -> bool {
    text.encode_utf16().count() <= TEXT_MAX_UTF16_UNITS
}

fn is_single_web_url(candidate: &str) -> bool {
    if candidate.chars().any(char::is_whitespace) {
        return false;
    }

    Url::parse(candidate).is_ok_and(|url| {
        matches!(url.scheme(), "http" | "https")
            && url.host_str().is_some_and(|host| !host.is_empty())
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn should_send_a_single_https_link_as_a_url() {
        assert_eq!(
            classify("  https://example.com/article  "),
            Some(KnowledgeInput::Url("https://example.com/article".to_string()))
        );
    }

    #[test]
    fn should_keep_a_link_with_spaces_as_text() {
        assert_eq!(
            classify("see https://example.com for details"),
            Some(KnowledgeInput::Text("see https://example.com for details".to_string()))
        );
    }

    #[test]
    fn should_keep_a_non_web_scheme_as_text() {
        assert_eq!(
            classify("javascript:alert(1)"),
            Some(KnowledgeInput::Text("javascript:alert(1)".to_string()))
        );
    }

    #[test]
    fn should_ignore_blank_input() {
        assert_eq!(classify("  \n "), None);
    }

    #[test]
    fn should_accept_text_up_to_the_api_limit_and_refuse_more() {
        assert!(within_limit(&"a".repeat(TEXT_MAX_UTF16_UNITS)));
        assert!(!within_limit(&"a".repeat(TEXT_MAX_UTF16_UNITS + 1)));
    }
}
