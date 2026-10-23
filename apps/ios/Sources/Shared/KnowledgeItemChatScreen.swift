import PostAnkiAPI
import SwiftUI

@Observable
@MainActor
final class KnowledgeItemChatModel {
    let knowledgeBitId: String
    let bitBody: String
    var transcript: [ChatTranscriptEntry] = []
    var draft = ""
    var isSending = false
    var errorMessage: String?
    var isRefining = false
    var refineConfirmed = false
    var sendToInboxConfirmed = false

    init(knowledgeBitId: String, bitBody: String) {
        self.knowledgeBitId = knowledgeBitId
        self.bitBody = bitBody
    }

    func send() async {
        let trimmed = draft.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty, !isSending else { return }

        let priorTranscript = transcript.recentTurns
        transcript.append(ChatTranscriptEntry(role: "user", text: trimmed))
        draft = ""
        isSending = true
        errorMessage = nil

        do {
            let result = try await APIClient.chatWithKnowledgeBit(
                id: knowledgeBitId,
                message: trimmed,
                transcript: priorTranscript
            )
            transcript.append(ChatTranscriptEntry(role: "assistant", text: result.reply))
        } catch {
            errorMessage = StudyToolsError.message(for: error, notFound: "This item no longer exists.")
            draft = trimmed
            transcript.removeLast()
        }

        isSending = false
    }

    private func flattenedTranscript() -> String {
        var lines = ["Knowledge item: \(bitBody)"]
        lines.append(contentsOf: transcript.map { "\($0.role == "user" ? "Learner" : "Tutor"): \($0.text)" })
        return lines.joined(separator: "\n")
    }

    func refineIntoKnowledgeItems() async {
        guard !isRefining else { return }
        isRefining = true
        errorMessage = nil

        do {
            _ = try await APIClient.createKnowledgeSource(text: flattenedTranscript())
            refineConfirmed = true
            try? await APIClient.detectKnowledgeBits()
        } catch {
            errorMessage = "Couldn't send that for review — try again."
        }

        isRefining = false
    }

    func sendToInbox(_ excerpt: String) async {
        let trimmed = excerpt.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }

        do {
            _ = try await APIClient.createKnowledgeSource(text: trimmed)
            sendToInboxConfirmed = true
            try? await APIClient.detectKnowledgeBits()
        } catch {
            errorMessage = "Couldn't send that to the Knowledge Inbox — try again."
        }
    }
}

struct KnowledgeItemChatScreen: View {
    @State private var model: KnowledgeItemChatModel

    init(knowledgeBitId: String, bitBody: String) {
        _model = State(initialValue: KnowledgeItemChatModel(knowledgeBitId: knowledgeBitId, bitBody: bitBody))
    }

    var body: some View {
        VStack(spacing: 0) {
            List {
                Section("Knowledge bit") {
                    Text(model.bitBody)
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                }

                ForEach(Array(model.transcript.enumerated()), id: \.offset) { _, entry in
                    ChatMessageRow(entry: entry, assistantLabel: "Tutor")
                        .contextMenu {
                            if entry.role == "assistant" {
                                Button("Send to Knowledge Inbox") {
                                    Task { await model.sendToInbox(entry.text) }
                                }
                            }
                        }
                }

                if let errorMessage = model.errorMessage {
                    Text(errorMessage)
                        .foregroundStyle(.red)
                }
            }

            Divider()

            ChatComposerBar(
                draft: $model.draft,
                placeholder: "Ask about this…",
                isSending: model.isSending
            ) {
                Task { await model.send() }
            }
        }
        .navigationTitle("Discuss")
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Button("Refine into knowledge items") {
                    Task { await model.refineIntoKnowledgeItems() }
                }
                .disabled(model.isRefining)
            }
        }
        .alert("Sent for review", isPresented: $model.refineConfirmed) {
            Button("OK", role: .cancel) {}
        } message: {
            Text("This bit and your conversation were sent to be split into knowledge items.")
        }
        .alert("Sent to Knowledge Inbox", isPresented: $model.sendToInboxConfirmed) {
            Button("OK", role: .cancel) {}
        }
    }
}
