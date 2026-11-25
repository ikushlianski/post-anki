import Foundation

extension ChatQueueItem {
    public func withSnoozedUntil(_ date: Date?) -> ChatQueueItem {
        ChatQueueItem(
            id: id,
            body: body,
            background: background,
            origin: origin,
            subjectId: subjectId,
            subjectName: subjectName,
            chatAt: chatAt,
            turnsLeft: turnsLeft,
            snoozedUntil: date,
            sourceTitle: sourceTitle,
            sourceUrl: sourceUrl,
            rejectReasonCodes: rejectReasonCodes,
            reviewChat: reviewChat
        )
    }
}
