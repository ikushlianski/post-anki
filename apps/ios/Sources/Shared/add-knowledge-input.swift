import Foundation
import PostAnkiAPI

enum AddKnowledgeInput {
    static func classify(_ raw: String) -> KnowledgeSourceContent? {
        let trimmed = raw.trimmingCharacters(in: .whitespacesAndNewlines)

        guard !trimmed.isEmpty else { return nil }

        if !trimmed.contains(where: \.isWhitespace),
           let url = URL(string: trimmed),
           let scheme = url.scheme?.lowercased(),
           scheme == "http" || scheme == "https",
           url.host?.isEmpty == false {
            return .url(trimmed)
        }

        return .text(trimmed)
    }
}
