import PostAnkiAPI
import SwiftUI

struct ChatQueueProposalRows: View {
    let model: ChatQueueThreadModel
    let line: ChatQueueLine

    var body: some View {
        if let seq = line.seq {
            ForEach(line.proposals) { proposal in
                ChatQueueProposalCard(
                    proposal: proposal,
                    isBusy: model.isDeciding(line, proposal) || model.isResolving,
                    errorMessage: model.proposalError(line, proposal),
                    canTellTutor: !model.limitReached && !model.budgetPaused,
                    isRewording: model.isRewording(line, proposal),
                    onReword: {
                        Task { await model.reword(seq: seq, index: proposal.index) }
                    },
                    onDecide: { decision in
                        Task { await model.decide(seq: seq, index: proposal.index, decision: decision) }
                    }
                )
            }
        }
    }
}

struct ChatQueueMakeCardButton: View {
    let model: ChatQueueThreadModel

    var body: some View {
        Button("Make a card", systemImage: "plus.rectangle.on.rectangle") { Task { await model.makeCard() } }
            .buttonStyle(.bordered)
            .controlSize(.small)
            .disabled(model.isSending || model.isResolving)
            .accessibilityIdentifier("chat-queue-make-card")
    }
}
