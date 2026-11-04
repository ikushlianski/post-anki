import Observation
import PostAnkiAPI
import SwiftUI

@MainActor
@Observable
final class KnowledgeItemCardsModel {
    let bitId: String
    var cards: [KnowledgeCardState] = []
    var busy: Set<String> = []
    var message: String?
    var loadFailed = false

    init(bitId: String) {
        self.bitId = bitId
    }

    var showsCards: Bool { loadFailed || cards.contains { !$0.cardKey.isEmpty } }

    static let loadFailedMessage = "Couldn't load this item's cards. Pull to refresh to try again."

    func load() async {
        do {
            let detail = try await APIClient.knowledgeDetail(id: bitId)
            cards = detail.perCardStates
            loadFailed = false
        } catch {
            guard !KnowledgeManageError.isCancellation(error) else { return }

            loadFailed = true
        }
    }

    func apply(_ card: KnowledgeCardState, suspended: Bool?, buried: Bool?) async {
        guard !busy.contains(card.id) else { return }

        busy.insert(card.id)
        message = nil
        defer { busy.remove(card.id) }

        do {
            _ = try await APIClient.setSchedule(
                id: bitId,
                suspended: suspended,
                buried: buried,
                variantId: card.variantId
            )
            await load()
        } catch {
            guard !KnowledgeManageError.isCancellation(error) else { return }

            message = KnowledgeManageError.message(for: error, action: "update this card")
        }
    }
}

struct KnowledgeItemCardsSection: View {
    let model: KnowledgeItemCardsModel

    var body: some View {
        if model.showsCards {
            Section("Cards") {
                ForEach(model.cards) { card in
                    KnowledgeItemCardRow(card: card, isBusy: model.busy.contains(card.id)) { suspended, buried in
                        Task { await model.apply(card, suspended: suspended, buried: buried) }
                    }
                }

                if model.loadFailed {
                    Text(KnowledgeItemCardsModel.loadFailedMessage).zoomFont(.caption).foregroundStyle(.red)
                }

                if let message = model.message {
                    Text(message).zoomFont(.caption).foregroundStyle(.red)
                }
            }
        }
    }
}

private struct KnowledgeItemCardRow: View {
    let card: KnowledgeCardState
    let isBusy: Bool
    let onChange: (_ suspended: Bool?, _ buried: Bool?) -> Void

    private var statusText: String {
        if card.suspended { return "Suspended" }

        if card.buried { return "Buried" }

        return KnowledgeOverviewItem.label(for: card.state)
    }

    private var detailText: String {
        var parts = [statusText]

        if let due = card.dueAt.flatMap({ DueReviewModel.nextDueText($0) }) { parts.append("due \(due)") }

        if card.lapses > 0 { parts.append("\(card.lapses) lapses") }

        return parts.joined(separator: ", ")
    }

    var body: some View {
        ZoomHStack(spacing: 8) {
            ZoomVStack(alignment: .leading, spacing: 2) {
                Text(card.title)
                Text(detailText).zoomFont(.caption).foregroundStyle(.secondary)
            }

            Spacer()

            Menu {
                if card.suspended {
                    Button("Unsuspend", systemImage: "play.circle") { onChange(false, nil) }
                } else {
                    if card.buried {
                        Button("Bring back today", systemImage: "arrow.uturn.backward") { onChange(nil, false) }
                    } else {
                        Button("Bury until tomorrow", systemImage: "moon.zzz") { onChange(nil, true) }
                    }

                    Button("Suspend", systemImage: "pause.circle") { onChange(true, nil) }
                }
            } label: {
                Label("Card actions", systemImage: "ellipsis.circle").labelStyle(.iconOnly)
            }
            .disabled(isBusy)
        }
    }
}
