import PostAnkiAPI
import SwiftUI

struct ChatMessageRow: View {
    let entry: ChatTranscriptEntry
    let assistantLabel: String

    var body: some View {
        ZoomVStack(alignment: .leading, spacing: 2) {
            Text(entry.role == "user" ? "You" : assistantLabel)
                .zoomFont(.caption2)
                .foregroundStyle(.secondary)
            Text(entry.text)
                .textSelection(.enabled)
        }
    }
}

struct ChatComposerBar: View {
    static let maxMessageLength = 20_000

    @Binding var draft: String
    let placeholder: String
    let isSending: Bool
    let onSend: () -> Void

    var body: some View {
        HStack {
            TextField(placeholder, text: $draft, axis: .vertical)
                .textFieldStyle(.roundedBorder)
                .onChange(of: draft) { _, newValue in
                    if newValue.count > Self.maxMessageLength {
                        draft = String(newValue.prefix(Self.maxMessageLength))
                    }
                }
                #if os(macOS)
                .onKeyPress(keys: [.return]) { press in
                    if press.modifiers.contains(.shift) {
                        draft += "\n"
                    } else {
                        onSend()
                    }

                    return .handled
                }
                #endif

            Button("Send", action: onSend)
                .disabled(draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || isSending)
        }
        .zoomPadding()
    }
}
