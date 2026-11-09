import PostAnkiAPI

extension ChatQueueItem {
    func updatingCard(front: String, back: String, example: String?) -> ChatQueueItem {
        ChatQueueItem(
            id: id,
            body: "\(front)\n\(back)",
            background: example ?? background,
            origin: origin,
            subjectId: subjectId,
            subjectName: subjectName,
            chatAt: chatAt,
            turnsLeft: turnsLeft,
            snoozedUntil: snoozedUntil,
            sourceTitle: sourceTitle,
            sourceUrl: sourceUrl,
            rejectReasonCodes: rejectReasonCodes,
            reviewChat: reviewChat
        )
    }
}
