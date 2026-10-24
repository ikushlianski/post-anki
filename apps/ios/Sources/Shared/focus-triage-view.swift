import PostAnkiAPI
import SwiftUI
#if canImport(UIKit)
import UIKit
#endif

struct FocusTriageView: View {
    @Bindable var triage: FocusTriageModel
    @Bindable var session: FocusTriageSessionModel
    @Binding var editingBit: PendingReviewBit?
    let onClose: () -> Void

    @State private var feedback = ""

    var body: some View {
        ZoomVStack(alignment: .leading, spacing: 0) {
            header
            notices
            Divider()
            content
        }
        .task {
            await triage.load()
            await session.start()
            triage.startPolling()
        }
        .onDisappear { triage.stopPolling() }
    }

    @ViewBuilder
    private var content: some View {
        if session.phase == .result, let result = session.result {
            FocusTriageResult(result: result) {
                session.closeResult()
                onClose()
            }
        } else if showsFinish {
            FocusTriageDone(
                remaining: triage.readyCount,
                waitingCount: triage.waitingCount,
                decidedCount: session.decisions.count,
                feedback: $feedback,
                isSaving: session.phase == .saving,
                resumed: session.resumed,
                error: session.error,
                stale: session.stale,
                onFinish: finish,
                onDiscard: {
                    session.discard()
                    onClose()
                },
                onKeepGoing: triage.readyCount > 0 ? { session.phase = .idle } : nil
            )
        } else if let bit = triage.current {
            FocusTriageCard(
                bit: bit,
                source: triage.currentSource,
                note: Binding(
                    get: { triage.notes[bit.id] ?? "" },
                    set: { triage.notes[bit.id] = $0 }
                ),
                isBusy: triage.isBusy,
                message: triage.message,
                onApprove: { decide(bit.id, approve: true) },
                onReject: { decide(bit.id, approve: false) },
                onEdit: { editingBit = bit }
            )
            .id(bit.id)
        }
    }

    private var showsFinish: Bool {
        session.phase == .writing || session.phase == .saving || triage.current == nil
    }

    private var header: some View {
        ZoomHStack(spacing: 8) {
            ZoomVStack(alignment: .leading, spacing: 2) {
                Text("\(triage.readyCount) to review")
                    .zoomFont(.headline.monospacedDigit())

                if triage.waitingCount > 0 {
                    Text("Writing cards… \(triage.waitingCount) waiting")
                        .zoomFont(.caption)
                        .foregroundStyle(.secondary)
                }
            }

            Spacer()

            Button("Undo") { Task { await triage.undo() } }
                .disabled(!triage.canUndo || triage.isBusy)
            Button("Finish", action: openFinish)
                .disabled(session.phase == .saving || session.phase == .result)
        }
        .buttonStyle(.bordered)
        .zoomPadding()
    }

    @ViewBuilder
    private var notices: some View {
        let texts = [triage.undoMessage, triage.notice, triage.list.notice].compactMap { $0 }

        if !texts.isEmpty {
            ZoomVStack(alignment: .leading, spacing: 2) {
                ForEach(texts, id: \.self) { text in
                    Text(text)
                        .zoomFont(.caption)
                        .foregroundStyle(.secondary)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .zoomPadding(.horizontal)
            .zoomPadding(.bottom, 8)
        }
    }

    private func decide(_ bitId: String, approve: Bool) {
        Task {
            if approve { await triage.approve() } else { await triage.reject() }

            guard approve, triage.log.lastDecided?.bitId == bitId else { return }

            announce("Approved, \(triage.readyCount) left")
        }
    }

    private func openFinish() {
        if session.isOpen {
            session.openFinish()
        } else {
            closeWithoutSession()
        }
    }

    private func finish() {
        guard session.isOpen else { return closeWithoutSession() }

        Task { _ = await session.finish(feedback: feedback) }
    }

    private func closeWithoutSession() {
        triage.list.notice = "Triage finished. This session wasn't saved, so no feedback was sent."
        onClose()
    }

    private func announce(_ text: String) {
        #if canImport(UIKit)
        UIAccessibility.post(notification: .announcement, argument: text)
        #endif
    }
}
