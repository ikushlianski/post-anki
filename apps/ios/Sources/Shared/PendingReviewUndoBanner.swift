import PostAnkiAPI
import SwiftUI

struct PendingReviewUndoBanner: View {
    let undo: PendingReviewUndo
    let onUndo: () -> Void
    let onDismiss: () -> Void

    var body: some View {
        ZoomHStack(spacing: 12) {
            ZoomVStack(alignment: .leading, spacing: 2) {
                Text(undo.canRetry ? "Item rejected" : "Undo unavailable")
                    .zoomFont(.subheadline.weight(.semibold))

                if let message = undo.message {
                    Text(message)
                        .zoomFont(.caption)
                        .foregroundStyle(.secondary)
                }
            }

            Spacer()

            if undo.canRetry {
                if undo.isRestoring {
                    ProgressView()
                }

                Button("Undo", action: onUndo)
                    .buttonStyle(.borderedProminent)
                    .disabled(undo.isRestoring)
            }

            Button(action: onDismiss) {
                Image(systemName: "xmark")
            }
            .accessibilityLabel("Dismiss")
            .help("Dismiss")
        }
        .zoomPadding(12)
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 16))
        .zoomPadding(.horizontal)
        .zoomPadding(.bottom, 8)
        .accessibilityElement(children: .contain)
    }
}
