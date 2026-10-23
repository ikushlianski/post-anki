import PostAnkiAPI
import SwiftUI

struct MilestoneRow: View {
    let milestone: Milestone

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(milestone.entityLabel ?? "Deleted course")
                .font(.headline)

            HStack {
                Label(milestone.kindLabel, systemImage: "trophy.fill")
                    .foregroundStyle(.yellow)

                if let when = DueReviewModel.nextDueText(milestone.achievedAt) {
                    Text(when)
                        .foregroundStyle(.secondary)
                }
            }
            .font(.caption)
        }
    }
}

struct DigestTile: View {
    let title: String
    let value: String?
    let detail: String?

    var body: some View {
        VStack(spacing: 2) {
            Text(value ?? "No data yet")
                .font(value == nil ? .caption : .title3.bold())
                .foregroundStyle(value == nil ? .secondary : .primary)

            Text(title)
                .font(.caption)
                .foregroundStyle(.secondary)

            if let detail {
                Text(detail)
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            }
        }
        .frame(maxWidth: .infinity)
    }
}

struct CoverageRow: View {
    let area: CoverageArea

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack {
                VStack(alignment: .leading) {
                    Text(area.name)

                    Text(area.subjectName)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }

                Spacer()

                Text("\(area.percent)%")
                    .font(.subheadline.monospacedDigit())
            }

            ProgressView(value: Double(min(max(area.percent, 0), 100)), total: 100)
                .tint(area.status == "gap" ? .orange : .accentColor)
        }
    }
}

struct ConcernRow: View {
    let concern: ConcernSummary

    var body: some View {
        HStack {
            Text(concern.label)

            Spacer()

            Text("\(concern.covered) / \(concern.total)")
                .foregroundStyle(.secondary)
                .monospacedDigit()
        }
    }
}

struct StatLine: View {
    let title: String
    let value: String

    var body: some View {
        HStack {
            Text(title)

            Spacer()

            Text(value)
                .foregroundStyle(.secondary)
        }
    }
}
