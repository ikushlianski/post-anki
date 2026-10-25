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
    @State private var departing: DepartingCard?
    @State private var generation = 0

    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    private struct DepartingCard {
        let bit: PendingReviewBit
        let source: PendingReviewSource?
    }

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
            .task { await session.loadServerFronts() }
        } else if let shown {
            ZStack {
                if triage.readyCount > 1 { FocusTriageCardStackHint() }

                card(shown.bit, source: shown.source)
                    .id(cardKey(shown.bit.id))
                    .transition(.asymmetric(insertion: appearTransition, removal: .identity))
            }
            .animation(.easeOut(duration: 0.3), value: cardKey(shown.bit.id))
        }
    }

    private var shown: DepartingCard? {
        if let departing { return departing }

        guard let bit = triage.current else { return nil }

        return DepartingCard(bit: bit, source: triage.currentSource)
    }

    private var appearTransition: AnyTransition {
        reduceMotion ? .opacity : .opacity.combined(with: .offset(y: 24))
    }

    private func cardKey(_ bitId: String) -> String { "\(bitId)#\(generation)" }

    private func card(_ bit: PendingReviewBit, source: PendingReviewSource?) -> some View {
        FocusTriageSwipeCard(
            isBusy: triage.isBusy || departing != nil,
            onDecide: { await decide(bit, source: source, approve: $0 == .approve) },
            onFlownOff: finishDeparture
        ) {
            FocusTriageCard(
                bit: bit,
                source: source,
                note: Binding(
                    get: { triage.notes[bit.id] ?? "" },
                    set: { triage.notes[bit.id] = $0 }
                ),
                message: triage.message,
                onEdit: { editingBit = bit }
            )
        }
    }

    private var showsActionBar: Bool {
        !showsFinish && !(session.phase == .result && session.result != nil)
    }

    private var showsFinish: Bool {
        session.phase == .writing || session.phase == .saving || shown == nil
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
        FocusTriageSplitBar(
            leading: FocusTriageBarAction(
                title: "Undo",
                isDisabled: !triage.canUndo || triage.isBusy,
                action: { Task { await triage.undo() } }
            ),
            trailing: FocusTriageBarAction(
                title: "Finish",
                isDisabled: session.phase == .saving || session.phase == .result || triage.isBusy || session.busy,
                action: openFinish
            )
        )
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

    private func decide(_ bit: PendingReviewBit, source: PendingReviewSource?, approve: Bool) async -> Bool {
        departing = DepartingCard(bit: bit, source: source)

        if approve { await triage.approve() } else { await triage.reject() }

        guard triage.log.lastDecided?.bitId == bit.id else {
            departing = nil
            return false
        }

        if approve { announce("Approved, \(triage.readyCount) left") }

        return true
    }

    private func finishDeparture() {
        generation += 1
        departing = nil
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
