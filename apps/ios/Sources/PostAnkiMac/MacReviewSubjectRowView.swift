import SwiftUI

struct MacReviewSubjectsHeader: View {
    var body: some View {
        HStack {
            Text("Subject")
            Spacer()
            Text("Mature").foregroundStyle(CardMaturityPalette.mature).frame(width: MacReviewCountColumns.width, alignment: .trailing)
            Text("Learning").foregroundStyle(CardMaturityPalette.learning).frame(width: MacReviewCountColumns.width, alignment: .trailing)
            Text("New").foregroundStyle(CardMaturityPalette.new).frame(width: MacReviewCountColumns.width, alignment: .trailing)
            Text("Today").fontWeight(.semibold).frame(width: MacReviewCountColumns.width, alignment: .trailing)
        }
        .accessibilityHidden(true)
    }
}

struct MacReviewCountColumns: View {
    static let width: CGFloat = 64

    let mature: Int
    let learning: Int
    let new: Int
    let today: Int

    var body: some View {
        HStack {
            Text("\(mature)").foregroundStyle(CardMaturityPalette.count(CardMaturityPalette.mature, mature)).frame(width: Self.width, alignment: .trailing)
            Text("\(learning)").foregroundStyle(CardMaturityPalette.count(CardMaturityPalette.learning, learning)).frame(width: Self.width, alignment: .trailing)
            Text("\(new)").foregroundStyle(CardMaturityPalette.count(CardMaturityPalette.new, new)).frame(width: Self.width, alignment: .trailing)
            Text("\(today)").fontWeight(.semibold).frame(width: Self.width, alignment: .trailing)
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
                    MacReviewCountColumns(
                        mature: item.maturity.mature,
                        learning: item.maturity.learning,
                        new: item.maturity.new,
                        today: item.todayCount
                    )
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
