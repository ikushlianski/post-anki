import SwiftUI

struct SubjectTreeRowView: View {
    let row: SubjectTreeRow
    let onToggle: () -> Void

    private var hasChildren: Bool { !row.node.children.isEmpty }

    var body: some View {
        HStack(spacing: 8) {
            if hasChildren {
                Button(action: onToggle) {
                    Image(systemName: row.isExpanded ? "chevron.down" : "chevron.right")
                        .frame(width: 28, height: 36)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.borderless)
                .accessibilityLabel("\(row.isExpanded ? "Collapse" : "Expand") \(row.node.entry.name)")
            } else {
                Color.clear.frame(width: 28, height: 36)
            }

            label
        }
        .padding(.leading, CGFloat(row.depth) * 16)
    }

    private var label: some View {
        HStack(spacing: 8) {
            Text(row.node.entry.name)
                .font(.body)
                .lineLimit(2)
                .frame(maxWidth: .infinity, alignment: .leading)

            SubjectDepthBar(entry: row.node.entry)

            Text("\(row.node.entry.count)")
                .font(.subheadline)
                .monospacedDigit()
                .foregroundStyle(.secondary)
                .frame(minWidth: 28, alignment: .trailing)
        }
    }
}
