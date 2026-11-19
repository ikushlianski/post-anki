import PostAnkiAPI
import SwiftUI

struct DueReviewCardControlsMenu: View {
    let model: DueReviewModel
    let onEdit: () -> Void
    @AppStorage(ShowCardIdsSetting.key) private var showsCardIds = false

    var body: some View {
        Menu {
            if let card = model.current {
                Button("Edit card", systemImage: "pencil", action: onEdit)
                    .accessibilityIdentifier("due-review-edit")

                if model.isRevealed {
                    answerActions(card)
                }

                Button("Chat about this card", systemImage: "bubble.left.and.bubble.right") {
                    model.chatCard = card
                }
                .accessibilityIdentifier("due-review-chat")

                Button("Move to deck", systemImage: "folder") {
                    model.presentMovePicker()
                }
                .accessibilityIdentifier("due-review-move")

                Button("Bury until tomorrow", systemImage: "moon.zzz") {
                    Task { await model.buryCurrent() }
                }
                .accessibilityIdentifier("due-review-bury")

                Button("Suspend this card", systemImage: "pause.circle") {
                    Task { await model.suspendCurrent(offersUndo: true) }
                }
                .accessibilityIdentifier("due-review-suspend")
                .accessibilityHint("Stops this card from coming up until you unsuspend it")
            }
        } label: {
            Label("Card actions", systemImage: "ellipsis.circle")
        }
        .accessibilityIdentifier("due-review-card-actions")
    }

    @ViewBuilder
    private func answerActions(_ card: ReviewCard) -> some View {
        Button("Make card from selection", systemImage: "text.badge.plus") {
            model.makeCardCard = card
        }
        .accessibilityIdentifier("review-make-card")

        Button(hasNote(card) ? "Edit note" : "Add note", systemImage: "note.text") {
            model.noteCard = card
        }
        .accessibilityIdentifier("review-card-note-edit")

        Button("Copy all", systemImage: "doc.on.doc") {
            CopyToPasteboard.copy(CardCopyText.all(CardCopyText.reviewParts(card)))
        }
        .accessibilityIdentifier("review-copy-all")

        ShareLink(item: card.shareText) {
            Label("Share card", systemImage: "square.and.arrow.up")
        }
        .accessibilityIdentifier("review-share-card")

        if showsCardIds {
            Button("Copy card id", systemImage: "number") {
                CopyToPasteboard.copy(card.variantId)
            }
            .accessibilityIdentifier("copy-card-id")
        }
    }

    private func hasNote(_ card: ReviewCard) -> Bool {
        !((model.savedNotes[card.knowledgeBitId] ?? card.userNote) ?? "").trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }
}
