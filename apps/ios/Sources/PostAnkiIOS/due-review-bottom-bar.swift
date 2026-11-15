import SwiftUI

struct DueReviewBottomBar: View {
    let model: DueReviewModel

    var body: some View {
        VStack(spacing: 0) {
            if model.suspendedUndo != nil {
                DueReviewSuspendedBanner(model: model)
            }

            if model.knownUndo != nil {
                DueReviewKnownBanner(model: model)
            }

            if model.current != nil {
                suspendRow
            }

            if model.reviewedCount > 0 {
                Text("\(model.reviewedCount) reviewed this session")
                    .zoomFont(.footnote)
                    .foregroundStyle(.secondary)
                    .monospacedDigit()
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 6)
                    .background(.bar)
            }

            if model.isRevealed {
                DueReviewGradeBar(tiles: gradeTiles)
            } else {
                MainActionControls(
                    tiles: [MainActionTile(title: "Show Answer", style: .prominent) { model.reveal() }],
                    extendsIntoBottomSafeArea: false
                )
            }
        }
    }

    private var suspendRow: some View {
        HStack {
            Button {
                Task { await model.markCurrentKnown() }
            } label: {
                Label("I already know it", systemImage: "checkmark.seal.fill")
                    .zoomFont(.subheadline.weight(.semibold))
                    .frame(minHeight: 32)
            }
            .buttonStyle(.bordered)
            .tint(.green)
            .disabled(model.isGrading || model.current?.isRehearsal == true)
            .accessibilityIdentifier("due-review-known")
            .accessibilityHint("Hides this card for 6 to 12 months")

            Spacer()

            Button {
                Task { await model.suspendCurrent(offersUndo: true) }
            } label: {
                Label("Suspend", systemImage: "pause.circle")
                    .zoomFont(.footnote)
            }
            .buttonStyle(.borderless)
            .disabled(model.isGrading)
            .accessibilityIdentifier("due-review-suspend")
            .accessibilityHint("Stops this card from coming up until you unsuspend it")
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 8)
        .background(.bar)
    }

    private var gradeTiles: [MainActionTile] {
        let rehearsal = model.current?.isRehearsal == true

        return DueReviewGradeOptions.options(rehearsal: rehearsal).map { option in
            MainActionTile(
                title: option.title,
                isDisabled: model.isGrading,
                tint: DueReviewGradeOptions.tint(for: option.grade),
                caption: rehearsal ? nil : DueReviewGradeOptions.intervalCaption(for: option.grade, preview: model.current?.intervalPreview)
            ) {
                Task { await model.grade(option.grade) }
            }
        }
    }
}

private struct DueReviewSuspendedBanner: View {
    let model: DueReviewModel

    var body: some View {
        HStack {
            Text("Suspended")
                .zoomFont(.footnote)

            Text("·")
                .foregroundStyle(.secondary)

            Button("Undo") {
                Task { await model.undoSuspend() }
            }
            .zoomFont(.footnote.weight(.semibold))
            .buttonStyle(.borderless)
            .disabled(model.isGrading)
            .accessibilityIdentifier("due-review-suspend-undo")
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 8)
        .background(.bar)
        .task(id: model.suspendedUndo?.variantId) {
            try? await Task.sleep(for: .seconds(5))

            guard !Task.isCancelled else { return }

            model.suspendedUndo = nil
        }
    }
}

private struct DueReviewKnownBanner: View {
    let model: DueReviewModel

    var body: some View {
        HStack {
            Text("Marked as known")
                .zoomFont(.footnote)

            Text("·")
                .foregroundStyle(.secondary)

            Button("Undo") {
                Task { await model.undoKnown() }
            }
            .zoomFont(.footnote.weight(.semibold))
            .buttonStyle(.borderless)
            .disabled(model.isGrading)
            .accessibilityIdentifier("due-review-known-undo")
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 8)
        .background(.bar)
        .task(id: model.knownUndo?.reviewId) {
            try? await Task.sleep(for: .seconds(5))

            guard !Task.isCancelled else { return }

            model.knownUndo = nil
        }
    }
}
