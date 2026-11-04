import PostAnkiAPI
import SwiftUI

struct DueReviewChatSheet: View {
    let card: ReviewCard
    var onReplaced: (() async -> Void)?
    let onClose: () -> Void

    var body: some View {
        NavigationStack {
            KnowledgeItemChatScreen(knowledgeBitId: card.knowledgeBitId, bitBody: DueReviewChatSheet.bitBody(for: card), onReplacementSaved: onReplaced)
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) {
                        Button("Done", action: onClose)
                    }
                }
        }
    }

    static func bitBody(for card: ReviewCard) -> String {
        "\(card.face.front)\n\(card.answer)"
    }
}

extension View {
    func dueReviewChatSheet(model: DueReviewModel) -> some View {
        sheet(item: Bindable(model).chatCard) { card in
            DueReviewChatSheet(
                card: card,
                onReplaced: {
                    await model.suspendCurrent()
                    model.chatCard = nil
                },
                onClose: { model.chatCard = nil }
            )
            #if os(macOS)
                .frame(minWidth: 480, minHeight: 520)
            #endif
        }
    }
}
