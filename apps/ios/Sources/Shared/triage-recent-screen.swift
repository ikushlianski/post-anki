import PostAnkiAPI
import SwiftUI

struct TriageRecentDecisionsScreen: View {
    @State private var model = TriageRecentModel()
    @State private var editing: PendingRejectFeedback?

    private static let debounce: Duration = .milliseconds(350)

    var body: some View {
        List {
            Section {
                Picker("Search", selection: $model.mode) {
                    ForEach(TriageHistorySearchMode.allCases) { Text($0.label).tag($0) }
                }
            }

            if model.meaningUnavailable {
                Text("Search by meaning is unavailable right now, showing word matches only.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }

            if let message = model.saveError {
                Text(message).font(.caption).foregroundStyle(.red)
            }

            content
        }
        .navigationTitle("Last 7 days")
        .searchable(text: $model.draft, prompt: "Search by words or meaning")
        .refreshable { await model.load() }
        .task(id: SearchKey(text: model.query, mode: model.mode)) {
            if model.hasLoaded { try? await Task.sleep(for: Self.debounce) }

            guard !Task.isCancelled else { return }

            await model.load()
        }
        .sheet(item: $editing) { feedback in
            RejectReasonSheet(
                feedback: feedback,
                onSend: { reason, note in
                    guard let decision = model.decisions.first(where: { $0.id == feedback.feedbackId }) else { return nil }

                    let trimmed = note.trimmingCharacters(in: .whitespacesAndNewlines)
                    let error = await model.setReason(decision, reason: reason, note: trimmed.isEmpty ? nil : String(trimmed.prefix(500)))

                    if error == nil { editing = nil }

                    return error
                },
                onSkip: { editing = nil }
            )
            .macSheetMinSize()
        }
    }

    @ViewBuilder
    private var content: some View {
        if let message = model.errorMessage, !model.hasLoaded {
            ContentUnavailableView {
                Label("Couldn't load decisions", systemImage: "exclamationmark.triangle")
            } description: {
                Text(message)
            } actions: {
                Button("Try again") { Task { await model.load() } }
            }
        } else if !model.hasLoaded {
            ProgressView()
        } else if model.decisions.isEmpty {
            Text(model.query.isEmpty ? "No triage decisions in the last 7 days." : "Nothing matches that search.")
                .foregroundStyle(.secondary)
        } else {
            ForEach(model.decisions) { decision in
                TriageRecentDecisionRow(
                    decision: decision,
                    onEditReason: { editing = model.rejectFeedback(for: decision) },
                    onClearReason: { Task { _ = await model.setReason(decision, reason: nil) } }
                )
            }
        }
    }
}

private struct SearchKey: Hashable {
    let text: String
    let mode: TriageHistorySearchMode
}

struct TriageRecentDecisionRow: View {
    let decision: TriageRecentDecision
    let onEditReason: () -> Void
    let onClearReason: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Label {
                Text(decision.front ?? "Card").lineLimit(3)
            } icon: {
                Image(systemName: decision.isRejected ? "xmark.circle.fill" : "checkmark.circle.fill")
                    .foregroundStyle(decision.isRejected ? .red : .green)
            }

            if let back = decision.back, !back.isEmpty {
                Text(back).font(.caption).foregroundStyle(.secondary).lineLimit(2)
            }

            if let date = decision.decidedAt.flatMap(StudySessionDates.parse) {
                Text(date.formatted(date: .abbreviated, time: .shortened))
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            }

            if decision.isRejected {
                Button(action: onEditReason) {
                    Text(reasonText).font(.caption).foregroundStyle(decision.needsReason ? .orange : .accentColor)
                }
                .buttonStyle(.borderless)
            }
        }
        .contextMenu {
            if decision.isRejected {
                Button("Set reason", action: onEditReason)

                if !decision.needsReason { Button("Clear reason", role: .destructive, action: onClearReason) }
            }
        }
    }

    private var reasonText: String {
        guard let code = decision.reasonCode, !code.isEmpty else { return "No reason yet. Tap to add" }

        return RejectReasonOption.options(forCodes: [code]).first?.label ?? code
    }
}
