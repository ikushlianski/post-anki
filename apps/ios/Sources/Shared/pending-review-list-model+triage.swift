import PostAnkiAPI
import SwiftUI

extension PendingReviewListModel {
    func triage(bitId: String, keepVariantIds: [String]) async -> PendingReviewTriageOutcome {
        guard !inFlight.contains(bitId) else { return .kept(message: "") }

        inFlight.insert(bitId)
        rowMessages[bitId] = nil
        notice = nil
        defer { inFlight.remove(bitId) }

        let outcome: PendingReviewTriageOutcome

        do {
            try await APIClient.triageKnowledgeBit(id: bitId, keepVariantIds: keepVariantIds)
            outcome = .removed
        } catch {
            outcome = PendingReviewTriageOutcome.outcome(for: error)
        }

        switch outcome {
        case .removed:
            withAnimation { remove(bitId: bitId) }
            counts.adjust(by: -1)
        case .removedElsewhere:
            withAnimation { remove(bitId: bitId) }
            notice = "That item was already decided elsewhere, so it was removed."
            Task { await counts.refresh() }
        case .kept(let message):
            if !message.isEmpty { rowMessages[bitId] = message }
        }

        return outcome
    }
}
