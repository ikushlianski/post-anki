import PostAnkiAPI

extension ChatQueueThreadModel {
    func announceRejection(seq: Int, index: Int, front: String) async {
        let sent = await sendRejectMessage(seq: seq, index: index, front: front)

        if !sent {
            awaitsRejectExplanation = true
            composerFocusRequests += 1
        }
    }

    private func sendRejectMessage(seq: Int, index: Int, front: String) async -> Bool {
        let id = "reject:\(item.id):\(seq):\(index)"

        guard !limitReached, !budgetPaused, !isResolving, !isDeleting,
              rejectMessageIds.insert(id).inserted
        else { return false }

        let text = "I rejected your proposed card: \(front)."

        if isSending {
            guard followUps.enqueue(text, id: id) != nil else {
                rejectMessageIds.remove(id)

                return false
            }

            return true
        }

        isSending = true
        defer { isSending = false }

        let failure = await deliver(text, keepDraft: true, clientId: id)

        if failure != nil {
            rejectMessageIds.remove(id)
            appendFollowUpsToDraft()

            return false
        }

        await drainFollowUps()

        return true
    }
}
