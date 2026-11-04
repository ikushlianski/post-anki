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
    var addedAsKnowledge = false

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
                transcript: priorTranscript,
                clientMessageId: UUID().uuidString
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

    func addAsKnowledge(_ excerpt: String) async {
        let trimmed = excerpt.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }

        do {
            _ = try await APIClient.createKnowledgeSource(text: trimmed)
            addedAsKnowledge = true
            try? await APIClient.detectKnowledgeBits()
        } catch {
            errorMessage = "Couldn't add that as new knowledge — try again."
        }
    }
}

struct KnowledgeItemChatScreen: View {
    @State private var model: KnowledgeItemChatModel
    @State private var replacement: CardReplacementModel
    private let onReplacementSaved: (() async -> Void)?

    init(knowledgeBitId: String, bitBody: String, onReplacementSaved: (() async -> Void)? = nil) {
        _model = State(initialValue: KnowledgeItemChatModel(knowledgeBitId: knowledgeBitId, bitBody: bitBody))
        _replacement = State(initialValue: CardReplacementModel(knowledgeBitId: knowledgeBitId))
        self.onReplacementSaved = onReplacementSaved
    }

    var body: some View {
        VStack(spacing: 0) {
            List {
                Section("Knowledge bit") {
                    Text(model.bitBody)
                        .zoomFont(.subheadline)
                        .foregroundStyle(.secondary)
                }

                ForEach(Array(model.transcript.enumerated()), id: \.offset) { _, entry in
                    ChatMessageRow(entry: entry, assistantLabel: "Tutor")
                        .contextMenu {
                            if entry.role == "assistant" {
                                Button("Add as new knowledge") {
                                    Task { await model.addAsKnowledge(entry.text) }
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

            if let onReplacementSaved, model.transcript.contains(where: { $0.role == "assistant" }) {
                CardReplacementBar(model: replacement, transcript: model.transcript, onSaved: onReplacementSaved)
            }

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
        .alert("Added as new knowledge", isPresented: $model.addedAsKnowledge) {
            Button("OK", role: .cancel) {}
        }
    }
}
