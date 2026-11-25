import PostAnkiAPI
import SwiftUI

extension PendingReviewTriageModel {
    @discardableResult
    func sendToChat(prompt: String? = nil) async -> Bool {
        guard let bit = current, !isBusy, queued[bit.id] == nil, !sendingToChat.contains(bit.id) else { return false }

        let bitId = bit.id
        let successor = neighbour(of: bitId)
        let snapshot = list.snapshot(of: bitId)

        sendingToChat.insert(bitId)
        list.rowMessages[bitId] = nil
        list.notice = nil
        list.remove(bitId: bitId)
        list.counts.adjust(by: -1)
        ChatQueueCountStore.shared.adjust(by: 1)
        currentId = successor
        clearSelection(of: bitId)

        chatWrites.enqueue { [self] in
            defer { sendingToChat.remove(bitId) }

            do {
                try await APIClient.moveToChatQueue(id: bitId, prompt: prompt)
            } catch {
                ChatQueueCountStore.shared.adjust(by: -1)

                switch InboxMoveOutcome.outcome(for: error) {
                case .removedElsewhere:
                    list.counts.adjust(by: 1)
                    list.notice = "That item was already decided elsewhere, so it was removed."
                    Task { await list.counts.refresh() }
                case .kept:
                    list.rowMessages[bitId] = InboxMessages.message(for: error, doing: "send this to Chat")
                    list.notice = "A card couldn't be sent and is back in the queue."

                    if let snapshot { list.applyRestore(snapshot) } else { Task { await list.load() } }
                }
            }
        }

        return true
    }
}
