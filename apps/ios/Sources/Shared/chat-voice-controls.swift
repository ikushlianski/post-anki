import SwiftUI

struct ChatVoiceControls: View {
    @Binding var draft: String
    let isBusy: Bool
    let lastReply: String?

    @State private var dictation = DictationModel()
    @Bindable private var readAloud = ReadAloudModel.shared

    var body: some View {
        ZoomVStack(alignment: .leading, spacing: 2) {
            if dictation.isSupported || readAloud.isSupported {
                controls
            }

            if let message = dictation.message {
                Text(message)
                    .zoomFont(.caption)
                    .foregroundStyle(.red)
                    .accessibilityIdentifier("chat-voice-error")
            }
        }
        .onChange(of: draft) { _, value in dictation.draftChanged(to: value) }
        .onChange(of: isBusy) { old, busy in
            if busy {
                readAloud.stop()
            } else if old, let lastReply {
                readAloud.replyFinished(lastReply)
            }
        }
        .onDisappear {
            readAloud.stop()
            dictation.cancel()
        }
    }

    private var controls: some View {
        ZoomHStack(spacing: 12) {
            if dictation.isSupported {
                Button {
                    Task { await dictation.toggle(draft: draft) { draft = $0 } }
                } label: {
                    Image(systemName: dictation.isListening ? "mic.fill" : "mic")
                        .foregroundStyle(dictation.isListening ? Color.red : Color.accentColor)
                }
                .buttonStyle(.plain)
                .disabled(isBusy || dictation.isBlocked)
                .accessibilityLabel(dictation.isListening ? "Stop dictating" : "Dictate")
                .accessibilityIdentifier("chat-voice-mic")
            }

            if readAloud.isSupported {
                Toggle("Read replies aloud", isOn: $readAloud.isEnabled)
                    .toggleStyle(.switch)
                    .controlSize(.mini)
                    .zoomFont(.caption)
                    .fixedSize()
                    .accessibilityIdentifier("chat-voice-read-aloud")
            }

            if readAloud.isSpeaking {
                Button {
                    readAloud.stop()
                } label: {
                    Image(systemName: "stop.circle")
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Stop reading")
                .accessibilityIdentifier("chat-voice-stop")
            }

            Spacer(minLength: 0)
        }
    }
}
