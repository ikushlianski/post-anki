import PostAnkiAPI
import SwiftUI

struct ChatQueueProposalCard: View {
    let proposal: ChatQueueProposal
    let isBusy: Bool
    let errorMessage: String?
    var canTellTutor = true
    var isRewording = false
    var onReword: (() -> Void)?
    let onDecide: (ChatQueueProposalDecision) -> Void

    @State private var offset: CGFloat = 0

    var body: some View {
        ZoomVStack(alignment: .leading, spacing: 6) {
            Text(proposal.kind.label)
                .zoomFont(.caption.weight(.semibold))
                .foregroundStyle(.secondary)

            Text(verbatim: proposal.front)
                .zoomFont(.body.weight(.semibold))

            Text(verbatim: proposal.back)
                .zoomFont(.body)

            if let example = proposal.example, !example.isEmpty {
                Text(verbatim: example)
                    .zoomFont(.footnote)
                    .foregroundStyle(.secondary)
            }

            if let reason = proposal.reason, !reason.isEmpty {
                Text(verbatim: reason)
                    .zoomFont(.caption)
                    .foregroundStyle(.secondary)
            }

            footer

            if let errorMessage {
                Text(errorMessage)
                    .zoomFont(.caption)
                    .foregroundStyle(.red)
                    .accessibilityIdentifier("chat-queue-proposal-error-\(proposal.index)")
            }
        }
        .zoomPadding(10)
        .background(tint.opacity(0.12), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).strokeBorder(tint.opacity(0.4)))
        .offset(x: offset)
        .rotationEffect(.degrees(Double(offset) / 60))
        .simultaneousGesture(proposal.status == .pending ? drag : nil)
        .accessibilityElement(children: .contain)
        .accessibilityLabel(ChatQueueProposalAccessibility.label(proposal, isBusy: isBusy, errorMessage: errorMessage))
        .onChange(of: proposal.status) { _, _ in
            if let text = ChatQueueProposalAccessibility.statusText(proposal) { TriageFeedbackPlayer.announce(message: text) }
        }
        .onChange(of: errorMessage) { _, message in
            if let message { TriageFeedbackPlayer.announce(message: message) }
        }
        .modifier(ProposalAccessibilityActions(proposal: proposal, isEnabled: proposal.status == .pending && !isBusy && !isRewording, onDecide: onDecide, onReword: onReword))
        .accessibilityIdentifier("chat-queue-proposal-\(proposal.index)")
    }

    private var tint: Color {
        switch proposal.status {
        case .pending: return offset > 0 ? .green : offset < 0 ? .red : .accentColor
        case .accepted: return .green
        case .rejected: return .red
        }
    }

    @ViewBuilder
    private var footer: some View {
        switch proposal.status {
        case .pending:
            HStack {
                Button("Accept") { onDecide(.accept) }
                    .buttonStyle(.borderedProminent)
                    .accessibilityIdentifier("chat-queue-proposal-accept-\(proposal.index)")

                Button("Reject", role: .destructive) { onDecide(.reject) }
                    .buttonStyle(.bordered)
                    .accessibilityIdentifier("chat-queue-proposal-reject-\(proposal.index)")

                if let onReword {
                    Button("Reword question", action: onReword)
                        .buttonStyle(.bordered)
                        .accessibilityIdentifier("chat-queue-proposal-reword-\(proposal.index)")
                }

                if isBusy || isRewording { ProgressView().controlSize(.small) }
            }
            .controlSize(.small)
            .disabled(isBusy || isRewording)

            Text("Swipe right to accept, left to reject")
                .zoomFont(.caption2)
                .foregroundStyle(.secondary)
                .accessibilityHidden(true)
        case .accepted:
            Text(proposal.kind == .update ? "Card updated" : "Card added to review")
                .zoomFont(.caption)
                .foregroundStyle(.green)
                .accessibilityIdentifier("chat-queue-proposal-accepted-\(proposal.index)")
        case .rejected:
            Text(canTellTutor ? "Rejected. Tell the tutor what to change." : "Rejected")
                .zoomFont(.caption)
                .foregroundStyle(.secondary)
                .accessibilityIdentifier("chat-queue-proposal-rejected-\(proposal.index)")
        }
    }

    private var drag: some Gesture {
        DragGesture(minimumDistance: FocusTriageSwipe.minimumDrag)
            .onChanged { value in
                guard !isBusy, ChatQueueProposalSwipe.isHorizontal(value.translation) else { return }

                offset = value.translation.width
            }
            .onEnded { value in
                defer { withAnimation(.spring(response: 0.35, dampingFraction: 0.75)) { offset = 0 } }

                guard !isBusy, ChatQueueProposalSwipe.isHorizontal(value.translation),
                      let decision = ChatQueueProposalSwipe.decision(
                          width: value.translation.width,
                          predictedWidth: value.predictedEndTranslation.width
                      )
                else { return }

                onDecide(decision)
            }
    }
}

private struct ProposalAccessibilityActions: ViewModifier {
    let proposal: ChatQueueProposal
    let isEnabled: Bool
    let onDecide: (ChatQueueProposalDecision) -> Void
    let onReword: (() -> Void)?

    func body(content: Content) -> some View {
        if isEnabled {
            content
                .accessibilityAction(named: ChatQueueProposalAccessibility.actionName("Accept", proposal)) { onDecide(.accept) }
                .accessibilityAction(named: ChatQueueProposalAccessibility.actionName("Reject", proposal)) { onDecide(.reject) }
                .accessibilityAction(named: ChatQueueProposalAccessibility.actionName("Reword question of", proposal)) { onReword?() }
        } else {
            content
        }
    }
}
