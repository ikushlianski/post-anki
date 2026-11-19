import Foundation

public enum SpeechTextCleaner {
    private static let rules: [(pattern: String, template: String)] = [
        (#"```[\s\S]*?(```|$)"#, " "),
        (#"\{\{c\d+::([\s\S]*?)(?:::[\s\S]*?)?\}\}"#, "$1"),
        (#"\((?:hint|Hint)[:\s][^)]*\)"#, " "),
        (#"!\[([^\]]*)\]\([^)]*\)"#, "$1"),
        (#"\[([^\]]+)\]\([^)]*\)"#, "$1"),
        (#"https?://\S+"#, " "),
        (#"`([^`]*)`"#, "$1"),
        (#"(?m)^\s{0,3}#{1,6}\s+"#, ""),
        (#"(?m)^\s*>\s?"#, ""),
        (#"(?m)^\s*([-*+]|\d+[.)])\s+"#, ""),
        (#"(\*\*|__)([\s\S]*?)\1"#, "$2"),
        (#"(\*|_)(\S(?:[^\n]*?\S)?)\1"#, "$2"),
        (#"~~([\s\S]*?)~~"#, "$1"),
        (#"[ \t]+"#, " "),
        (#"\s*\n\s*"#, ". "),
        (#"\.\s*\."#, "."),
        (#"\s+"#, " ")
    ]

    public static func clean(_ input: String) -> String {
        var text = input

        for rule in rules {
            text = text.replacingOccurrences(of: rule.pattern, with: rule.template, options: .regularExpression)
        }

        return text.trimmingCharacters(in: .whitespacesAndNewlines)
    }
}

public enum DictationText {
    public static func merge(base: String, transcript: String) -> String {
        let spoken = transcript.trimmingCharacters(in: .whitespacesAndNewlines)

        guard !spoken.isEmpty else { return base }

        let typed = base.trimmingCharacters(in: .whitespacesAndNewlines)

        guard !typed.isEmpty else { return spoken }

        return base.replacingOccurrences(of: #"\s+$"#, with: "", options: .regularExpression) + " " + spoken
    }
}
