import PostAnkiAPI

extension ChatQueueThreadModel {
    func announceRejection(seq: Int, index: Int, front: String, feedback: String? = nil, after gate: Task<Bool, Never>? = nil) async {
        let alreadyHandled = rejectMessageIds.contains("reject:\(item.id):\(seq):\(index)")
        let sent = await sendRejectMessage(seq: seq, index: index, front: front, feedback: feedback, after: gate)

        if !sent {
            if let gate, await !gate.value { return }

            if !alreadyHandled {
                keepInDraft(ChatQueueProposalRejectFeedback.message(front: front, feedback: feedback))
            }

            awaitsRejectExplanation = true
            composerFocusRequests += 1
        }
    }

    private func sendRejectMessage(seq: Int, index: Int, front: String, feedback: String?, after gate: Task<Bool, Never>?) async -> Bool {
        let id = "reject:\(item.id):\(seq):\(index)"

        guard !limitReached, !budgetPaused, !isResolving, !isDeleting, !isFinished,
              rejectMessageIds.insert(id).inserted
        else { return false }

        let text = ChatQueueProposalRejectFeedback.message(front: front, feedback: feedback)

        if isSending {
            guard followUps.enqueue(text, id: id) != nil else {
                rejectMessageIds.remove(id)

                return false
            }

            return true
        }

        isSending = true
        defer { isSending = false }

        let failure = await deliver(text, keepDraft: true, clientId: id, after: gate)

        if failure != nil {
            rejectMessageIds.remove(id)
            appendFollowUpsToDraft()

            return false
        }

        await drainFollowUps()

        return true
    }

    private func keepInDraft(_ text: String) {
        let typed = draft.trimmingCharacters(in: .whitespacesAndNewlines)

        draft = typed.isEmpty ? text : "\(draft)\n\n\(text)"
    }
}
