import PostAnkiAPI
import SwiftUI

extension ChatQueueThreadScreen {
    var starters: some View {
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
    var makeCardRow: some View {
        if !model.limitReached && !model.budgetPaused {
            HStack {
                ChatQueueMakeCardButton(model: model)

                Spacer()
            }
            .zoomPadding(.horizontal)
            .zoomPadding(.vertical, 4)
        }
    }

    @ViewBuilder
    var footer: some View {
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
            ChatQueueComposer(
                draft: $model.draft,
                placeholder: model.sendPlaceholder,
                canSend: model.canSend,
                turnsLeft: model.turnsLeft,
                focused: $composerFocused,
                onSend: { Task { await model.send() } }
            )
        }
    }

    @ViewBuilder
    var actions: some View {
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

    var triageActions: some View {
        HStack {
            if model.hasAcceptedCard {
                Button("Finish chat") { Task { await model.accept() } }
                    .buttonStyle(.borderedProminent)
                    .accessibilityIdentifier("chat-queue-finish")
            } else {
                Button("Cancel chat") {
                    if model.lines.isEmpty { Task { await model.cancelChat() } } else { confirmsCancelChat = true }
                }
                .buttonStyle(.borderedProminent)
                .accessibilityIdentifier("chat-queue-cancel-chat")
            }

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
