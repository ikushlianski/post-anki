import Foundation

extension APIClient {
    static func inboxPath(_ id: String) -> String {
        "/knowledge-bits/\(encodedSegment(id))/inbox"
    }

    static func inboxDiscardPath(_ id: String) -> String {
        "\(inboxPath(id))/discard"
    }

    static func examplePath(_ id: String) -> String {
        "/knowledge-bits/\(encodedSegment(id))/example"
    }

    @discardableResult
    public static func moveKnowledgeBitToInbox(id: String) async throws -> Int {
        let result: MoveToInboxResult = try await request(inboxPath(id), method: "POST")

        return result.inboxCount
    }

    public static func returnKnowledgeBitFromInbox(id: String) async throws {
        let _: EmptyResponse = try await request(inboxPath(id), method: "DELETE")
    }

    public static func discardKnowledgeBitFromInbox(id: String) async throws {
        let _: EmptyResponse = try await request(inboxDiscardPath(id), method: "POST")
    }

    public static func listInboxKnowledgeBits() async throws -> InboxKnowledgeBitList {
        try await request("/knowledge-bits/inbox")
    }

    public static func generateKnowledgeBitExample(
        id: String,
        overwrite: Bool = false
    ) async throws -> GenerateKnowledgeBitExampleResult {
        try await request(
            examplePath(id),
            method: "POST",
            body: GenerateKnowledgeBitExampleInput(overwrite: overwrite ? true : nil),
            timeout: 60
        )
    }
}
