import SwiftUI

struct DueReviewCardControlsMenu: View {
    let model: DueReviewModel

    var body: some View {
        Menu {
            Button("Chat about this card", systemImage: "bubble.left.and.bubble.right") {
                model.chatCard = model.current
            }
            Button("Move to deck", systemImage: "folder") {
                model.presentMovePicker()
            }
            Button("Bury until tomorrow", systemImage: "moon.zzz") {
                Task { await model.buryCurrent() }
            }
            Button("Suspend this card", systemImage: "pause.circle") {
                Task { await model.suspendCurrent(offersUndo: true) }
            }
        } label: {
            Label("Card actions", systemImage: "ellipsis.circle")
        }
    }
}
