import Observation
import PostAnkiAPI
import SwiftUI

@MainActor
@Observable
final class KnowledgeItemCardsModel {
    let bitId: String
    var cards: [KnowledgeCardState] = []
    var message: String?
    var loadFailed = false

    let writes = SerialWriteQueue()

    init(bitId: String) {
        self.bitId = bitId
        writes.onIdle = { [weak self] in await self?.load() }
    }

    func settle() async { await writes.settle() }

    var showsCards: Bool { loadFailed || cards.contains { !$0.cardKey.isEmpty } }

    static let loadFailedMessage = "Couldn't load this item's cards. Pull to refresh to try again."

    func load() async {
        do {
            let detail = try await APIClient.knowledgeDetail(id: bitId)

            guard writes.isIdle else { return }

            cards = detail.perCardStates
            loadFailed = false
        } catch {
            guard !KnowledgeManageError.isCancellation(error) else { return }

            loadFailed = true
        }
    }

    func apply(_ card: KnowledgeCardState, suspended: Bool?, buried: Bool?) async {
        let id = card.variantId

        message = nil
        update(id) {
            if let suspended { $0.suspended = suspended }

            if let buried { $0.buried = buried }
        }

        writes.enqueue { [self] in
            do {
                _ = try await APIClient.setSchedule(id: bitId, suspended: suspended, buried: buried, variantId: id)
            } catch {
                update(id) {
                    if suspended != nil, $0.suspended == suspended { $0.suspended = card.suspended }

                    if buried != nil, $0.buried == buried { $0.buried = card.buried }
                }

                guard !KnowledgeManageError.isCancellation(error) else { return }

                message = KnowledgeManageError.message(for: error, action: "update this card")
            }
        }
    }

    private func update(_ variantId: String, _ change: (inout KnowledgeCardState) -> Void) {
        guard let index = cards.firstIndex(where: { $0.id == variantId }) else { return }

        change(&cards[index])
    }
}

struct KnowledgeItemCardsSection: View {
    let model: KnowledgeItemCardsModel

    var body: some View {
        if model.showsCards {
            Section("Cards") {
                ForEach(model.cards) { card in
                    KnowledgeItemCardRow(card: card) { suspended, buried in
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
        }
    }
}
