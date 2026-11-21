import PostAnkiAPI

enum ReviewSubjectGroups {
    static func nextAnnouncement(current: ReviewCard?, queue: [ReviewCard], remainingAfterCurrent: Int) -> String? {
        guard let current, let next = queue.first else { return nil }
        guard let path = next.subjectPath, !path.isEmpty, path != current.subjectPath else { return nil }

        return "Next: \(path) · \(remainingAfterCurrent) left"
    }
}
