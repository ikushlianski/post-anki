import Foundation
import PostAnkiAPI

extension DueReviewModel {
    func editCurrent(prompt: String, answer: String) async -> String? {
        guard let card = current else { return nil }

        do {
            let newId = try await APIClient.editQuestionVariant(id: card.variantId, prompt: prompt, answer: answer)

            guard let latest = current, latest.variantId == card.variantId else { return nil }

            current = ReviewCard(
                variantId: newId,
                knowledgeBitId: latest.knowledgeBitId,
                kind: latest.kind,
                prompt: prompt,
                answer: answer,
                background: latest.background,
                phase: latest.phase,
                leech: latest.leech,
                intervalPreview: latest.intervalPreview
            )

            return nil
        } catch {
            if KnowledgeManageError.isGone(error) {
                return "This card was changed or removed elsewhere."
            }

            return KnowledgeManageError.message(for: error, action: "save this card")
        }
    }
}
