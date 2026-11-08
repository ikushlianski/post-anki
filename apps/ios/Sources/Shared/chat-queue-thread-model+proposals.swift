import PostAnkiAPI
import SwiftUI

extension ChatQueueThreadModel {
    func isDeciding(_ line: ChatQueueLine, _ proposal: ChatQueueProposal) -> Bool {
        guard let seq = line.seq else { return false }

        return decidingProposals.contains(ChatQueueProposalKey(seq: seq, index: proposal.index))
    }

    func proposalError(_ line: ChatQueueLine, _ proposal: ChatQueueProposal) -> String? {
        guard let seq = line.seq else { return nil }

        return proposalErrors[ChatQueueProposalKey(seq: seq, index: proposal.index)]
    }

    @discardableResult
    func decide(
        seq: Int,
        index: Int,
        decision: ChatQueueProposalDecision
    ) async -> Bool {
        let key = ChatQueueProposalKey(seq: seq, index: index)

        guard !isResolving, !decidingProposals.contains(key),
              let lineIndex = lines.firstIndex(where: { $0.seq == seq }),
              lines[lineIndex].proposals.first(where: { $0.index == index })?.status == .pending
        else { return false }

        decidingProposals.insert(key)
        proposalErrors[key] = nil
        defer { decidingProposals.remove(key) }

        do {
            let result = try await APIClient.decideChatQueueProposal(id: item.id, seq: seq, index: index, decision: decision)

            applyDecision(result, key: key)

            if decision == .reject {
                awaitsRejectExplanation = true
                composerFocusRequests += 1
            }

            return true
        } catch is CancellationError {
            return false
        } catch {
            let failure = ChatQueueFailure.failure(for: error)

            switch failure {
            case .notInChat, .notFound:
                handle(failure)
            case .proposalNotPending:
                proposalErrors[key] = failure.message
                await load()
            default:
                proposalErrors[key] = failure == .other ? "Could not save your choice. Try again." : failure.message
            }

            return false
        }
    }

    private func applyDecision(_ result: ChatQueueProposalDecisionResult, key: ChatQueueProposalKey) {
        guard let lineIndex = lines.firstIndex(where: { $0.seq == key.seq }),
              let proposalIndex = lines[lineIndex].proposals.firstIndex(where: { $0.index == key.index })
        else { return }

        lines[lineIndex].proposals[proposalIndex].status = result.status
        lines[lineIndex].proposals[proposalIndex].savedCardId = result.savedCardId

        let proposal = lines[lineIndex].proposals[proposalIndex]

        if proposal.kind == .update, result.status == .accepted {
            item = item.updatingCard(front: proposal.front, back: proposal.back, example: proposal.example)
        }
    }
}
