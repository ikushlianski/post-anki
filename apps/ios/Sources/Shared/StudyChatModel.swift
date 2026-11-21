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

    private let recoverFromStaleModel: @MainActor () async -> Void

    init(
        notFoundMessage: String = "That item no longer exists.",
        recoverFromStaleModel: @escaping @MainActor () async -> Void = {
            ChatModelCatalog.shared.reset()
            await ChatModelCatalog.shared.refresh()
        },
        send: @escaping SendHandler
    ) {
        self.notFoundMessage = notFoundMessage
        self.recoverFromStaleModel = recoverFromStaleModel
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
            draft = trimmed
            turns.removeAll { $0.id == userTurn.id }

            if ChatQueueFailure.failure(for: error) == .invalidModel {
                await recoverFromStaleModel()
                errorMessage = ChatQueueFailure.invalidModel.message
            } else {
                errorMessage = StudyToolsError.message(for: error, notFound: notFoundMessage)
            }
        }

        isSending = false
    }

    func clear() {
        turns = []
        errorMessage = nil
    }
}
