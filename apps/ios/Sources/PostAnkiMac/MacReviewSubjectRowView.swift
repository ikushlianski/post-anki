import SwiftUI

struct MacReviewSubjectsHeader: View {
    var body: some View {
        HStack {
            Text("Subject")
            Spacer()
            Text("New").frame(width: MacReviewCountColumns.width, alignment: .trailing)
            Text("Repeat").frame(width: MacReviewCountColumns.width, alignment: .trailing)
        }
        .accessibilityHidden(true)
    }
}

struct MacReviewCountColumns: View {
    static let width: CGFloat = 64

    let new: Int
    let repeatCount: Int

    var body: some View {
        HStack {
            Text("\(new)").frame(width: Self.width, alignment: .trailing)
            Text("\(repeatCount)").frame(width: Self.width, alignment: .trailing)
        }
        .monospacedDigit()
        .accessibilityHidden(true)
    }
}

struct MacReviewSubjectRowView: View {
    let item: ReviewSubjectRow
    let onToggle: () -> Void
    let onReview: () -> Void

    private var hasChildren: Bool { !item.row.node.children.isEmpty }

    var body: some View {
        HStack(spacing: 6) {
            if hasChildren {
                Button(action: onToggle) {
                    Image(systemName: item.row.isExpanded ? "chevron.down" : "chevron.right")
                        .frame(width: 20, height: 20)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.borderless)
                .accessibilityLabel("\(item.row.isExpanded ? "Collapse" : "Expand") \(item.entry.name)")
            } else {
                Color.clear.frame(width: 20, height: 20)
            }

            Button(action: onReview) {
                HStack {
                    Text(item.entry.name).lineLimit(2)
                    Spacer()
                    MacReviewCountColumns(new: item.newCount, repeatCount: item.repeatCount)
                }
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel(item.accessibilityText)
            .accessibilityHint("Starts a review of this subject and its sub-subjects")
        }
        .padding(.leading, CGFloat(item.row.depth) * 16)
        .opacity(item.hasNothingDue ? 0.5 : 1)
    }
}
