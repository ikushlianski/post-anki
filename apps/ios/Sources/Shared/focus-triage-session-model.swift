import PostAnkiAPI
import SwiftUI

enum FocusTriageFinishPhase {
    case idle
    case writing
    case saving
    case result
}

@Observable
@MainActor
final class FocusTriageSessionModel {
    let triage: FocusTriageModel
    var sessionId: String?
    var resumed = false
    var phase = FocusTriageFinishPhase.idle
    var error: String?
    var result: TriageSessionResponse?
    var busy = false
    var stale = false

    @ObservationIgnored private let store: FocusTriageSessionStore
    @ObservationIgnored private var earlier: [TriageDecision] = []

    init(triage: FocusTriageModel, store: FocusTriageSessionStore = FocusTriageSessionStore()) {
        self.triage = triage
        self.store = store
        triage.onDecisionsChanged = { [weak self] in self?.persist() }
    }

    var isOpen: Bool { sessionId != nil }
    var decisions: [TriageDecision] { triage.log.sessionDecisions(earlier: earlier) }
    var acceptedCount: Int { triage.log.acceptedCount(earlier: earlier) }
    var rejectedCount: Int { triage.log.rejectedCount(earlier: earlier) }

    func start() async {
        guard sessionId == nil, !busy else { return }

        triage.log.markBaseline()

        if let stored = store.load() {
            earlier = stored.decisions
            sessionId = stored.sessionId
            resumed = true

            return
        }

        busy = true
        error = nil
        result = nil
        defer { busy = false }

        do {
            let session = try await APIClient.startTriageSession(subjectId: FocusTriageSubject.single(triage.list.sources))

            earlier = []
            resumed = false
            sessionId = session.id
            store.save(sessionId: session.id, decisions: [])
        } catch {
            self.error = "Couldn't start triage. Try again."
        }
    }

    func openFinish() {
        guard sessionId != nil, phase == .idle else { return }

        error = nil
        phase = .writing
    }

    func finish(feedback: String) async -> Bool {
        guard let sessionId, phase != .saving else { return false }

        phase = .saving
        error = nil

        do {
            let response = try await APIClient.finishTriageSession(
                id: sessionId,
                feedbackText: FocusTriageFeedback.trimmed(feedback) ?? "",
                decisions: triage.log.cappedDecisions(earlier: earlier)
            )

            store.clear()
            self.sessionId = nil
            earlier = []
            resumed = false
            result = response
            phase = .result

            return true
        } catch {
            if case APIError.badStatus(let status, _) = error, status == 404 || status == 409 { stale = true }

            phase = .writing
            self.error = "Couldn't save the feedback. Your text is kept; try again."

            return false
        }
    }

    func discard() {
        store.clear()
        sessionId = nil
        earlier = []
        resumed = false
        stale = false
        error = nil
        phase = .idle
    }

    func closeResult() {
        result = nil
        phase = .idle
    }

    private func persist() {
        guard let sessionId else { return }

        store.save(sessionId: sessionId, decisions: decisions)
    }
}
