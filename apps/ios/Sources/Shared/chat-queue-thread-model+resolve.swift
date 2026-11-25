import PostAnkiAPI
import SwiftUI

extension ChatQueueThreadModel {
    @discardableResult
    func enqueueWrite(_ work: @escaping @MainActor () async -> Bool) -> Task<Bool, Never> {
        let previous = writeTail
        let task = Task { @MainActor in
            await previous?.value

            return await work()
        }

        writeTail = Task { _ = await task.value }

        return task
    }

    func settleWrites() async {
        while let tail = writeTail {
            await tail.value

            if writeTail == tail { break }
        }
    }

    func accept() async {
        let id = item.id

        leave(removing: true) { try await APIClient.approveKnowledgeBit(id: id) }
    }

    func clearChat() async {
        let id = item.id

        leave(removing: true) { try await APIClient.returnFromChatQueue(id: id) }
    }

    func cancelChat() async {
        let id = item.id

        leave(removing: true) { try await APIClient.cancelChatQueueThread(id: id) }
    }

    func backToTriage() async {
        let id = item.id

        guard leave(removing: true, { try await APIClient.returnFromChatQueue(id: id) }) else { return }

        TriageFeedbackPlayer.announce(.movedToInbox)
    }

    func snooze(days: Int) async {
        let id = item.id

        wasSnoozed = true

        guard leave(removing: false, { _ = try await APIClient.snoozeChatQueue(id: id, days: days) }) else {
            wasSnoozed = false

            return
        }

        TriageFeedbackPlayer.announce(.snoozed(days: days))
    }

    func reject() async {
        guard !isFinished, !isSending, rejectFeedback == nil else { return }

        let id = item.id

        errorMessage = nil
        rejectFeedbackId = nil
        rejectFeedback = PendingRejectFeedback(feedbackId: "pending-\(id)", bitBody: item.body, reasonCodes: item.rejectReasonCodes)
        drafts.clear(cardId: id)
        counts.adjust(by: -1)

        enqueueWrite { [self] in
            do {
                let feedbackId = try await APIClient.rejectKnowledgeBit(id: id)

                if let feedbackId {
                    rejectFeedbackId = feedbackId
                } else {
                    rejectFeedback = nil
                    isFinished = true
                }

                return true
            } catch {
                rollBackLeaving(error, countWasAdjusted: true)

                return false
            }
        }
    }

    func sendRejectReason(_ reason: String, note: String) async -> String? {
        guard rejectFeedback != nil, let feedbackId = rejectFeedbackId else { return nil }

        let trimmed = note.trimmingCharacters(in: .whitespacesAndNewlines)

        do {
            try await APIClient.setRejectFeedback(
                id: feedbackId,
                reasonCode: reason,
                note: trimmed.isEmpty ? nil : trimmed
            )
            rejectFeedback = nil
            rejectFeedbackId = nil
            isFinished = true

            return nil
        } catch {
            return "Couldn't save the reason. Try again or skip."
        }
    }

    func skipRejectReason() {
        rejectFeedback = nil
        isFinished = true
    }

    func finish(removing: Bool) {
        if removing, tracksQueue {
            counts.adjust(by: -1)
            drafts.clear(cardId: item.id)
        }

        isFinished = true
    }

    @discardableResult
    private func leave(removing: Bool, _ request: @escaping @MainActor () async throws -> Void) -> Bool {
        guard !isFinished, !isSending, rejectFeedback == nil else { return false }

        errorMessage = nil
        finish(removing: removing)

        let countWasAdjusted = removing && tracksQueue

        enqueueWrite { [self] in
            do {
                try await request()

                return true
            } catch {
                rollBackLeaving(error, countWasAdjusted: countWasAdjusted)

                return false
            }
        }

        return true
    }

    private func rollBackLeaving(_ error: Error, countWasAdjusted: Bool) {
        let failure = ChatQueueFailure.failure(for: error)
        let id = item.id

        if failure == .notInChat || failure == .notFound {
            if !countWasAdjusted, tracksQueue { counts.adjust(by: -1) }

            rejectFeedback = nil
            isFinished = true
            errorMessage = failure.message
            onRolledBack?(id, failure.message)

            return
        }

        let message = "\(failure.message) The card is back in the chat queue."

        if countWasAdjusted { counts.adjust(by: 1) }

        drafts.save(draft, cardId: id)
        rejectFeedback = nil
        rejectFeedbackId = nil
        wasSnoozed = false
        isFinished = false
        errorMessage = message
        onRolledBack?(id, message)
    }
}
