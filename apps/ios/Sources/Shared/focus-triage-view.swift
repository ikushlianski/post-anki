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
    let onFinished: () -> Void

    @State var departing: DepartingCard?
    @State private var generation = 0
    @State private var hasLoaded = false
    @State private var scrollEdge = FocusTriageScrollEdge()

    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    struct DepartingCard {
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
            if !isQueueEmpty {
                VStack(spacing: 0) {
                    if shown != nil { extraActionBar }

                    actionBar
                }
            }
        }
        .confirmationDialog(
            "Replace your example?",
            isPresented: Binding(
                get: { triage.overwritePromptBitId != nil },
                set: { if !$0 { triage.overwritePromptBitId = nil } }
            ),
            titleVisibility: .visible
        ) {
            Button("Replace with AI example", role: .destructive) {
                Task { await triage.generateExample(overwrite: true) }
            }
            Button("Keep mine", role: .cancel) { triage.overwritePromptBitId = nil }
        } message: {
            Text("This card has an example you wrote. The AI example replaces it. Undo brings yours back.")
        }
        .task {
            await triage.load()
            session.resume()
            triage.startPolling()
            hasLoaded = true
        }
        .onChange(of: isQueueEmpty) { wasEmpty, isEmpty in
            guard hasLoaded, !wasEmpty, isEmpty, session.isOpen else { return }

            Task { await leaveToReview() }
        }
        .onDisappear {
            triage.stopPolling()

            if isQueueEmpty, session.isOpen { Task { await session.finish() } }
        }
        .saveFailurePrompt(
            triage.saveFailure,
            onRetry: { Task { await triage.retryFailedSave() } },
            onSkip: { Task { await triage.skipFailedSave() } }
        )
        .keyboardDismissal()
        #if os(iOS)
        .background(TriageKeyCommands(isActive: keysActive, onIntent: handleKey).frame(width: 0, height: 0))
        #endif
    }

    @ViewBuilder
    private var content: some View {
        if let shown {
            ZStack {
                if triage.readyCount > 1 { FocusTriageCardStackHint() }

                card(shown.bit, source: shown.source)
                    .id(cardKey(shown.bit.id))
                    .transition(.asymmetric(insertion: appearTransition, removal: .identity))
            }
            .animation(.easeOut(duration: 0.3), value: cardKey(shown.bit.id))
        } else if hasLoaded {
            ContentUnavailableView("Nothing left to triage", systemImage: "checkmark.seal")
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
            scrollEdge: scrollEdge,
            exampleLabel: triage.currentExampleLabel,
            onExample: { _ = await triage.generateExample() },
            onDecide: { await decide(bit, source: source, approve: $0 == .approve) },
            onVertical: { await vertical($0, bit: bit, source: source) },
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
                isWritingExample: triage.isWritingExample(bit.id),
                selectedIndex: triage.chosenIndex(of: bit),
                onSelect: { triage.choose($0, in: bit) },
                onScrollEdgeChange: { scrollEdge = $0 },
                onEdit: { editingBit = bit },
                onRefresh: { await triage.load() },
                onResolveDuplicate: { approve in
                    guard departing == nil else { return false }

                    guard await decide(bit, source: source, approve: approve) else { return false }

                    finishDeparture()

                    return true
                }
            )
        }
    }

    var isQueueEmpty: Bool { shown == nil }

    func leaveToReview() async {
        guard await session.endSession() else { return }

        onFinished()
    }

    func decide(_ bit: PendingReviewBit, source: PendingReviewSource?, approve: Bool) async -> Bool {
        departing = DepartingCard(bit: bit, source: source)

        if approve { await triage.approve() } else { await triage.reject() }

        guard triage.log.lastDecided?.bitId == bit.id else {
            departing = nil
            return false
        }

        TriageFeedbackPlayer.haptic(for: approve ? .accept : .reject)

        if approve { announce("Approved, \(triage.remainingCount) left") }

        return true
    }

    func vertical(_ action: FocusTriageVerticalAction, bit: PendingReviewBit, source: PendingReviewSource?) async -> Bool {
        departing = DepartingCard(bit: bit, source: source)

        let moved = action == .inbox ? await triage.sendToInbox() : await triage.sendToChat()

        guard moved else {
            departing = nil

            return false
        }

        TriageFeedbackPlayer.haptic(for: action == .inbox ? .inbox : .chat)

        let name = FocusTriageActionLabel.name(for: action)

        announce("Sent to \(name), \(triage.remainingCount) left")

        return true
    }

    func finishDeparture() {
        generation += 1
        departing = nil
    }

    func closeWithoutSession() {
        triage.list.notice = "Triage finished. This session wasn't saved, so no feedback was sent."
        onClose()
        onFinished()
    }

    private func announce(_ text: String) {
        #if canImport(UIKit)
        UIAccessibility.post(notification: .announcement, argument: text)
        #endif
    }
}
