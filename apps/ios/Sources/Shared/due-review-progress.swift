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
        guard let path = current?.subjectPath, !path.isEmpty else { return nil }

        return path
    }

    var groupAnnouncement: String? {
        guard let path = currentSubjectPath, let previous = previousSubjectPath, previous != path, !isRevealed else {
            return nil
        }

        let inGroup = ReviewSubjectGroups.cardsLeft(in: path, current: current, queue: queue)
        let overall = remainingCounts.map { $0.new + $0.learning + $0.review } ?? (1 + queue.count)

        return ReviewSubjectGroups.announcement(
            subjectPath: path,
            cardsInGroup: inGroup,
            remainingOverall: max(inGroup, overall)
        )
    }
}
