import PostAnkiAPI
import SwiftUI

@Observable
@MainActor
final class TriageRecentModel {
    var decisions: [TriageRecentDecision] = []
    var hasLoaded = false
    var errorMessage: String?
    var meaningUnavailable = false
    var saveError: String?
    var mode: TriageHistorySearchMode = .both
    var draft = ""

    @ObservationIgnored private var generation = 0

    var query: String { draft.trimmingCharacters(in: .whitespacesAndNewlines) }

    func load() async {
        generation += 1

        let current = generation
        let term = query
        let chosenMode = mode

        errorMessage = nil

        do {
            let result = try await APIClient.recentTriageDecisions(q: term, mode: chosenMode)

            guard current == generation else { return }

            decisions = result.decisions
            meaningUnavailable = result.meaningUnavailable ?? false
            hasLoaded = true
        } catch {
            guard current == generation else { return }

            errorMessage = StudyToolsError.message(for: error)
        }
    }

    func setReason(_ decision: TriageRecentDecision, reason: String?, note: String? = nil) async -> String? {
        do {
            try await APIClient.setTriageDecisionReason(decisionId: decision.id, reasonCode: reason, note: note)
            apply(reason: reason, to: decision.id)
            saveError = nil

            return nil
        } catch {
            let message = KnowledgeManageError.message(for: error, action: "save the reason")

            saveError = message

            return message
        }
    }

    func rejectFeedback(for decision: TriageRecentDecision) -> PendingRejectFeedback {
        PendingRejectFeedback(
            feedbackId: decision.id,
            bitBody: decision.front ?? decision.back ?? "Card",
            reasonCodes: decision.rejectReasonCodes
        )
    }

    private func apply(reason: String?, to id: String) {
        guard let index = decisions.firstIndex(where: { $0.id == id }) else { return }

        decisions[index].reasonCode = reason
    }
}
