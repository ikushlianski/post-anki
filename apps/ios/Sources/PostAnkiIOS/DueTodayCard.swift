import PostAnkiAPI
import SwiftUI

struct DueTodayRow: View {
    let model: DueTodayModel

    var body: some View {
        NavigationLink {
            DueReviewScreen()
        } label: {
            HStack {
                VStack(alignment: .leading, spacing: 4) {
                    Text("Due today")
                        .font(.headline)

                    subtitle
                }

                Spacer()

                trailing
            }
        }
        .task { await model.load() }
    }

    @ViewBuilder
    private var trailing: some View {
        if let total = model.total {
            if total == 0 {
                Image(systemName: "checkmark.circle")
                    .foregroundStyle(.secondary)
            } else {
                Text("\(total)")
                    .font(.title2.bold())
            }
        } else if model.state == .loading {
            ProgressView()
        }
    }

    @ViewBuilder
    private var subtitle: some View {
        if let counts = model.counts {
            Text(breakdown(counts))
                .font(.subheadline)
                .foregroundStyle(.secondary)
        } else if case .failed(let failure) = model.state {
            Text(message(for: failure))
                .font(.subheadline)
                .foregroundStyle(.secondary)
        }
    }

    private func breakdown(_ counts: ReviewCounts) -> String {
        var parts: [String] = []

        if counts.review > 0 { parts.append("\(counts.review) review") }
        if counts.learning > 0 { parts.append("\(counts.learning) learning") }
        if counts.new > 0 { parts.append("\(counts.new) new") }

        return parts.isEmpty ? "Nothing due today" : parts.joined(separator: ", ")
    }

    private func message(for failure: DueTodayFailure) -> String {
        switch failure {
        case .offline: "Can't check offline"
        case .unauthorized: "Add your access token in Settings"
        case .other: "Couldn't load due reviews"
        }
    }
}
