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
        .safeAreaInset(edge: .bottom, spacing: 0) {
            if showsActionBar { actionBar }
        }
        .task {
            await triage.load()
            session.resume()
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
                rows: session.decisionRows,
                editing: session.editing,
                onFinish: { finish(feedback: feedback) },
                onFinishWithoutFeedback: { finish(feedback: "") },
                onDiscard: {
                    Task { await session.discard() }
                    onClose()
                },
                onKeepGoing: triage.readyCount > 0 ? { session.phase = .idle } : nil
            )
        } else if let bit = triage.current {
            FocusTriageSwipeCard(isBusy: triage.isBusy, onDecide: { await decide(bit.id, approve: $0 == .approve) }) {
                FocusTriageCard(
                    bit: bit,
                    source: triage.currentSource,
                    note: Binding(
                        get: { triage.notes[bit.id] ?? "" },
                        set: { triage.notes[bit.id] = $0 }
                    ),
                    message: triage.message,
                    onEdit: { editingBit = bit }
                )
            }
            .id(bit.id)
        }
    }

    private var showsActionBar: Bool {
        !showsFinish && !(session.phase == .result && session.result != nil)
    }

    private var showsFinish: Bool {
        session.phase == .writing || session.phase == .saving || triage.current == nil
    }

    private var header: some View {
        ZoomHStack(spacing: 8) {
            ZoomVStack(alignment: .leading, spacing: 2) {
                Text(triage.readyCount > 0 ? "\(triage.readyCount) left to review" : "All done, 0 left")
                    .zoomFont(.headline.monospacedDigit())

                if triage.waitingCount > 0 {
                    Text("Writing cards… \(triage.waitingCount) waiting")
                        .zoomFont(.caption)
                        .foregroundStyle(.secondary)
                }
            }

            Spacer()
        }
        .zoomPadding()
    }

    private var actionBar: some View {
        ZoomHStack(spacing: 12) {
            Button("Undo") { Task { await triage.undo() } }
                .disabled(!triage.canUndo || triage.isBusy)
                .frame(maxWidth: .infinity, minHeight: 44)
            Button("Finish", action: openFinish)
                .disabled(session.phase == .saving || session.phase == .result || triage.isBusy || session.busy)
                .frame(maxWidth: .infinity, minHeight: 44)
        }
        .buttonStyle(.bordered)
        .zoomPadding()
        .background(.bar)
    }

    @ViewBuilder
    private var notices: some View {
        let texts = [triage.undoMessage, triage.notice, triage.list.notice, session.syncNotice].compactMap { $0 }

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

    private func decide(_ bitId: String, approve: Bool) async {
        if approve { await triage.approve() } else { await triage.reject() }

        guard approve, triage.log.lastDecided?.bitId == bitId else { return }

        announce("Approved, \(triage.readyCount) left")
    }

    private func openFinish() {
        if session.isOpen {
            session.openFinish()
        } else {
            closeWithoutSession()
        }
    }

    private func finish(feedback: String) {
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
