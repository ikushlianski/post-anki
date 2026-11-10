import PostAnkiAPI
import SwiftUI

extension FocusTriageView {
    var header: some View {
        ZoomHStack(spacing: 8) {
            ZoomVStack(alignment: .leading, spacing: 2) {
                if let label = counterLabel {
                    Text(label)
                        .zoomFont(.headline.monospacedDigit())
                }

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

    var counterLabel: String? {
        FocusTriageCounter.label(readyCount: triage.remainingCount)
    }

    var extraActionBar: some View {
        MainActionControls(
            tiles: [
                MainActionTile(
                    title: FocusTriageActionLabel.inbox,
                    isDisabled: triage.isBusy || departing != nil,
                    identifier: TriageAccessibilityID.inboxButton,
                    action: { Task { _ = await moveCurrent(.inbox) } }
                ),
                MainActionTile(
                    title: FocusTriageActionLabel.chat,
                    isDisabled: triage.isBusy || departing != nil,
                    identifier: FocusTriageActionLabel.chatIdentifier,
                    action: { chatPromptOpen = true }
                ),
                MainActionTile(
                    title: triage.currentExampleLabel,
                    isLoading: triage.current.map { triage.isWritingExample($0.id) } ?? false,
                    isDisabled: triage.isBusy || departing != nil || triage.exampleLimitReached,
                    identifier: TriageAccessibilityID.exampleButton,
                    action: { Task { _ = await triage.generateExample() } }
                )
            ],
            minHeight: 48
        )
    }

    var actionBar: some View {
        MainActionControls(tiles: [
            MainActionTile(
                title: "Undo",
                isDisabled: !triage.canUndo || triage.isBusy,
                identifier: TriageAccessibilityID.undoButton,
                action: { Task { await triage.undo() } }
            ),
            MainActionTile(
                title: "Finish",
                isDisabled: session.phase == .saving || triage.isBusy || session.busy || triage.saveFailure != nil,
                action: { Task { await finishTapped() } }
            )
        ])
    }

    @ViewBuilder
    var notices: some View {
        let texts = [triage.undoMessage, triage.notice, triage.list.notice, session.syncNotice, session.error].compactMap { $0 }

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

    func moveCurrent(_ action: FocusTriageVerticalAction, prompt: String? = nil) async -> Bool {
        guard let bit = triage.current else { return false }

        guard await vertical(action, bit: bit, source: triage.currentSource, prompt: prompt) else { return false }

        finishDeparture()

        return true
    }

    func finishTapped() async {
        if session.isOpen {
            await leaveToReview()
        } else {
            closeWithoutSession()
        }
    }
}
