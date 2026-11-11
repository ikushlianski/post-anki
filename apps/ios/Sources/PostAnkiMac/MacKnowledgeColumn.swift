import Foundation

enum MacKnowledgeColumn: CaseIterable, Identifiable {
    case question, answer, subject, state, due, created, lapses

    var id: Self { self }

    var title: String {
        switch self {
        case .question: "Question"
        case .answer: "Answer"
        case .subject: "Subject"
        case .state: "State"
        case .due: "Due"
        case .created: "Created"
        case .lapses: "Lapses"
        }
    }

    var baseWidth: CGFloat {
        switch self {
        case .question: 280
        case .answer: 220
        case .subject: 110
        case .state: 60
        case .due: 90
        case .created: 120
        case .lapses: 50
        }
    }

    var isFlexible: Bool { self == .question || self == .answer }

    var minWidth: CGFloat { self == .question ? 120 : 100 }

    func width(scale: Double) -> CGFloat { baseWidth * CGFloat(scale) }

    var keyPath: PartialKeyPath<MacKnowledgeTableRow> {
        switch self {
        case .question: \MacKnowledgeTableRow.question
        case .answer: \MacKnowledgeTableRow.answer
        case .subject: \MacKnowledgeTableRow.subjectName
        case .state: \MacKnowledgeTableRow.stateLabel
        case .due: \MacKnowledgeTableRow.dueKey
        case .created: \MacKnowledgeTableRow.createdKey
        case .lapses: \MacKnowledgeTableRow.lapses
        }
    }

    func comparator(_ order: SortOrder) -> KeyPathComparator<MacKnowledgeTableRow> {
        switch self {
        case .question: KeyPathComparator(\.question, order: order)
        case .answer: KeyPathComparator(\.answer, order: order)
        case .subject: KeyPathComparator(\.subjectName, order: order)
        case .state: KeyPathComparator(\.stateLabel, order: order)
        case .due: KeyPathComparator(\.dueKey, order: order)
        case .created: KeyPathComparator(\.createdKey, order: order)
        case .lapses: KeyPathComparator(\.lapses, order: order)
        }
    }

    func direction(in sortOrder: [KeyPathComparator<MacKnowledgeTableRow>]) -> SortOrder? {
        guard let first = sortOrder.first, (first.keyPath as AnyKeyPath) == (keyPath as AnyKeyPath) else { return nil }

        return first.order
    }

    func nextSortOrder(from sortOrder: [KeyPathComparator<MacKnowledgeTableRow>]) -> [KeyPathComparator<MacKnowledgeTableRow>] {
        [comparator(direction(in: sortOrder) == .forward ? .reverse : .forward)]
    }
}

enum MacKnowledgeHeaderMetrics {
    /// AppKit table spacing between columns; not affected by app zoom.
    static let intercellSpacing: CGFloat = 17

    /// Text inset inside a table cell, so titles line up with cell text.
    static let cellTextInset: CGFloat = 4

    static var leadingInset: CGFloat { intercellSpacing / 2 + cellTextInset }

    static let slack: CGFloat = 32

    static func layoutKey(width: CGFloat, scale: Double) -> String {
        "\(Int(width / 8))-\(scale)"
    }

    static func height(scale: Double) -> CGFloat { (13 + 12) * CGFloat(scale) }

    static func columnWidths(scale: Double, available: CGFloat) -> [MacKnowledgeColumn: CGFloat] {
        let columns = MacKnowledgeColumn.allCases
        let zoom = CGFloat(scale)
        let fixed = columns.filter { !$0.isFlexible }.reduce(0) { $0 + $1.width(scale: scale) }
        let chrome = intercellSpacing * CGFloat(columns.count - 1) + leadingInset * 2 + slack
        let flexible = columns.filter(\.isFlexible)
        let pool = max(0, available - fixed - chrome)
        let baseTotal = flexible.reduce(0) { $0 + $1.baseWidth }
        var widths: [MacKnowledgeColumn: CGFloat] = [:]

        for column in columns {
            if column.isFlexible {
                widths[column] = max(column.minWidth * zoom, (pool * column.baseWidth / baseTotal).rounded(.down))
            } else {
                widths[column] = column.width(scale: scale)
            }
        }

        return widths
    }
}
