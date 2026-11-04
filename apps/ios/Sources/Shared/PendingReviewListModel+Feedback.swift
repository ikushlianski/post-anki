import Foundation
import PostAnkiAPI

enum PendingReviewEditOutcome: Sendable {
    case saved
    case gone
    case failed(String)
}

struct PendingReviewVariantEdit: Sendable {
    let id: String
    let context: String?
    let prompt: String
    let answer: String
}

extension PendingReviewListModel {
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
                    _ = try await APIClient.editQuestionVariant(id: edit.id, context: edit.context, prompt: edit.prompt, answer: edit.answer)
                }
            }

            return .saved
        } catch {
            if KnowledgeManageError.isGone(error) { return .gone }

            return .failed(KnowledgeManageError.message(for: error, action: "save your changes"))
        }
    }
}

extension PendingReviewListModel {
    func saveNoteEdit(bitId: String, variantId: String, kind: NoteEditKind, text: String) async -> PendingReviewEditOutcome {
        guard !inFlight.contains(bitId) else { return .failed("This item is busy. Try again.") }

        inFlight.insert(bitId)
        defer { inFlight.remove(bitId) }

        do {
            _ = try await APIClient.editQuestionVariantNote(id: variantId, kind: kind, text: text)

            return .saved
        } catch {
            if KnowledgeManageError.isGone(error) { return .gone }

            return .failed(KnowledgeManageError.message(for: error, action: "save your changes"))
        }
    }
}
