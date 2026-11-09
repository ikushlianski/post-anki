import SwiftUI

struct ChatQueueJumpButton: View {
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Image(systemName: "arrow.down")
                .zoomFont(.callout.weight(.semibold))
                .zoomPadding(9)
                .background(.regularMaterial, in: Circle())
                .overlay(Circle().strokeBorder(Color.secondary.opacity(0.3)))
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Jump to latest")
        .accessibilityIdentifier("chat-queue-jump-latest")
    }
}
