import PostAnkiAPI
import SwiftUI

struct SocraticMessage: Identifiable, Hashable {
    enum Role { case mentor, learner }

    let id = UUID()
    let role: Role
    let text: String

    var entry: ChatTranscriptEntry {
        ChatTranscriptEntry(role: role == .learner ? "user" : "assistant", text: text)
    }
}

@Observable
@MainActor
final class SocraticModel {
    let topicId: String
    var session: SocraticSession?
    var messages: [SocraticMessage] = []
    var currentTurn: SocraticTurn?
    var draft = ""
    var isSending = false
    var isStarting = false
    var hasStarted = false
    var covered = 0
    var total = 0
    var maturity = 0.0
    var checkpoint: SocraticCheckpointSummary?
    var showsCheckpoint = false
    var summary: SocraticSummary?
    var showsSummary = false
    var isFinished = false
    var blockedReason: String?
    var errorMessage: String?

    init(topicId: String) {
        self.topicId = topicId
    }

    var allCovered: Bool {
        session != nil && currentTurn == nil && !isFinished
    }

    func start(regenerate: Bool = false) async {
        guard !isStarting, regenerate || !hasStarted else { return }

        isStarting = true
        errorMessage = nil

        do {
            let started = try await APIClient.startSocratic(topicId: topicId, regenerate: regenerate)
            session = started
            currentTurn = started.current
            covered = started.conceptsCovered
            total = started.conceptsTotal
            maturity = started.topicMaturity
            messages = started.current.map { [SocraticMessage(role: .mentor, text: $0.prompt)] } ?? []
            isFinished = false
            summary = nil
            checkpoint = nil
            showsCheckpoint = false
            hasStarted = true
        } catch {
            if QuizError.isBlocked(error) {
                blockedReason = QuizError.message(for: error)
            } else {
                errorMessage = QuizError.message(for: error)
            }
        }

        isStarting = false
    }

    func send() async {
        let trimmed = draft.trimmingCharacters(in: .whitespacesAndNewlines)

        guard !trimmed.isEmpty, !isSending, let session, let turn = currentTurn else { return }

        let userMessage = SocraticMessage(role: .learner, text: trimmed)
        messages.append(userMessage)
        draft = ""
        isSending = true
        errorMessage = nil

        do {
            let result = try await APIClient.answerSocratic(sessionId: session.id, turnId: turn.id, answer: trimmed)
            apply(result, from: turn)
        } catch {
            errorMessage = QuizError.message(for: error)
            draft = trimmed
            messages.removeAll { $0.id == userMessage.id }
        }

        isSending = false
    }

    private func apply(_ result: SocraticAnswerResult, from turn: SocraticTurn) {
        messages.append(SocraticMessage(role: .mentor, text: result.feedback))
        covered = result.conceptsCovered
        total = result.conceptsTotal
        maturity = result.topicMaturity

        if let next = result.next, next.id != turn.id {
            messages.append(SocraticMessage(role: .mentor, text: next.prompt))
        }

        currentTurn = result.action == "retry" ? turn : result.next

        if result.checkpointReached == true {
            checkpoint = result.checkpointSummary
            showsCheckpoint = true
        }
    }

    func finish() async {
        guard let session, !isSending else { return }

        isSending = true
        errorMessage = nil
        showsCheckpoint = false

        do {
            let result = try await APIClient.completeSocratic(sessionId: session.id)
            summary = result.summary
            showsSummary = true
            isFinished = true
            currentTurn = nil
        } catch {
            errorMessage = QuizError.message(for: error)
        }

        isSending = false
    }
}
