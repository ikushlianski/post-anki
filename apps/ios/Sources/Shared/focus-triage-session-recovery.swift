import PostAnkiAPI
import SwiftUI

extension FocusTriageSessionModel {
    func attempt(_ sid: String, _ operation: @escaping () async throws -> Void) async -> Bool {
        do {
            try await operation()

            return true
        } catch is CancellationError {
            return false
        } catch {
            guard Self.isRetryable(error), sessionId == sid else { return await fail(error, sid) }

            do {
                try await Task.sleep(for: .milliseconds(300))
                try await operation()

                return true
            } catch is CancellationError {
                return false
            } catch {
                return await fail(error, sid)
            }
        }
    }

    private func fail(_ error: Error, _ sid: String) async -> Bool {
        if Self.isSessionFinished(error) {
            await recoverStale(sid)
        } else {
            noteSyncFailure(sid)
        }

        return false
    }

    private static func isRetryable(_ error: Error) -> Bool {
        guard case APIError.badStatus(let status, let code) = error else { return false }

        return code == "decision_not_applied" || status >= 500
    }

    private static func isSessionFinished(_ error: Error) -> Bool {
        if case APIError.badStatus(409, "session_finished") = error { return true }

        return false
    }

    private func recoverStale(_ sid: String) async {
        guard sessionId == sid, !recovering else { return }

        recovering = true
        defer { recovering = false }

        guard let fresh = try? await APIClient.startTriageSession(subjectId: subjectId, startKey: UUID().uuidString),
              sessionId == sid else {
            noteSyncFailure(sid)

            return
        }

        let carried = triage.log.sessionDecisions()

        earlier = []
        sessionId = fresh.id
        dirty = []
        syncNotice = nil
        persist()

        for decision in carried {
            let reason = decision.reasonCode.map(TriageReasonUpdate.set) ?? .unchanged

            enqueue(decision.bitId) { [self] in
                guard sessionId == fresh.id else { return }

                do {
                    try await APIClient.putTriageDecision(
                        sessionId: fresh.id,
                        bitId: decision.bitId,
                        verdict: decision.verdict,
                        note: decision.note,
                        reason: reason,
                        dwellMs: decision.dwellMs
                    )
                } catch is CancellationError {
                    return
                } catch {
                    noteSyncFailure(fresh.id)
                }
            }
        }
    }
}
