import PostAnkiAPI
import SwiftUI

struct KnowledgeMeaningResults: View {
    let search: KnowledgeMeaningSearchModel
    let queryIsEmpty: Bool

    var body: some View {
        List {
            if let failure = search.failure {
                Text(failure).font(.caption).foregroundStyle(.red)
            }

            if let matches = search.matches {
                if matches.notReadyCount > 0 {
                    Text("\(CountLabel.text(matches.notReadyCount, "item")) \(matches.notReadyCount == 1 ? "isn't" : "aren't") searchable by meaning yet.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }

                if matches.capped {
                    Text("Showing the closest \(matches.items.count) matches.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }

                ForEach(matches.items) { match in
                    KnowledgeMeaningRow(match: match)
                }
            }
        }
        .overlay {
            if search.isLoading {
                ProgressView()
            } else if search.matches == nil && search.failure == nil {
                ContentUnavailableView(
                    "Search by meaning",
                    systemImage: "sparkle.magnifyingglass",
                    description: Text(queryIsEmpty ? "Type what you remember, then tap Search." : "Tap Search to find items with a similar meaning.")
                )
            } else if search.matches?.items.isEmpty == true {
                ContentUnavailableView("No similar items", systemImage: "tray")
            }
        }
    }
}

private struct KnowledgeMeaningRow: View {
    let match: KnowledgeMeaningMatch

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(CardKind.hideBlanks(match.question)).lineLimit(2)
            Text(match.answer).font(.subheadline).foregroundStyle(.secondary).lineLimit(2)

            HStack(spacing: 6) {
                Text("\(match.matchPercent)% match")
                    .font(.caption2)
                    .padding(.horizontal, 6)
                    .padding(.vertical, 2)
                    .background(.quaternary, in: Capsule())

                Text(match.originLabel)
            }
            .font(.caption)
            .foregroundStyle(.secondary)
        }
        .padding(.vertical, 2)
    }
}
