import PostAnkiAPI
import SwiftUI

struct ChatQueueThreadScreen: View {
    @State private var model: ChatQueueThreadModel
    @Environment(\.dismiss) private var dismiss
    @State private var confirmsDelete = false
    @FocusState private var composerFocused: Bool
    let onResolved: () -> Void
    let onSnoozed: () -> Void
    let onCardUpdated: () -> Void

    init(item: ChatQueueItem, onResolved: @escaping () -> Void, onSnoozed: @escaping () -> Void, onCardUpdated: @escaping () -> Void = {}) {
        self.onCardUpdated = onCardUpdated
        _model = State(initialValue: ChatQueueThreadModel(item: item))
        self.onResolved = onResolved
        self.onSnoozed = onSnoozed
    }

    @ViewBuilder
    private func sourceLine(title: String, link: URL?) -> some View {
        Group {
            if let link {
                HStack(spacing: 4) {
                    Text("From")
                    Link(destination: link) { Text(verbatim: title).underline() }
                }
            } else {
                Text(verbatim: "From \(title)")
            }
        }
        .zoomFont(.caption)
        .foregroundStyle(.secondary)
        .accessibilityIdentifier("chat-queue-thread-source")
    }

    var body: some View {
        VStack(spacing: 0) {
            ScrollViewReader { proxy in
                List {
                    Section("Card") {
                        Text(verbatim: model.item.body)
                            .zoomFont(.body)

                        Text(ChatQueueWaiting.label(chatAt: model.item.chatAt))
                            .zoomFont(.caption)
                            .foregroundStyle(.secondary)
                            .accessibilityIdentifier("chat-queue-thread-waiting")

                        if let title = model.item.sourceTitle, !title.isEmpty {
                            sourceLine(title: title, link: model.item.sourceLink)
                        }

                        if let example = model.item.background, !example.isEmpty {
                            Text(verbatim: example)
                                .zoomFont(.footnote)
                                .foregroundStyle(.secondary)
                        }
                    }

                    ForEach(model.lines) { line in
                        ChatQueueBubble(line: line).id(line.id)

                        if !line.isUser, let seq = line.seq { proposalRows(line: line, seq: seq) }

                        if !line.isUser, line.id == model.lines.last?.id { retryRow }
                    }

                    if model.isSending {
                        HStack {
                            ProgressView()
                            Text("Thinking...").foregroundStyle(.secondary)
                        }
                        .accessibilityElement(children: .combine)
                    }

                    if let notice = model.noticeMessage {
                        Text(notice)
                            .zoomFont(.caption)
                            .foregroundStyle(.secondary)
                            .accessibilityIdentifier("chat-queue-notice")
                    }

                    if let message = model.errorMessage {
                        Text(message)
                            .zoomFont(.caption)
                            .foregroundStyle(.red)
                    }
                }
                .onChange(of: model.lines.count) {
                    if let last = model.lines.last { proxy.scrollTo(last.id, anchor: .bottom) }
                }
            }

            Divider()

            if model.showsStarters { starters }

            footer
            actions
        }
        .navigationTitle("Chat")
        #if os(iOS)
        .navigationBarTitleDisplayMode(.inline)
        #endif
        .task { await model.load() }
        .onChange(of: model.composerFocusRequests) { composerFocused = true }
        .onChange(of: model.item.body) { onCardUpdated() }
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Button("Delete last exchange", systemImage: "trash") { confirmsDelete = true }
                    .disabled(!model.canDeleteLast)
                    .accessibilityIdentifier("chat-queue-delete-last")
            }
        }
        .confirmationDialog("Delete the last question and reply?", isPresented: $confirmsDelete, titleVisibility: .visible) {
            Button("Delete last exchange", role: .destructive) { Task { await model.deleteLastExchange() } }
            Button("Cancel", role: .cancel) {}
        }
        .onChange(of: model.isFinished) { _, finished in
            guard finished else { return }

            if model.wasSnoozed { onSnoozed() } else { onResolved() }

            dismiss()
        }
        .sheet(item: $model.rejectFeedback, onDismiss: {
            if !model.isFinished { model.skipRejectReason() }
        }) { feedback in
            RejectReasonSheet(
                feedback: feedback,
                onSend: { reason, note in await model.sendRejectReason(reason, note: note) },
                onSkip: { model.skipRejectReason() }
            )
        }
    }

    @ViewBuilder
    private func proposalRows(line: ChatQueueLine, seq: Int) -> some View {
        ForEach(line.proposals) { proposal in
            ChatQueueProposalCard(
                proposal: proposal,
                isBusy: model.isDeciding(line, proposal) || model.isResolving,
                errorMessage: model.proposalError(line, proposal),
                canTellTutor: !model.limitReached && !model.budgetPaused,
                onDecide: { decision in
                    Task { await model.decide(seq: seq, index: proposal.index, decision: decision) }
                }
            )
            .listRowSeparator(.hidden)
        }
    }

    private var retryRow: some View {
        Button("Retry answer", systemImage: "arrow.clockwise") { Task { await model.retryLast() } }
            .buttonStyle(.bordered)
            .controlSize(.small)
            .disabled(!model.canRetryLast)
            .accessibilityIdentifier("chat-queue-retry")
    }

    private var starters: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack {
                ForEach(ChatQueueLimits.starterPrompts, id: \.self) { prompt in
                    Button(prompt) { Task { await model.send(prompt) } }
                        .buttonStyle(.bordered)
                        .controlSize(.small)
                        .disabled(model.isSending || model.isResolving)
                }
            }
            .zoomPadding(.horizontal)
        }
        .zoomPadding(.vertical, 6)
        .accessibilityIdentifier("chat-queue-starters")
    }

    @ViewBuilder
    private var footer: some View {
        if model.limitReached {
            Text("Chat limit reached, decide now")
                .zoomFont(.footnote)
                .foregroundStyle(.secondary)
                .zoomPadding(.vertical, 8)
                .accessibilityIdentifier("chat-queue-limit")
        } else if model.budgetPaused {
            Text("Chat is paused for today")
                .zoomFont(.footnote)
                .foregroundStyle(.secondary)
                .zoomPadding(.vertical, 8)
                .accessibilityIdentifier("chat-queue-paused")
        } else {
            ZoomVStack(alignment: .trailing, spacing: 0) {
                HStack {
                    TextField(model.awaitsRejectExplanation ? "What is wrong with it?" : "Ask about this card", text: $model.draft, axis: .vertical)
                        .textFieldStyle(.roundedBorder)
                        .focused($composerFocused)
                        .onChange(of: model.draft) { _, value in
                            if value.count > ChatQueueLimits.maxMessageChars {
                                model.draft = String(value.prefix(ChatQueueLimits.maxMessageChars))
                            }
                        }

                    Button("Send") { Task { await model.send() } }
                        .disabled(!model.canSend)
                }
                .zoomPadding(.horizontal)

                Text("\(model.turnsLeft) left")
                    .zoomFont(.caption)
                    .foregroundStyle(.secondary)
                    .zoomPadding(.horizontal)
                    .accessibilityLabel("\(CountLabel.text(model.turnsLeft, "question")) left")
            }
            .zoomPadding(.vertical, 6)
        }
    }

    @ViewBuilder
    private var actions: some View {
        if model.item.reviewChat {
            HStack {
                Button("Clear chat") { Task { await model.clearChat() } }
                    .buttonStyle(.bordered)
                    .accessibilityIdentifier("chat-queue-clear")
            }
            .controlSize(.small)
            .disabled(model.isResolving || model.isSending)
            .zoomPadding(.horizontal)
            .zoomPadding(.bottom, 8)
        } else {
            triageActions
        }
    }

    private var triageActions: some View {
        HStack {
            Button("Accept") { Task { await model.accept() } }
                .buttonStyle(.borderedProminent)
                .accessibilityIdentifier("chat-queue-accept")

            Button("Reject", role: .destructive) { Task { await model.reject() } }
                .buttonStyle(.bordered)
                .accessibilityIdentifier("chat-queue-reject")

            Menu("Snooze", systemImage: "moon.zzz") {
                ForEach(ChatQueueSnoozeOptions.days, id: \.self) { days in
                    Button(ChatQueueSnoozeOptions.label(days: days)) { Task { await model.snooze(days: days) } }
                }
            }
            .buttonStyle(.bordered)
            .accessibilityIdentifier("chat-queue-thread-snooze")

            Button("Back to triage") { Task { await model.backToTriage() } }
                .buttonStyle(.bordered)
                .accessibilityIdentifier("chat-queue-back")
        }
        .controlSize(.small)
        .disabled(model.isResolving || model.isSending)
        .zoomPadding(.horizontal)
        .zoomPadding(.bottom, 8)
    }
}

private struct ChatQueueBubble: View {
    let line: ChatQueueLine

    var body: some View {
        ZoomVStack(alignment: .leading, spacing: 2) {
            Text(line.isUser ? "You" : "Tutor")
                .zoomFont(.caption2)
                .foregroundStyle(.secondary)

            Text(verbatim: line.text)
                .textSelection(.enabled)
        }
        .contextMenu {
            if !line.isUser, let text = ChatQueueReplyCopy.text(for: line.text) {
                Button("Copy", systemImage: "doc.on.doc") { Diagnostics.copy(text) }
            }
        }
        .accessibilityElement(children: .combine)
    }
}
