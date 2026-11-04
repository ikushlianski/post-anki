import Foundation

extension APIClient {
    public static func draftReplacementCard(
        id: String,
        transcript: [ChatTranscriptEntry]
    ) async throws -> CardProposal {
        let result: DraftKnowledgeBitChatResult = try await request(
            "/knowledge-bits/\(encodedSegment(id))/chat/draft",
            method: "POST",
            body: DraftKnowledgeBitChatInput(
                mode: "create",
                transcript: KnowledgeBitReplacement.recentTranscript(transcript),
                instruction: KnowledgeBitReplacement.instruction,
                allowWebSearch: false
            )
        )

        return result.card
    }

    public static func createDerivedItem(id: String, card: CardProposal) async throws -> DerivedItemResult {
        try await request(
            "/knowledge-bits/\(encodedSegment(id))/derived-items",
            method: "POST",
            body: KnowledgeBitReplacement.derivedItemInput(for: card)
        )
    }
}
