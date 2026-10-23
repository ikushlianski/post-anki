import Foundation

extension Notification.Name {
    static let pendingQueuesFlushed = Notification.Name("pendingQueuesFlushed")
}

enum PendingQueueFlusher {
    static func flushAll(
        grades: PendingGradeQueue = .shared,
        answers: PendingAnswerQueue = .shared
    ) async {
        await grades.flush()
        await answers.flush()

        await MainActor.run {
            NotificationCenter.default.post(name: .pendingQueuesFlushed, object: nil)
        }
    }
}
