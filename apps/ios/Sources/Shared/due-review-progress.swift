extension DueReviewModel {
    var progressLabel: String? {
        guard current != nil else { return nil }

        let position = reviewedCount + 1
        let remaining = remainingCounts.map { $0.new + $0.learning + $0.review } ?? (1 + queue.count)
        let total = max(position, reviewedCount + remaining)

        return "\(position) of \(total)"
    }

    var subjectName: String? {
        guard case .subject(_, let name) = scope, !name.isEmpty else { return nil }

        return name
    }
}

extension DueReviewModel {
    var currentSubjectPath: String? {
        guard scope == nil, let path = current?.subjectPath, !path.isEmpty else { return nil }

        return path
    }

    var groupAnnouncement: String? {
        guard scope == nil else { return nil }

        let overall = remainingCounts.map { $0.new + $0.learning + $0.review } ?? (1 + queue.count)

        return ReviewSubjectGroups.nextAnnouncement(
            current: current,
            queue: queue,
            remainingAfterCurrent: max(queue.count, overall - 1)
        )
    }
}
