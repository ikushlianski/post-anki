import PostAnkiAPI
import SwiftUI

struct ChatFirstPromptSheet: View {
    let onSend: (String?) -> Void
    @Environment(\.dismiss) private var dismiss
    @State private var text = ""
    @FocusState private var focused: Bool

    private var trimmed: String {
        text.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    var body: some View {
        ZoomVStack(alignment: .leading, spacing: 12) {
            Text("Send to Chat")
                .zoomFont(.headline)

            Text("Add a first question if you like. The reply will be waiting in the chat.")
                .zoomFont(.caption)
                .foregroundStyle(.secondary)

            TextField("Optional first question", text: $text, axis: .vertical)
                .textFieldStyle(.roundedBorder)
                .lineLimit(3...8)
                .focused($focused)
                .onChange(of: text) { _, value in
                    if value.count > ChatQueueLimits.maxMessageChars {
                        text = String(value.prefix(ChatQueueLimits.maxMessageChars))
                    }
                }
                .accessibilityIdentifier("chat-first-prompt-field")

            ZoomHStack(spacing: 12) {
                Spacer()

                Button("Cancel", role: .cancel) { dismiss() }
                    .accessibilityIdentifier("chat-first-prompt-cancel")

                Button(trimmed.isEmpty ? "Send without a prompt" : "Send") {
                    onSend(trimmed.isEmpty ? nil : trimmed)
                    dismiss()
                }
                .buttonStyle(.borderedProminent)
                .keyboardShortcut(.defaultAction)
                .accessibilityIdentifier("chat-first-prompt-send")
            }
        }
        .zoomPadding(20)
        .presentationDetents([.medium])
        #if os(macOS)
        .frame(minWidth: 420)
        #endif
        .onAppear { focused = true }
    }
}
