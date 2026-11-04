enum ReviewSubjectCountsText {
    static func accessibilityLabel(name: String, new: Int, repeatCount: Int) -> String {
        "\(name), \(new) new, \(repeatCount) to repeat"
    }

    static func isEmpty(new: Int, repeatCount: Int) -> Bool {
        new == 0 && repeatCount == 0
    }
}

extension ReviewSubjectRow {
    var repeatCount: Int { dueCount }

    var hasNothingDue: Bool { ReviewSubjectCountsText.isEmpty(new: newCount, repeatCount: repeatCount) }

    var accessibilityText: String {
        ReviewSubjectCountsText.accessibilityLabel(name: entry.name, new: newCount, repeatCount: repeatCount)
    }
}
