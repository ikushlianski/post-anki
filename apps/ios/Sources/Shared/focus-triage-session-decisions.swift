import PostAnkiAPI
import SwiftUI

struct FocusTriageDecisionRow: Identifiable, Equatable {
    let bitId: String
    let verdict: TriageVerdict
    let title: String
    let note: String
    let reason: RejectReason?

    var id: String { bitId }
}

struct FocusTriageDecisionEditing {
    let onNote: (String, String) -> Void
    let onReason: (String, RejectReason?) -> Void
    let onCommit: (String) -> Void
}

extension FocusTriageSessionModel {
    var decisionRows: [FocusTriageDecisionRow] {
        decisions.map { decision in
            FocusTriageDecisionRow(
                bitId: decision.bitId,
                verdict: decision.verdict,
                title: triage.log.title(for: decision.bitId) ?? serverFronts[decision.bitId] ?? "Earlier card",
                note: decision.note ?? "",
                reason: decision.reasonCode.flatMap(RejectReason.init(rawValue:))
            )
        }
    }

    var editing: FocusTriageDecisionEditing {
        FocusTriageDecisionEditing(
            onNote: { [weak self] bitId, text in self?.setNote(bitId, text) },
            onReason: { [weak self] bitId, reason in self?.setReason(bitId, reason) },
            onCommit: { [weak self] bitId in
                guard let self else { return }

                Task { await self.commit(bitId) }
            }
        )
    }

    func recordDecision(_ entry: FocusTriageDecisionEntry) {
        guard let sid = sessionId else { return }

        enqueue(entry.bitId) { [self] in
            guard sessionId == sid else { return }

            do {
                try await APIClient.putTriageDecision(
                    sessionId: sid,
                    bitId: entry.bitId,
                    verdict: entry.verdict,
                    note: entry.note,
                    dwellMs: entry.dwellMs
                )
            } catch is CancellationError {
                return
            } catch {
                noteSyncFailure(sid)
            }
        }
    }

    func recordUndo(_ bitId: String) {
        guard let sid = sessionId else { return }

        dirty.remove(bitId)

        enqueue(bitId) { [self] in
            guard sessionId == sid else { return }

            do {
                try await APIClient.undoTriageDecision(sessionId: sid, bitId: bitId)
            } catch is CancellationError {
                return
            } catch {
                if case APIError.badStatus(404, _) = error { return }

                noteSyncFailure(sid)
            }
        }
    }

    func settle() async {
        for task in Array(bitTails.values) { await task.value }
    }

    func loadServerFronts() async {
        guard let sessionId, decisions.contains(where: { triage.log.title(for: $0.bitId) == nil && serverFronts[$0.bitId] == nil }),
              let records = try? await APIClient.listTriageDecisions(sessionId: sessionId) else { return }

        for record in records {
            if let bitId = record.bitId, let front = record.front { serverFronts[bitId] = front }
        }
    }

    func setNote(_ bitId: String, _ text: String) {
        let note = FocusTriageNote.trimmed(text)

        guard let current = decisions.first(where: { $0.bitId == bitId }), current.note != note else { return }

        applyFeedback(bitId, note: note, reasonCode: current.reasonCode)
    }

    func setReason(_ bitId: String, _ reason: RejectReason?) {
        guard let current = decisions.first(where: { $0.bitId == bitId }), current.verdict == .rejected else { return }

        applyFeedback(bitId, note: current.note, reasonCode: reason?.rawValue)
        Task { await commit(bitId) }
    }

    func commit(_ bitId: String) async {
        guard dirty.contains(bitId), let sid = sessionId else { return }

        let task = enqueue(bitId) { [self] in
            guard sessionId == sid, dirty.contains(bitId),
                  let current = decisions.first(where: { $0.bitId == bitId }) else { return }

            let reason: TriageReasonUpdate = current.verdict == .rejected
                ? current.reasonCode.map(TriageReasonUpdate.set) ?? .clear
                : .unchanged

            do {
                try await APIClient.putTriageDecision(
                    sessionId: sid,
                    bitId: bitId,
                    verdict: current.verdict,
                    note: current.note ?? "",
                    reason: reason
                )

                guard sessionId == sid else { return }

                let latest = decisions.first { $0.bitId == bitId }

                if latest?.note == current.note, latest?.reasonCode == current.reasonCode { dirty.remove(bitId) }
            } catch is CancellationError {
                return
            } catch {
                noteSyncFailure(sid)
            }
        }

        await task.value
    }

    func flushEdits() async {
        for bitId in dirty { await commit(bitId) }

        await settle()
    }

    @discardableResult
    private func enqueue(_ bitId: String, _ operation: @escaping @MainActor () async -> Void) -> Task<Void, Never> {
        let previous = bitTails[bitId]
        let task = Task { @MainActor in
            await previous?.value
            await operation()
        }

        bitTails[bitId] = task

        return task
    }

    private func applyFeedback(_ bitId: String, note: String?, reasonCode: String?) {
        dirty.insert(bitId)

        if !triage.log.updateFeedback(bitId: bitId, note: note, reasonCode: reasonCode),
           let index = earlier.firstIndex(where: { $0.bitId == bitId }) {
            earlier[index].note = note
            earlier[index].reasonCode = reasonCode
        }

        persist()
    }

    private func noteSyncFailure(_ sid: String) {
        guard sessionId == sid else { return }

        syncNotice = "Some decisions couldn't be recorded live. They are sent when you finish."
    }
}
