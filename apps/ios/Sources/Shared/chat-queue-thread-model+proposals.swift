import PostAnkiAPI
import SwiftUI

extension ChatQueueThreadModel {
    func isDeciding(_ line: ChatQueueLine, _ proposal: ChatQueueProposal) -> Bool {
        guard let seq = line.seq else { return false }

        return decidingProposals.contains(ChatQueueProposalKey(seq: seq, index: proposal.index))
    }

    func isRewording(_ line: ChatQueueLine, _ proposal: ChatQueueProposal) -> Bool {
        guard let seq = line.seq else { return false }

        return rewordingProposals.contains(ChatQueueProposalKey(seq: seq, index: proposal.index))
    }

    @discardableResult
    func reword(seq: Int, index: Int) async -> Bool {
        let key = ChatQueueProposalKey(seq: seq, index: index)

        guard !isResolving, !rewordingProposals.contains(key), !decidingProposals.contains(key),
              let lineIndex = lines.firstIndex(where: { $0.seq == seq }),
              lines[lineIndex].proposals.first(where: { $0.index == index })?.status == .pending
        else { return false }

        rewordingProposals.insert(key)
        proposalErrors[key] = nil
        defer { rewordingProposals.remove(key) }

        do {
            let reworded = try await APIClient.rewordChatQueueProposal(id: item.id, seq: seq, index: index)

            guard let current = lines.firstIndex(where: { $0.seq == seq }),
                  let position = lines[current].proposals.firstIndex(where: { $0.index == index })
            else { return false }

            lines[current].proposals[position] = reworded

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
                proposalErrors[key] = "Could not reword the question. Try again."
            }

            return false
        }
    }

    func proposalError(_ line: ChatQueueLine, _ proposal: ChatQueueProposal) -> String? {
        guard let seq = line.seq else { return nil }

        return proposalErrors[ChatQueueProposalKey(seq: seq, index: proposal.index)]
    }

    @discardableResult
    func decide(
        seq: Int,
        index: Int,
        decision: ChatQueueProposalDecision,
        feedback: String? = nil,
        announcesRejection: Bool = true
    ) async -> Bool {
        let key = ChatQueueProposalKey(seq: seq, index: index)

        guard !isFinished, !rewordingProposals.contains(key),
              let before = lines.first(where: { $0.seq == seq })?.proposals.first(where: { $0.index == index }),
              before.status == .pending
        else { return false }

        let itemBefore = item
        let status: ChatQueueProposalStatus = decision == .accept ? .accepted : .rejected

        update(key) { $0.status = status }

        if before.kind == .update, decision == .accept {
            item = item.updatingCard(front: before.front, back: before.back, example: before.example)
        }

        let itemApplied = item
        let id = item.id

        decidingProposals.insert(key)
        proposalErrors[key] = nil

        let sent = enqueueWrite { [self] in
            defer { decidingProposals.remove(key) }

            do {
                let result = try await APIClient.decideChatQueueProposal(id: id, seq: seq, index: index, decision: decision)

                update(key) {
                    $0.status = result.status
                    $0.savedCardId = result.savedCardId
                }

                return true
            } catch {
                await failedDecision(error, key: key, before: before, itemBefore: itemBefore, itemApplied: itemApplied)

                return false
            }
        }

        if decision == .reject, announcesRejection {
            let front = before.front

            rejectAnnouncement = Task { await announceRejection(seq: seq, index: index, front: front, feedback: feedback, after: sent) }
        }

        return true
    }

    private func failedDecision(
        _ error: Error,
        key: ChatQueueProposalKey,
        before: ChatQueueProposal,
        itemBefore: ChatQueueItem,
        itemApplied: ChatQueueItem
    ) async {
        let failure = ChatQueueFailure.failure(for: error)

        if failure == .notInChat || failure == .notFound {
            handle(failure)

            return
        }

        if item == itemApplied { item = itemBefore }

        if failure == .proposalNotPending {
            proposalErrors[key] = failure.message
            await load()

            return
        }

        update(key) {
            $0.status = before.status
            $0.savedCardId = before.savedCardId
        }

        if Self.isCancellation(error) { return }

        proposalErrors[key] = failure == .other ? "Could not save your choice. Try again." : failure.message
    }

    private func update(_ key: ChatQueueProposalKey, _ change: (inout ChatQueueProposal) -> Void) {
        guard let lineIndex = lines.firstIndex(where: { $0.seq == key.seq }),
              let position = lines[lineIndex].proposals.firstIndex(where: { $0.index == key.index })
        else { return }

        change(&lines[lineIndex].proposals[position])
    }

    private static func isCancellation(_ error: Error) -> Bool {
        error is CancellationError || (error as? URLError)?.code == .cancelled
    }
}
