import PostAnkiAPI
import SwiftUI

enum FocusTriageFinishPhase {
    case idle
    case confirming
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
    var syncNotice: String?
    var serverFronts: [String: String] = [:]

    @ObservationIgnored let store: FocusTriageSessionStore
    @ObservationIgnored var earlier: [TriageDecision] = []
    @ObservationIgnored var subjectId: String?
    @ObservationIgnored var dirty: Set<String> = []
    @ObservationIgnored var recovering = false
    @ObservationIgnored var bitTails: [String: Task<Void, Never>] = [:]
    @ObservationIgnored private var startKey: (key: String, subject: String?)?

    init(triage: FocusTriageModel, store: FocusTriageSessionStore = FocusTriageSessionStore()) {
        self.triage = triage
        self.store = store
        triage.onDecisionsChanged = { [weak self] in self?.persist() }
        triage.onDecided = { [weak self] entry in self?.recordDecision(entry) }
        triage.beforeRestore = { [weak self] bitId in await self?.settleBit(bitId) }
        triage.onUndone = { [weak self] bitId in self?.recordUndo(bitId) }
    }

    var storedSession: FocusTriageStoredSession? { store.load() }
    var isOpen: Bool { sessionId != nil }
    var decisions: [TriageDecision] { triage.log.sessionDecisions(earlier: earlier) }
    var acceptedCount: Int { triage.log.acceptedCount(earlier: earlier) }
    var rejectedCount: Int { triage.log.rejectedCount(earlier: earlier) }

    func resume() {
        guard sessionId == nil, let stored = store.load() else { return }

        triage.log.markBaseline()
        earlier = stored.decisions
        sessionId = stored.sessionId
        subjectId = stored.subjectId
        triage.subjectFilter = stored.subjectId
        triage.syncPin()
        resumed = true
    }

    @discardableResult
    func start() async -> Bool {
        if sessionId != nil { return true }

        guard !busy else { return false }

        if store.load() != nil {
            resume()

            return true
        }

        let filter = triage.subjectFilter

        busy = true
        error = nil
        result = nil
        defer { busy = false }

        let chosen = filter ??  FocusTriageSubject.single(triage.list.sources)
        let key = startKey.flatMap { $0.subject == chosen ? $0.key : nil } ?? UUID().uuidString

        startKey = (key, chosen)

        do {
            let session = try await APIClient.startTriageSession(subjectId: chosen, startKey: key)

            triage.log.markBaseline()
            earlier = []
            dirty = []
            bitTails = [:]
            syncNotice = nil
            resumed = false
            sessionId = session.id
            subjectId = filter
            startKey = nil
            store.save(sessionId: session.id, decisions: [], subjectId: filter)

            return true
        } catch {
            self.error = "Couldn't start triage. Check your connection and try again."

            return false
        }
    }

    func openFinish() {
        guard sessionId != nil, phase == .idle else { return }

        error = nil
        phase = .confirming
    }

    func confirmFinish() {
        guard sessionId != nil, phase == .confirming else { return }

        phase = .writing
        Task { await loadServerFronts() }
    }

    func keepTriaging() {
        guard phase == .confirming || phase == .writing else { return }

        error = nil
        phase = .idle
    }

    func finish(feedback: String) async -> Bool {
        guard let sessionId, phase != .saving else { return false }

        phase = .saving
        error = nil

        await triage.settlePending()
        await flushEdits()

        do {
            let response = try await APIClient.finishTriageSession(
                id: sessionId,
                feedbackText: FocusTriageFeedback.trimmed(feedback) ?? "",
                decisions: triage.log.cappedDecisions(earlier: earlier),
                undecidedCount: triage.readyCount
            )

            store.clear()
            self.sessionId = nil
            earlier = []
            dirty = []
            bitTails = [:]
            syncNotice = nil
            subjectId = nil
            triage.subjectFilter = nil
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

    func discard() async {
        let id = sessionId

        store.clear()
        sessionId = nil
        earlier = []
        dirty = []
        bitTails = [:]
        subjectId = nil
        triage.subjectFilter = nil
        startKey = nil
        resumed = false
        stale = false
        error = nil
        syncNotice = nil
        phase = .idle

        await triage.settlePending()

        if let id { _ = try? await APIClient.discardTriageSession(id: id, undecidedCount: triage.readyCount) }
    }

    func closeResult() {
        triage.subjectFilter = nil
        result = nil
        phase = .idle
    }

    func persist() {
        guard let sessionId else { return }

        store.save(sessionId: sessionId, decisions: decisions, subjectId: subjectId)
    }
}
