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
