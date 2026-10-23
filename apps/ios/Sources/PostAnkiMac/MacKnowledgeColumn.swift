import Foundation

enum MacKnowledgeColumn: CaseIterable, Identifiable {
    case question, answer, subject, state, due, lapses

    var id: Self { self }

    var title: String {
        switch self {
        case .question: "Question"
        case .answer: "Answer"
        case .subject: "Subject"
        case .state: "State"
        case .due: "Due"
        case .lapses: "Lapses"
        }
    }

    var idealWidth: CGFloat {
        switch self {
        case .question: 280
        case .answer: 220
        case .subject: 120
        case .state: 90
        case .due: 120
        case .lapses: 60
        }
    }

    func width(scale: Double) -> CGFloat { idealWidth * CGFloat(scale) }

    var keyPath: PartialKeyPath<MacKnowledgeTableRow> {
        switch self {
        case .question: \MacKnowledgeTableRow.question
        case .answer: \MacKnowledgeTableRow.answer
        case .subject: \MacKnowledgeTableRow.subjectName
        case .state: \MacKnowledgeTableRow.stateLabel
        case .due: \MacKnowledgeTableRow.dueKey
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
    static func height(scale: Double) -> CGFloat {
        (13 + 12) * CGFloat(scale)
    }
}
