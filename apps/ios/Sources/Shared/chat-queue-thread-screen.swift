import PostAnkiAPI
import SwiftUI

struct ChatQueueThreadScreen: View {
    @State var model: ChatQueueThreadModel
    @Environment(\.dismiss) private var dismiss
    @State private var confirmsDelete = false
    @State private var isAtBottom = true
    @FocusState var composerFocused: Bool
    @Environment(\.zoomScale) private var zoomScale
    private static let bottomID = "chat-queue-bottom"
    let onResolved: () -> Void
    let onSnoozed: () -> Void
    let onCardUpdated: () -> Void

    init(item: ChatQueueItem, onResolved: @escaping () -> Void, onSnoozed: @escaping () -> Void, onCardUpdated: @escaping () -> Void = {}) {
        self.onCardUpdated = onCardUpdated
        _model = State(initialValue: ChatQueueThreadModel(item: item))
        self.onResolved = onResolved
        self.onSnoozed = onSnoozed
    }

    var body: some View {
        ScrollViewReader { proxy in
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 10 * CGFloat(zoomScale)) {
                    ForEach(model.lines) { line in
                        ChatQueueMessageBubble(line: line).id(line.id)

                        if !line.isUser, let seq = line.seq { proposalRows(line: line, seq: seq) }

                        if !line.isUser, line.id == model.lines.last?.id { retryRow }
                    }

                    if model.isSending {
                        HStack {
                            ProgressView().controlSize(.small)
                            Text("Thinking...").foregroundStyle(.secondary)
                        }
                        .zoomFont(.caption)
                        .accessibilityElement(children: .combine)
                    }

                    ForEach(model.queuedFollowUps) { followUp in
                        ChatQueueFollowUpBubble(
                            followUp: followUp,
                            onCancel: { Task { await model.cancelFollowUp(followUp.id) } },
                            onRetry: { Task { await model.retryFollowUp(followUp.id) } }
                        )
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

                    Color.clear.frame(height: 1).id(Self.bottomID)
                        .onAppear { isAtBottom = true }
                        .onDisappear { isAtBottom = false }
                }
                .zoomPadding(.horizontal, 12)
                .zoomPadding(.vertical, 10)
            }
            .defaultScrollAnchor(.bottom)
            .onChange(of: model.lines.last?.id) { _, _ in
                guard ChatQueueScrollFollow.shouldScroll(isAtBottom: isAtBottom, newestIsUser: model.lines.last?.isUser ?? false) else { return }

                withAnimation { proxy.scrollTo(Self.bottomID, anchor: .bottom) }
            }
            .onChange(of: model.isSending) { _, sending in
                guard sending, isAtBottom else { return }

                withAnimation { proxy.scrollTo(Self.bottomID, anchor: .bottom) }
            }
            .overlay(alignment: .bottomTrailing) {
                if ChatQueueScrollFollow.showsJumpButton(isAtBottom: isAtBottom, hasLines: !model.lines.isEmpty) {
                    ChatQueueJumpButton { withAnimation { proxy.scrollTo(Self.bottomID, anchor: .bottom) } }
                        .zoomPadding(12)
                }
            }
        }
        .safeAreaInset(edge: .top, spacing: 0) { ChatQueueCardHeader(item: model.item) }
        .safeAreaInset(edge: .bottom, spacing: 0) {
            VStack(spacing: 0) {
                Divider()

                if model.showsStarters { starters }

                footer
                actions
            }
            .background(.bar)
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
        }
    }

    private var retryRow: some View {
        Button("Retry answer", systemImage: "arrow.clockwise") { Task { await model.retryLast() } }
            .buttonStyle(.bordered)
            .controlSize(.small)
            .disabled(!model.canRetryLast)
            .accessibilityIdentifier("chat-queue-retry")
    }
}
