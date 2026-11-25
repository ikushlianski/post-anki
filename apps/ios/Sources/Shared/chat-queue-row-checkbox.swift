import PostAnkiAPI
import SwiftUI
#if os(macOS)
import AppKit
#endif

struct ChatQueueRowCheckbox: View {
    let model: ChatQueueModel
    let item: ChatQueueItem

    var body: some View {
        Button { tap() } label: {
            Image(systemName: model.picked.contains(item.id) ? "checkmark.square.fill" : "square")
                .font(.system(size: 18))
                .foregroundStyle(model.picked.contains(item.id) ? Color.accentColor : .secondary)
                .frame(width: 20, height: 20)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(model.picked.contains(item.id) ? "Deselect chat" : "Select chat")
        .accessibilityIdentifier("chat-queue-row-checkbox-\(item.id)")
    }

    private func tap() {
        #if os(macOS)
        if NSEvent.modifierFlags.contains(.shift) {
            model.pickRange(to: item.id)

            return
        }
        #endif

        model.togglePicked(item.id)
    }
}

struct ChatQueueSelectAllToggle: View {
    let model: ChatQueueModel

    var body: some View {
        Button { model.toggleAllPicked() } label: {
            Label(
                model.hasPicked ? "\(model.pickedIds.count) selected" : "Select all",
                systemImage: model.allPicked ? "checkmark.square.fill" : (model.hasPicked ? "minus.square" : "square")
            )
            .zoomFont(.body)
        }
        .disabled(model.sortedItems.isEmpty)
        .keyboardShortcut("a", modifiers: .command)
        .accessibilityIdentifier("chat-queue-select-all")
    }
}
