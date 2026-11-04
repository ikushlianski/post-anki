import PostAnkiAPI
import SwiftUI

struct TriageHistoryEntry: Identifiable, Equatable {
    let id: String
    let startedAt: Date?
    let approved: Int
    let rejected: Int
    let other: Int
    let isOpen: Bool

    init(_ session: TriageSessionResponse) {
        id = session.id
        startedAt = StudySessionDates.parse(session.startedAt)
        approved = session.acceptedCount
        rejected = session.rejectedCount
        other = session.undecidedCount ?? 0
        isOpen = session.status == "open"
    }

    var summary: String {
        "\(approved) approved, \(rejected) rejected, \(other) other"
    }
}

@Observable
@MainActor
final class TriageHistoryModel {
    var entries: [TriageHistoryEntry] = []
    var hasLoaded = false
    var errorMessage: String?

    private let store: TriageHistoryStore

    init(store: TriageHistoryStore = TriageHistoryStore()) {
        self.store = store
    }

    func load() async {
        errorMessage = nil

        let ids = store.ids()
        var found: [TriageSessionResponse] = []
        var failure: Error?

        await withTaskGroup(of: (TriageSessionResponse?, Error?).self) { group in
            for id in ids {
                group.addTask {
                    do {
                        return (try await APIClient.getTriageSession(id: id), nil)
                    } catch {
                        return (nil, error)
                    }
                }
            }

            for await (session, error) in group {
                if let session { found.append(session) }
                else if let error, !Self.isMissing(error) { failure = error }
            }
        }

        if found.isEmpty, let failure {
            errorMessage = StudyToolsError.message(for: failure)

            return
        }

        entries = found
            .map(TriageHistoryEntry.init)
            .filter { $0.approved + $0.rejected + $0.other > 0 && !$0.isOpen }
            .sorted { ($0.startedAt ?? .distantPast) > ($1.startedAt ?? .distantPast) }
        hasLoaded = true
    }

    private nonisolated static func isMissing(_ error: Error) -> Bool {
        if case APIError.badStatus(404, _) = error { return true }

        return false
    }
}

@Observable
@MainActor
final class TriageHistoryDetailModel {
    var decisions: [TriageDecisionRecord] = []
    var hasLoaded = false
    var errorMessage: String?

    let sessionId: String

    init(sessionId: String) {
        self.sessionId = sessionId
    }

    var approved: [TriageDecisionRecord] { decisions.filter { $0.verdict == "approved" } }
    var rejected: [TriageDecisionRecord] { decisions.filter { $0.verdict == "rejected" } }
    var other: [TriageDecisionRecord] { decisions.filter { $0.verdict != "approved" && $0.verdict != "rejected" } }

    func load() async {
        errorMessage = nil

        do {
            decisions = try await APIClient.listTriageDecisions(sessionId: sessionId)
                .filter { $0.undoneAt == nil }
                .sorted { ($0.orderIndex ?? 0) < ($1.orderIndex ?? 0) }
            hasLoaded = true
        } catch {
            errorMessage = StudyToolsError.message(for: error)
        }
    }
}
