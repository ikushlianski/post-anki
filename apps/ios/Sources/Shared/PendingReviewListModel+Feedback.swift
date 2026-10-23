import Foundation
import PostAnkiAPI

enum PendingReviewEditOutcome: Sendable {
    case saved
    case gone
    case failed(String)
}

struct PendingReviewVariantEdit: Sendable {
    let id: String
    let prompt: String
    let answer: String
}

extension PendingReviewListModel {
    func sendFeedback(_ feedback: PendingRejectFeedback, reason: RejectReason, note: String) async -> String? {
        let trimmed = note.trimmingCharacters(in: .whitespacesAndNewlines)

        do {
            try await APIClient.setRejectFeedback(
                id: feedback.feedbackId,
                reasonCode: reason.rawValue,
                note: trimmed.isEmpty ? nil : String(trimmed.prefix(500))
            )

            if pendingFeedback?.feedbackId == feedback.feedbackId { pendingFeedback = nil }

            return nil
        } catch {
            return KnowledgeManageError.message(for: error, action: "send the reason")
        }
    }

    func skipFeedback() {
        pendingFeedback = nil
    }

    func saveEdit(
        bitId: String,
        body: String?,
        background: String?,
        backgroundChanged: Bool,
        currentBody: String,
        variants: [PendingReviewVariantEdit]
    ) async -> PendingReviewEditOutcome {
        guard !inFlight.contains(bitId) else { return .failed("This item is busy. Try again.") }

        inFlight.insert(bitId)
        defer { inFlight.remove(bitId) }

        do {
            if body != nil || backgroundChanged {
                try await APIClient.editKnowledgeBit(id: bitId, body: body ?? currentBody, background: background)
            }

            if body == nil {
                for edit in variants {
                    _ = try await APIClient.editQuestionVariant(id: edit.id, prompt: edit.prompt, answer: edit.answer)
                }
            }

            return .saved
        } catch {
            if KnowledgeManageError.isGone(error) { return .gone }

            return .failed(KnowledgeManageError.message(for: error, action: "save your changes"))
        }
    }
}
