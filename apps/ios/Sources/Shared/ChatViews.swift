import PostAnkiAPI
import SwiftUI

struct ChatMessageRow: View {
    let entry: ChatTranscriptEntry
    let assistantLabel: String

    var body: some View {
        ZoomVStack(alignment: entry.role == "user" ? .trailing : .leading, spacing: 2) {
            Text(entry.role == "user" ? "You" : assistantLabel)
                .zoomFont(.caption2)
                .foregroundStyle(.secondary)
                .zoomPadding(.horizontal, 4)
            ChatBubble(text: entry.text, isUser: entry.role == "user")
        }
        .frame(maxWidth: .infinity, alignment: entry.role == "user" ? .trailing : .leading)
        .zoomPadding(.vertical, 4)
        .listRowSeparator(.hidden)
    }
}

struct ChatComposerBar: View {
    static let maxMessageLength = 20_000

    @Binding var draft: String
    let placeholder: String
    let isSending: Bool
    var lastReply: String?
    let onSend: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            composer
            ChatVoiceControls(draft: $draft, isBusy: isSending, lastReply: lastReply)
        }
        .zoomPadding()
    }

    private var composer: some View {
        HStack {
            TextField(placeholder, text: $draft, axis: .vertical)
                .textFieldStyle(.roundedBorder)
                .onChange(of: draft) { _, newValue in
                    if newValue.count > Self.maxMessageLength {
                        draft = String(newValue.prefix(Self.maxMessageLength))
                    }
                }
                #if os(macOS)
                .onEnterKeyPress { press in
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
    }
}
