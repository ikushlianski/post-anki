import PostAnkiAPI
import SwiftUI

struct ChatQueueComposer: View {
    @Binding var draft: String
    let placeholder: String
    let canSend: Bool
    let turnsLeft: Int
    var focused: FocusState<Bool>.Binding
    let onSend: () -> Void

    var body: some View {
        ZoomVStack(alignment: .trailing, spacing: 2) {
            ZoomHStack(alignment: .bottom, spacing: 8) {
                TextField(placeholder, text: $draft, axis: .vertical)
                    .textFieldStyle(.plain)
                    .zoomFont(.body)
                    .lineLimit(1...6)
                    .focused(focused)
                    .zoomPadding(.horizontal, 10)
                    .zoomPadding(.vertical, 7)
                    .background(Color.secondary.opacity(0.12), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                    .onChange(of: draft) { _, value in
                        if value.count > ChatQueueLimits.maxMessageChars {
                            draft = String(value.prefix(ChatQueueLimits.maxMessageChars))
                        }
                    }
                    #if os(macOS)
                    .onKeyPress(.return, phases: .down) { press in
                        if press.modifiers.contains(.shift) {
                            draft += "\n"
                            return .handled
                        }

                        if canSend { onSend() }

                        return .handled
                    }
                    #endif
                    .accessibilityIdentifier("chat-queue-composer")

                Button(action: onSend) {
                    Image(systemName: "arrow.up.circle.fill").zoomFont(.title2)
                }
                .buttonStyle(.plain)
                .foregroundStyle(canSend ? Color.accentColor : Color.secondary)
                .disabled(!canSend)
                .accessibilityLabel("Send")
                .accessibilityIdentifier("chat-queue-send")
            }

            Text("\(turnsLeft) left")
                .zoomFont(.caption)
                .foregroundStyle(.secondary)
                .accessibilityLabel("\(CountLabel.text(turnsLeft, "question")) left")
        }
        .zoomPadding(.horizontal, 12)
        .zoomPadding(.vertical, 6)
    }
}
