import PostAnkiAPI
import SwiftUI

extension PendingReviewTriageModel {
    @discardableResult
    func sendToChat(prompt: String? = nil) async -> Bool {
        guard let bit = current, !isBusy, queued[bit.id] == nil else { return false }

        let bitId = bit.id
        let successor = neighbour(of: bitId)

        list.inFlight.insert(bitId)
        list.rowMessages[bitId] = nil
        list.notice = nil
        defer { list.inFlight.remove(bitId) }

        do {
            try await APIClient.moveToChatQueue(id: bitId, prompt: prompt)
            list.remove(bitId: bitId)
            list.counts.adjust(by: -1)
            ChatQueueCountStore.shared.adjust(by: 1)
            currentId = successor
            clearSelection(of: bitId)

            return true
        } catch {
            switch InboxMoveOutcome.outcome(for: error) {
            case .removedElsewhere:
                list.remove(bitId: bitId)
                currentId = successor
                clearSelection(of: bitId)
                list.notice = "That item was already decided elsewhere, so it was removed."
                Task { await list.counts.refresh() }
            case .kept:
                list.rowMessages[bitId] = InboxMessages.message(for: error, doing: "send this to Chat")
            }

            return false
        }
    }
}
