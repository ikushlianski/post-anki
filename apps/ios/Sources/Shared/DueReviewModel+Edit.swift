import Foundation
import PostAnkiAPI

extension DueReviewModel {
    func editCurrent(context: String?, prompt: String, answer: String) async -> String? {
        guard let card = current else { return nil }

        do {
            let newId = try await APIClient.editQuestionVariant(id: card.variantId, context: context, prompt: prompt, answer: answer)

            guard let latest = current, latest.variantId == card.variantId else { return nil }

            current = ReviewCard(
                variantId: newId,
                knowledgeBitId: latest.knowledgeBitId,
                kind: latest.kind,
                context: context.map { $0.isEmpty ? nil : $0 } ?? latest.context,
                prompt: prompt,
                answer: answer,
                sentence: latest.sentence,
                background: latest.background,
                phase: latest.phase,
                leech: latest.leech,
                intervalPreview: latest.intervalPreview,
                cardKey: latest.cardKey,
                aiSuggestion: latest.aiSuggestion,
                originalPhrase: latest.originalPhrase
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

extension DueReviewModel {
    func editRoute(for card: ReviewCard) async -> DueReviewEditRoute {
        guard let kind = NoteEditKind(cardKind: card.kind) else { return .plain(card) }

        if card.noteKind != nil, let sentence = card.sentence {
            return .note(card, kind, sentence)
        }

        if let source = try? await APIClient.knowledgeBitNoteSource(bitId: card.knowledgeBitId) {
            return .note(card, source.kind, source.text)
        }

        return .plain(card)
    }

    func editCurrentNote(kind: NoteEditKind, text: String) async -> String? {
        guard let card = current else { return nil }

        do {
            let result = try await APIClient.editQuestionVariantNoteResult(id: card.variantId, kind: kind, text: text)

            guard let latest = current, latest.variantId == card.variantId else { return nil }

            let edited = result.editedCard

            current = ReviewCard(
                variantId: result.variantId,
                knowledgeBitId: latest.knowledgeBitId,
                kind: latest.kind,
                context: edited.map(\.context) ?? latest.context,
                prompt: edited?.prompt ?? latest.prompt,
                answer: edited?.answer ?? latest.answer,
                sentence: text,
                background: latest.background,
                phase: latest.phase,
                leech: latest.leech,
                intervalPreview: latest.intervalPreview,
                cardKey: latest.cardKey,
                aiSuggestion: latest.aiSuggestion,
                originalPhrase: latest.originalPhrase
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
