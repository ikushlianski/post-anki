import PostAnkiAPI
import SwiftUI

struct MacKnowledgeTableRow: Identifiable, Hashable {
    let item: KnowledgeOverviewItem
    let subjectName: String

    static let noDueText = "-"

    var id: String { item.id }
    var question: String { item.question }
    var answer: String { item.answer }
    var stateLabel: String { item.stateLabel }
    var lapses: Int { item.lapses }
    var dueKey: String { item.dueAt ?? "" }
    var createdKey: String { item.createdAt ?? "" }
    var createdText: String { item.createdAt.flatMap(MacKnowledgeTableRow.localDateTime) ?? MacKnowledgeTableRow.noDueText }
    var dueText: String { item.dueAt.flatMap { DueReviewModel.nextDueText($0) } ?? MacKnowledgeTableRow.noDueText }

    static func localDateTime(_ iso: String) -> String? {
        let fractional = ISO8601DateFormatter()
        fractional.formatOptions = [.withInternetDateTime, .withFractionalSeconds]

        guard let date = fractional.date(from: iso) ?? ISO8601DateFormatter().date(from: iso) else { return nil }

        return date.formatted(date: .abbreviated, time: .shortened)
    }
}

struct MacKnowledgeTable: View {
    @Environment(\.zoomScale) private var zoomScale

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
        GeometryReader { proxy in
            let widths = MacKnowledgeHeaderMetrics.columnWidths(scale: zoomScale, available: proxy.size.width)

            VStack(spacing: 0) {
                if MacKnowledgeHeaderSupport.isCustom {
                    MacKnowledgeTableHeader(widths: widths, sortOrder: $sortOrder)
                }

                table(widths)
                    .id(MacKnowledgeHeaderMetrics.layoutKey(width: proxy.size.width, scale: zoomScale))
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            }
            .frame(width: proxy.size.width, height: proxy.size.height, alignment: .topLeading)
        }
    }

    private func table(_ widths: [MacKnowledgeColumn: CGFloat]) -> some View {
        func width(_ column: MacKnowledgeColumn) -> CGFloat { widths[column] ?? column.width(scale: zoomScale) }

        return Table(sortedRows, selection: $selection, sortOrder: $sortOrder) {
            TableColumn("Question", value: \.question) { row in
                Text(row.question)
                    .lineLimit(1)
                    .help(row.question)
                    .task { onAppearRow(row.item) }
            }
            .width(width(.question))

            TableColumn("Answer", value: \.answer) { row in
                Text(row.answer).lineLimit(1).foregroundStyle(.secondary).help(row.answer)
            }
            .width(width(.answer))

            TableColumn("Subject", value: \.subjectName) { row in
                Text(row.subjectName).lineLimit(1)
            }
            .width(width(.subject))

            TableColumn("State", value: \.stateLabel) { row in
                Text(row.stateLabel).lineLimit(1)
            }
            .width(width(.state))

            TableColumn("Due", value: \.dueKey) { row in
                Text(row.dueText).lineLimit(1)
            }
            .width(width(.due))

            TableColumn("Created", value: \.createdKey) { row in
                Text(row.createdText).lineLimit(1)
            }
            .width(width(.created))

            TableColumn("Lapses", value: \.lapses) { row in
                Text("\(row.lapses)")
            }
            .width(width(.lapses))
        }
        .macKnowledgeNativeHeaderHidden()
        .zoomFont(.body)
        .contextMenu(forSelectionType: String.self, menu: contextMenu) { ids in
            if let id = ids.first, let row = rows.first(where: { $0.id == id }) {
                onOpen(row.item)
            }
        }
        .onEnterKeyPress { _ in
            guard selection.count == 1, let row = rows.first(where: { selection.contains($0.id) }) else {
                return .ignored
            }

            onOpen(row.item)

            return .handled
        }
    }
}
