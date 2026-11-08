import PostAnkiAPI
import SwiftUI

extension ChatQueueThreadModel {
    var queuedFollowUps: [ChatQueueFollowUp] { followUps.waiting }

    var sendPlaceholder: String {
        if isSending && followUps.isFull { return "Queue full, wait for the reply" }

        if awaitsRejectExplanation { return "What is wrong with it?" }

        return isSending ? "Queue a follow-up" : "Ask about this card"
    }

    func cancelFollowUp(_ id: String) async {
        followUps.cancel(id: id)

        if !isSending { await resumeFollowUps() }
    }

    func retryFollowUp(_ id: String) async {
        guard !isSending, followUps.retryFailed(id: id) else { return }

        await resumeFollowUps()
    }

    func drainFollowUps() async {
        while let next = followUps.beginNext() {
            let failure = await deliver(next.text, keepDraft: true, clientId: next.id)

            guard let failure else {
                followUps.complete(id: next.id)

                continue
            }

            if failure.stopsFollowUps {
                followUps.complete(id: next.id)
                returnFollowUpsToDraft(leading: [next.text])
            } else {
                followUps.fail(id: next.id)
            }

            return
        }
    }

    func returnFollowUpsToDraft(leading: [String] = []) {
        let texts = leading + followUps.drainTexts()

        guard !texts.isEmpty else { return }

        let restored = texts.joined(separator: "\n\n")
        let typed = draft.trimmingCharacters(in: .whitespacesAndNewlines)

        draft = typed.isEmpty ? restored : "\(restored)\n\n\(draft)"
    }

    func appendFollowUpsToDraft() {
        let texts = followUps.drainTexts()

        guard !texts.isEmpty else { return }

        let restored = texts.joined(separator: "\n\n")
        let typed = draft.trimmingCharacters(in: .whitespacesAndNewlines)

        draft = typed.isEmpty ? restored : "\(draft)\n\n\(restored)"
    }

    private func resumeFollowUps() async {
        guard !isResolving, !isDeleting, !isSending else { return }

        isSending = true
        defer { isSending = false }

        await drainFollowUps()
    }
}

extension ChatQueueFailure {
    var stopsFollowUps: Bool {
        switch self {
        case .capReached, .budgetPaused, .notInChat, .notFound, .modelFailed: true
        default: false
        }
    }
}
