import SwiftUI

struct DueReviewUndoBanners: View {
    let model: DueReviewModel

    var body: some View {
        VStack(spacing: 0) {
            if model.suspendedUndo != nil {
                DueReviewUndoBanner(
                    message: "Suspended",
                    identifier: "due-review-suspend-undo",
                    isDisabled: model.isGrading,
                    taskId: model.suspendedUndo?.variantId,
                    onUndo: { await model.undoSuspend() },
                    onExpire: { model.suspendedUndo = nil }
                )
            }

            if model.knownUndo != nil {
                DueReviewUndoBanner(
                    message: "Marked as known",
                    identifier: "due-review-known-undo",
                    isDisabled: model.isGrading,
                    taskId: model.knownUndo?.reviewId,
                    onUndo: { await model.undoKnown() },
                    onExpire: { model.knownUndo = nil }
                )
            }
        }
    }
}

private struct DueReviewUndoBanner: View {
    let message: String
    let identifier: String
    let isDisabled: Bool
    let taskId: String?
    let onUndo: () async -> Void
    let onExpire: () -> Void

    var body: some View {
        HStack {
            Text(message)
                .zoomFont(.footnote)

            Text("·")
                .foregroundStyle(.secondary)

            Button("Undo") {
                Task { await onUndo() }
            }
            .zoomFont(.footnote.weight(.semibold))
            .buttonStyle(.borderless)
            .disabled(isDisabled)
            .accessibilityIdentifier(identifier)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 8)
        .background(.bar)
        .task(id: taskId) {
            try? await Task.sleep(for: .seconds(5))

            guard !Task.isCancelled else { return }

            onExpire()
        }
    }
}
