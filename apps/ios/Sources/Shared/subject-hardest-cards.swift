import PostAnkiAPI
import SwiftUI

enum SubjectHardestCards {
    static func rank(_ cards: [KnowledgeOverviewItem], limit: Int = 5) -> [KnowledgeOverviewItem] {
        let struggling = cards.filter { $0.lapses > 0 && $0.state != "suspended" }
        let sorted = struggling.sorted {
            $0.lapses != $1.lapses ? $0.lapses > $1.lapses : $0.question < $1.question
        }

        return Array(sorted.prefix(limit))
    }

    static func countText(cards: [KnowledgeOverviewItem], hasMore: Bool) -> String {
        hasMore ? "\(cards.count)+" : String(cards.count)
    }
}

@Observable
@MainActor
final class SubjectGapCloseModel {
    var selectedId: String?
    var isBusy = false
    var requestedIds: Set<String> = []
    var errorMessage: String?

    func effectiveId(in hardest: [KnowledgeOverviewItem]) -> String? {
        if let selectedId, hardest.contains(where: { $0.id == selectedId }) { return selectedId }

        return hardest.first?.id
    }

    func closeGap(for bitId: String) async {
        guard !isBusy, !requestedIds.contains(bitId) else { return }

        isBusy = true
        errorMessage = nil
        defer { isBusy = false }

        do {
            _ = try await APIClient.generateMoreVariants(bitId: bitId)
            requestedIds.insert(bitId)
        } catch {
            errorMessage = StudyToolsError.message(for: error, notFound: "This item no longer exists.")
        }
    }
}

struct SubjectStatsHeader: View {
    let countText: String
    let hardestCount: Int

    var body: some View {
        Section {
            LabeledContent("Cards", value: countText)
            LabeledContent("Cards you struggle with", value: String(hardestCount))
        }
    }
}

struct SubjectHardestSection: View {
    let hardest: [KnowledgeOverviewItem]
    let model: SubjectGapCloseModel

    var body: some View {
        if !hardest.isEmpty {
            let selected = model.effectiveId(in: hardest)

            Section("Hardest cards") {
                ForEach(hardest) { item in
                    HStack {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(item.question).lineLimit(3)
                            Text("\(item.lapses) lapses" + (model.requestedIds.contains(item.id) ? " - practice requested" : ""))
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }

                        Spacer()

                        Image(systemName: item.id == selected ? "checkmark.circle.fill" : "circle")
                            .foregroundStyle(item.id == selected ? Color.accentColor : .secondary)
                    }
                    .contentShape(Rectangle())
                    .onTapGesture { model.selectedId = item.id }
                }

                if let errorMessage = model.errorMessage {
                    Text(errorMessage).font(.caption).foregroundStyle(.red)
                }
            }
        }
    }
}
