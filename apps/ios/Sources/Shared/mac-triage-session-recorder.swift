import Foundation
import PostAnkiAPI

@MainActor
final class MacTriageSessionRecorder {
    typealias Starter = (String?, String) async throws -> TriageSessionResponse
    typealias Finisher = (String, [TriageDecision], Int) async throws -> TriageSessionResponse

    private(set) var sessionId: String?
    private(set) var decisions: [TriageDecision] = []

    private let history: () -> TriageHistoryStore
    private let starter: Starter
    private let finisher: Finisher

    init(
        history: @escaping () -> TriageHistoryStore = { TriageHistoryStore() },
        starter: @escaping Starter = { try await APIClient.startTriageSession(subjectId: $0, startKey: $1) },
        finisher: @escaping Finisher = {
            try await APIClient.finishTriageSession(id: $0, feedbackText: "", decisions: $1, undecidedCount: $2)
        }
    ) {
        self.history = history
        self.starter = starter
        self.finisher = finisher
    }

    func begin(subjectId: String?) async {
        guard sessionId == nil, let session = try? await starter(subjectId, UUID().uuidString) else { return }

        sessionId = session.id
        decisions = []
        history().record(session.id)
    }

    func record(bitId: String, verdict: TriageVerdict) {
        guard sessionId != nil else { return }

        decisions.removeAll { $0.bitId == bitId }
        decisions.append(TriageDecision(bitId: bitId, verdict: verdict))
    }

    func undo(bitId: String) {
        decisions.removeAll { $0.bitId == bitId }
    }

    func end(undecidedCount: Int) async {
        guard let id = sessionId else { return }

        let taken = Array(decisions.suffix(FocusTriageDecisionLog.maxDecisions))

        sessionId = nil
        decisions = []
        _ = try? await finisher(id, taken, undecidedCount)
    }
}
