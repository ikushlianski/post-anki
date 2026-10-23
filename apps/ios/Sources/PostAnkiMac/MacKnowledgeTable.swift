import PostAnkiAPI
import SwiftUI

struct MacKnowledgeTableRow: Identifiable, Hashable {
    let item: KnowledgeOverviewItem
    let subjectName: String

    var id: String { item.id }
    var question: String { item.question }
    var answer: String { item.answer }
    var stateLabel: String { item.stateLabel }
    var lapses: Int { item.lapses }
    var dueKey: String { item.dueAt ?? "" }
    var dueText: String { item.dueAt.flatMap { DueReviewModel.nextDueText($0) } ?? "" }
}

struct MacKnowledgeTable: View {
    @Environment(\.zoomScale) private var zoomScale

    private var zoom: CGFloat { CGFloat(zoomScale) }

    let rows: [MacKnowledgeTableRow]
    @Binding var selection: Set<String>
    let onAppearRow: (KnowledgeOverviewItem) -> Void
    let onOpen: (KnowledgeOverviewItem) -> Void
    let contextMenu: (Set<String>) -> AnyView

    @State private var sortOrder: [KeyPathComparator<MacKnowledgeTableRow>] = []

    private var sortedRows: [MacKnowledgeTableRow] {
        sortOrder.isEmpty ? rows : rows.sorted(using: sortOrder)
    }

    var body: some View {
        Table(sortedRows, selection: $selection, sortOrder: $sortOrder) {
            TableColumn("Question", value: \.question) { row in
                Text(row.question)
                    .lineLimit(2)
                    .task { onAppearRow(row.item) }
            }
            .width(min: 160 * zoom, ideal: 280 * zoom)

            TableColumn("Answer", value: \.answer) { row in
                Text(row.answer).lineLimit(2).foregroundStyle(.secondary)
            }
            .width(min: 120 * zoom, ideal: 220 * zoom)

            TableColumn("Subject", value: \.subjectName) { row in
                Text(row.subjectName)
            }
            .width(min: 80 * zoom, ideal: 120 * zoom)

            TableColumn("State", value: \.stateLabel) { row in
                Text(row.stateLabel)
            }
            .width(min: 70 * zoom, ideal: 90 * zoom)

            TableColumn("Due", value: \.dueKey) { row in
                Text(row.dueText)
            }
            .width(min: 80 * zoom, ideal: 120 * zoom)

            TableColumn("Lapses", value: \.lapses) { row in
                Text("\(row.lapses)")
            }
            .width(min: 50 * zoom, ideal: 60 * zoom)
        }
        .contextMenu(forSelectionType: String.self, menu: contextMenu) { ids in
            if let id = ids.first, let row = rows.first(where: { $0.id == id }) {
                onOpen(row.item)
            }
        }
        .onKeyPress(.return) {
            guard selection.count == 1, let row = rows.first(where: { selection.contains($0.id) }) else {
                return .ignored
            }

            onOpen(row.item)

            return .handled
        }
    }
}
