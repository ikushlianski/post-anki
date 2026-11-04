import PostAnkiAPI
import SwiftUI

struct FocusTriageDuplicateSection: View {
    let duplicate: PendingReviewDuplicateOf
    let message: String?
    let onResolve: (Bool) async -> Bool

    @State private var previewing: PendingReviewDuplicateOf.SimilarCard?
    @State private var similar: DuplicateSimilarCards

    init(duplicate: PendingReviewDuplicateOf, message: String?, onResolve: @escaping (Bool) async -> Bool) {
        self.duplicate = duplicate
        self.message = message
        self.onResolve = onResolve
        _similar = State(initialValue: DuplicateSimilarCards.fallback(for: duplicate))
    }

    var body: some View {
        ZoomVStack(alignment: .leading, spacing: 8) {
            Label("Possible duplicate", systemImage: "square.on.square")
                .zoomFont(.caption.weight(.semibold))
                .foregroundStyle(.orange)
                .accessibilityIdentifier("triage-duplicate-badge")

            if let reason = duplicate.reason, !reason.isEmpty {
                Text(reason)
                    .zoomFont(.callout)
                    .foregroundStyle(.secondary)
            }

            Text("Similar cards")
                .zoomFont(.caption.weight(.semibold))
                .foregroundStyle(.secondary)

            ForEach(similar.cards) { card in
                Button { previewing = card } label: {
                    Text(card.front)
                        .zoomFont(.callout)
                        .multilineTextAlignment(.leading)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.bordered)
                .accessibilityLabel("Similar card: \(card.front)")
                .accessibilityHint("Opens a preview with Reject duplicate and Accept")
                .accessibilityIdentifier("triage-similar-card-\(card.bitId)")
            }

            if similar.failedCount > 0 {
                Text(similar.failedCount == 1 ? "1 more similar card could not be loaded" : "\(similar.failedCount) more similar cards could not be loaded")
                    .zoomFont(.caption)
                    .foregroundStyle(.secondary)
                    .accessibilityIdentifier("triage-similar-failed")
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(12)
        .background(.orange.opacity(0.12), in: RoundedRectangle(cornerRadius: 10))
        .task(id: duplicate.bitId) { similar = await DuplicateSimilarCards.load(for: duplicate) }
        .sheet(item: $previewing) { card in
            FocusTriageSimilarCardSheet(card: card, message: message) { approve in
                let done = await onResolve(approve)

                if done { previewing = nil }
            }
            .presentationDragIndicator(.visible)
            .presentationDetents([.medium, .large])
        }
    }
}

struct FocusTriageSimilarCardSheet: View {
    let card: PendingReviewDuplicateOf.SimilarCard
    let message: String?
    let onDecide: (Bool) async -> Void

    @State private var isWorking = false

    var body: some View {
        ZoomVStack(alignment: .leading, spacing: 16) {
            ScrollView {
                ZoomVStack(alignment: .leading, spacing: 16) {
                    QuestionAnswerRow(kind: .question, spacing: 8) {
                        Text(card.front)
                            .zoomFont(.title3.weight(.semibold))
                            .frame(maxWidth: .infinity, alignment: .leading)
                    }

                    if let back = card.back, !back.isEmpty {
                        QuestionAnswerRow(kind: .answer, spacing: 8) {
                            Text(back)
                                .zoomFont(.body)
                                .frame(maxWidth: .infinity, alignment: .leading)
                        }
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }

            if let message {
                Text(message)
                    .zoomFont(.callout)
                    .foregroundStyle(.red)
                    .accessibilityIdentifier("triage-similar-error")
            }

            ZoomHStack(spacing: 12) {
                Button("Reject duplicate", role: .destructive) { run(approve: false) }
                    .buttonStyle(.bordered)
                    .accessibilityIdentifier("triage-reject-duplicate")

                Button("Accept") { run(approve: true) }
                    .buttonStyle(.borderedProminent)
                    .accessibilityIdentifier("triage-accept-duplicate")
            }
            .frame(maxWidth: .infinity)
            .disabled(isWorking)
        }
        .zoomPadding()
        .padding(.top, 8)
    }

    private func run(approve: Bool) {
        isWorking = true

        Task {
            await onDecide(approve)
            isWorking = false
        }
    }
}
