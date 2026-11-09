import PostAnkiAPI
import SwiftUI

struct KnowledgeItemChatScreen: View {
    @State private var model: KnowledgeItemChatModel
    @State private var replacement: CardReplacementModel
    @FocusState private var composerFocused: Bool
    private let onReplacementSaved: (() async -> Void)?

    init(knowledgeBitId: String, bitBody: String, onReplacementSaved: (() async -> Void)? = nil) {
        _model = State(initialValue: KnowledgeItemChatModel(knowledgeBitId: knowledgeBitId, bitBody: bitBody))
        _replacement = State(initialValue: CardReplacementModel(knowledgeBitId: knowledgeBitId))
        self.onReplacementSaved = onReplacementSaved
    }

    var body: some View {
        @Bindable var thread = model.thread

        VStack(spacing: 0) {
            List {
                Section("Knowledge bit") {
                    Text(model.bitBody)
                        .zoomFont(.subheadline)
                        .foregroundStyle(.secondary)
                }

                ForEach(thread.lines) { line in
                    ChatQueueMessageBubble(line: line)
                        .listRowSeparator(.hidden)
                        .contextMenu {
                            if !line.isUser {
                                Button("Add as new knowledge") {
                                    Task { await model.addAsKnowledge(line.text) }
                                }
                            }
                        }

                    if !line.isUser { ChatQueueProposalRows(model: thread, line: line).listRowSeparator(.hidden) }
                }

                if thread.isSending {
                    HStack {
                        ProgressView().controlSize(.small)
                        Text("Thinking...").foregroundStyle(.secondary)
                    }
                    .zoomFont(.caption)
                }

                if let errorMessage = thread.errorMessage {
                    Text(errorMessage)
                        .foregroundStyle(.red)
                }
            }

            Divider()

            if let onReplacementSaved, model.transcript.contains(where: { $0.role == "assistant" }) {
                CardReplacementBar(model: replacement, transcript: model.transcript, onSaved: onReplacementSaved)
            }

            if !thread.limitReached && !thread.budgetPaused {
                HStack {
                    ChatQueueMakeCardButton(model: thread)
                    Spacer()
                }
                .zoomPadding(.horizontal)
                .zoomPadding(.vertical, 4)
            }

            composer(thread: $thread)
        }
        .navigationTitle("Discuss")
        .task { await model.load() }
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

    @ViewBuilder
    private func composer(thread: Bindable<ChatQueueThreadModel>) -> some View {
        if thread.wrappedValue.limitReached {
            Text("Chat limit reached")
                .zoomFont(.footnote)
                .foregroundStyle(.secondary)
                .zoomPadding(.vertical, 8)
        } else if thread.wrappedValue.budgetPaused {
            Text("Chat is paused for today")
                .zoomFont(.footnote)
                .foregroundStyle(.secondary)
                .zoomPadding(.vertical, 8)
        } else {
            ChatQueueComposer(
                draft: thread.draft,
                placeholder: "Ask about this…",
                canSend: thread.wrappedValue.canSend,
                turnsLeft: thread.wrappedValue.turnsLeft,
                focused: $composerFocused,
                onSend: { Task { await model.send() } }
            )
        }
    }
}
