import PostAnkiAPI
import SwiftUI

@Observable
@MainActor
final class KnowledgeItemChatModel {
    let knowledgeBitId: String
    let bitBody: String
    let thread: ChatQueueThreadModel
    var isRefining = false
    var refineConfirmed = false
    var addedAsKnowledge = false

    init(knowledgeBitId: String, bitBody: String) {
        self.knowledgeBitId = knowledgeBitId
        self.bitBody = bitBody
        thread = ChatQueueThreadModel(
            item: ChatQueueItem(
                id: knowledgeBitId,
                body: bitBody,
                chatAt: "",
                turnsLeft: ChatQueueLimits.maxUserTurns,
                reviewChat: true
            ),
            counts: .shared,
            drafts: InMemoryChatQueueDraftStore(),
            tracksQueue: false
        )
    }

    var transcript: [ChatTranscriptEntry] {
        thread.lines.map { ChatTranscriptEntry(role: $0.isUser ? "user" : "assistant", text: $0.text) }
    }

    func load() async { await thread.load() }

    func send() async { await thread.send() }

    private func flattenedTranscript() -> String {
        var lines = ["Knowledge item: \(bitBody)"]
        lines.append(contentsOf: transcript.map { "\($0.role == "user" ? "Learner" : "Tutor"): \($0.text)" })
        return lines.joined(separator: "\n")
    }

    func refineIntoKnowledgeItems() async {
        guard !isRefining else { return }
        isRefining = true
        thread.errorMessage = nil

        do {
            _ = try await APIClient.createKnowledgeSource(text: flattenedTranscript())
            refineConfirmed = true
            try? await APIClient.detectKnowledgeBits()
        } catch {
            thread.errorMessage = "Couldn't send that for review — try again."
        }

        isRefining = false
    }

    func addAsKnowledge(_ excerpt: String) async {
        let trimmed = excerpt.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }

        do {
            _ = try await APIClient.createKnowledgeSource(text: trimmed)
            addedAsKnowledge = true
            try? await APIClient.detectKnowledgeBits()
        } catch {
            thread.errorMessage = "Couldn't add that as new knowledge — try again."
        }
    }
}
