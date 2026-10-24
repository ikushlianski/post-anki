import Foundation

public enum KnowledgeSourceContent: Sendable, Hashable {
    case text(String)
    case url(String)
}

struct AddKnowledgeSourceInput: Encodable, Sendable {
    let text: String?
    let url: String?
    let subjectId: String?
    let force: Bool?
}

extension APIClient {
    public static func addKnowledgeSource(
        content: KnowledgeSourceContent,
        subjectId: String? = nil,
        force: Bool = false
    ) async throws -> CreateKnowledgeSourceResult {
        var text: String?
        var url: String?

        switch content {
        case .text(let value): text = value
        case .url(let value): url = value
        }

        return try await request(
            "/knowledge-sources",
            method: "POST",
            body: AddKnowledgeSourceInput(text: text, url: url, subjectId: subjectId, force: force ? true : nil)
        )
    }
}
