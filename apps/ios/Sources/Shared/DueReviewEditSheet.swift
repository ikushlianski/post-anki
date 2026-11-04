import PostAnkiAPI
import SwiftUI

enum DueReviewEditRoute: Identifiable {
    case plain(ReviewCard)
    case note(ReviewCard, NoteEditKind, String)

    var id: String {
        switch self {
        case .plain(let card): "plain-\(card.variantId)"
        case .note(let card, _, _): "note-\(card.variantId)"
        }
    }
}

struct DueReviewEditSheet: View {
    let model: DueReviewModel
    let route: DueReviewEditRoute
    let onClose: () -> Void

    var body: some View {
        switch route {
        case .plain(let card):
            QuestionVariantEditSheet(context: card.context, prompt: card.prompt, answer: card.answer) { context, prompt, answer in
                await model.editCurrent(context: context, prompt: prompt, answer: answer)
            }
        case .note(_, let kind, let text):
            NoteEditSheet(kind: kind, text: text) { updated in
                await model.editCurrentNote(kind: kind, text: updated)
            } onClose: {
                onClose()
            }
        }
    }
}
