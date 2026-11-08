enum ReviewSubjectCountsText {
    static func accessibilityLabel(name: String, mature: Int, learning: Int, new: Int, today: Int) -> String {
        "\(name), \(mature) mature, \(learning) learning, \(new) new, \(today) today"
    }

    static func isEmpty(today: Int) -> Bool {
        today == 0
    }
}

extension ReviewSubjectRow {
    var hasNothingDue: Bool { ReviewSubjectCountsText.isEmpty(today: todayCount) }

    var accessibilityText: String {
        ReviewSubjectCountsText.accessibilityLabel(
            name: entry.name,
            mature: maturity.mature,
            learning: maturity.learning,
            new: maturity.new,
            today: todayCount
        )
    }
}
