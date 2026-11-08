import SwiftUI

struct AddKnowledgeStatusBanner: View {
    let model: IngestionDictationScreenModel
    let onReview: () -> Void
    let onAddAnyway: () -> Void

    var body: some View {
        VStack(spacing: 10) {
            if model.showsSubjectPicker && model.subjectPicker.loadFailed {
                card(tint: .orange) {
                    Label("Couldn't load your subjects. You can still add without one.", systemImage: "exclamationmark.circle")
                        .zoomFont(.caption)
                        .foregroundStyle(.secondary)
                }
            }

            if let errorMessage = model.errorMessage {
                card(tint: .red) {
                    Label(errorMessage, systemImage: "exclamationmark.triangle.fill")
                        .foregroundStyle(.red)

                    if model.canAddAnyway {
                        Button("Add anyway", action: onAddAnyway)
                            .disabled(model.isSubmitting)
                    }
                }
            }

            if model.hasSent {
                card(tint: model.isDetecting ? .accentColor : .green) {
                    Label(
                        model.isDetecting ? "Sent" : "Added",
                        systemImage: model.isDetecting ? "arrow.up.circle.fill" : "checkmark.circle.fill"
                    )
                    .font(.headline)
                    .foregroundStyle(model.isDetecting ? Color.accentColor : Color.green)

                    Text(model.isDetecting
                        ? "Sent. Extracting items..."
                        : "Added. Questions take a minute or two to appear. Approve them on the next screen to add them to your review queue.")
                        .zoomFont(.caption)
                        .foregroundStyle(.secondary)

                    if let summaryText = model.summaryText {
                        Text(summaryText).zoomFont(.caption)
                    }

                    Button("Review new items", action: onReview)
                        .disabled(model.isDetecting)
                }
            }
        }
    }

    private func card<Content: View>(tint: Color, @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 8, content: content)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(14)
            .background(tint.opacity(0.1), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
    }
}
