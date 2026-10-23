import PostAnkiAPI
import SwiftUI

struct StudyChatReply: Sendable {
    let reply: String
    let matchedCards: [MatchedCard]
    let lookupFailed: Bool
}

@Observable
@MainActor
final class StudyChatModel {
    typealias SendHandler = @MainActor (String, [ChatTranscriptEntry]) async throws -> StudyChatReply

    var turns: [StudyChatTurn] = []
    var draft = ""
    var isSending = false

    var hasInput: Bool {
        isSending || !turns.isEmpty || !draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }
    var errorMessage: String?

    private let sendHandler: SendHandler
    private let notFoundMessage: String

    init(notFoundMessage: String = "That item no longer exists.", send: @escaping SendHandler) {
        self.notFoundMessage = notFoundMessage
        sendHandler = send
    }

    func send() async {
        let trimmed = draft.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty, !isSending else { return }

        let prior = turns.map(\.entry).recentTurns
        let userTurn = StudyChatTurn(entry: ChatTranscriptEntry(role: "user", text: trimmed))
        turns.append(userTurn)
        draft = ""
        isSending = true
        errorMessage = nil

        do {
            let result = try await sendHandler(trimmed, prior)
            turns.append(StudyChatTurn(
                entry: ChatTranscriptEntry(role: "assistant", text: result.reply),
                matchedCards: result.matchedCards,
                lookupFailed: result.lookupFailed
            ))
        } catch {
            errorMessage = StudyToolsError.message(for: error, notFound: notFoundMessage)
            draft = trimmed
            turns.removeAll { $0.id == userTurn.id }
        }

        isSending = false
    }

    func clear() {
        turns = []
        errorMessage = nil
    }
}
