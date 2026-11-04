import PostAnkiAPI
import SwiftUI

enum FocusTriageFinishPhase {
    case idle
    case saving
}

@Observable
@MainActor
final class FocusTriageSessionModel {
    let triage: FocusTriageModel
    var sessionId: String?
    var resumed = false
    var phase = FocusTriageFinishPhase.idle
    var error: String?
    var busy = false
    var syncNotice: String?
    var serverFronts: [String: String] = [:]
    var chatSends: [String: FocusTriageChatSend] = [:]

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
        defer { busy = false }

        let chosen = filter ?? (triage.list.isWindowComplete ? FocusTriageSubject.single(triage.list.sources) : nil)
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

    func endSession() async -> Bool {
        guard isOpen else { return true }

        return await finish()
    }

    @discardableResult
    func finish() async -> Bool {
        guard let sessionId, phase != .saving else { return false }

        phase = .saving
        error = nil

        await triage.settlePending()

        guard triage.saveFailure == nil else {
            phase = .idle
            error = "A decision didn't save. Retry or skip it first."

            return false
        }

        await flushEdits()

        do {
            let response = try await APIClient.finishTriageSession(
                id: sessionId,
                feedbackText: "",
                decisions: triage.log.cappedDecisions(earlier: earlier),
                undecidedCount: triage.remainingCount
            )

            resetSession()

            if let note = response.notes.first?.text { triage.list.notice = "Style note learned: \(note)" }

            return true
        } catch {
            if case APIError.badStatus(let status, _) = error, status == 404 || status == 409 {
                resetSession()

                return true
            }

            phase = .idle
            self.error = "Couldn't save this session. It is kept and sent next time you open triage."

            return false
        }
    }

    private func resetSession() {
        store.clear()
        sessionId = nil
        earlier = []
        dirty = []
        bitTails = [:]
        syncNotice = nil
        subjectId = nil
        triage.subjectFilter = nil
        resumed = false
        phase = .idle
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
        error = nil
        syncNotice = nil
        phase = .idle

        await triage.settlePending()

        if let id { _ = try? await APIClient.discardTriageSession(id: id, undecidedCount: triage.remainingCount) }
    }

    func persist() {
        guard let sessionId else { return }

        store.save(sessionId: sessionId, decisions: decisions, subjectId: subjectId)
    }
}
