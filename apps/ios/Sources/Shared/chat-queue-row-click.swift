import PostAnkiAPI
import SwiftUI

#if os(macOS)
import AppKit

struct ChatQueueRowClick: ViewModifier {
    let model: ChatQueueModel
    let item: ChatQueueItem
    let open: () -> Void

    func body(content: Content) -> some View {
        content
            .contentShape(Rectangle())
            .onTapGesture(count: 2, perform: open)
            .onTapGesture { select() }
    }

    private func select() {
        let flags = NSEvent.modifierFlags

        if flags.contains(.shift) {
            model.pickRange(to: item.id)
        } else if flags.contains(.command) {
            model.togglePicked(item.id)
        } else {
            model.pickOnly(item.id)
        }
    }
}
#endif
