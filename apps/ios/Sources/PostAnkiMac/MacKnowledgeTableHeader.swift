import SwiftUI

struct MacKnowledgeTableHeader: View {
    @Environment(\.zoomScale) private var zoomScale
    @Binding var sortOrder: [KeyPathComparator<MacKnowledgeTableRow>]

    var body: some View {
        HStack(spacing: 0) {
            ForEach(MacKnowledgeColumn.allCases) { column in
                Button {
                    sortOrder = column.nextSortOrder(from: sortOrder)
                } label: {
                    HStack(spacing: 4 * CGFloat(zoomScale)) {
                        Text(column.title).lineLimit(1)

                        if let direction = column.direction(in: sortOrder) {
                            Image(systemName: direction == .forward ? "chevron.up" : "chevron.down")
                        }

                        Spacer(minLength: 0)
                    }
                    .padding(.horizontal, 8 * CGFloat(zoomScale))
                    .frame(width: column.width(scale: zoomScale), alignment: .leading)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel(column.title)
            }

            Spacer(minLength: 0)
        }
        .zoomFont(.body.weight(.semibold))
        .frame(height: MacKnowledgeHeaderMetrics.height(scale: zoomScale))
        .background(.bar)
    }
}

extension View {
    @ViewBuilder
    func macKnowledgeNativeHeaderHidden() -> some View {
        if #available(macOS 14.4, *) {
            tableColumnHeaders(.hidden)
        } else {
            self
        }
    }
}
