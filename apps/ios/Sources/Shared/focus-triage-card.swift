import PostAnkiAPI
import SwiftUI

struct FocusTriageCard: View {
    let bit: PendingReviewBit
    let source: PendingReviewSource?
    @Binding var note: String
    let isBusy: Bool
    let message: String?
    let onApprove: () -> Void
    let onReject: () -> Void
    let onEdit: () -> Void

    @State private var pressed: PendingReviewDecision?

    var body: some View {
        ScrollView {
            ZoomVStack(alignment: .leading, spacing: 16) {
                topRow
                variations
                example
                fact
                noteField

                if let message {
                    Text(message)
                        .zoomFont(.callout)
                        .foregroundStyle(.red)
                        .accessibilityAddTraits(.isStaticText)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .zoomPadding()
        }
        .scrollDismissesKeyboard(.interactively)
        .safeAreaInset(edge: .bottom) { actions }
        .onChange(of: isBusy) { if !isBusy { pressed = nil } }
    }

    private var topRow: some View {
        ZoomHStack(spacing: 8) {
            Text((source?.subjectName ?? "No subject").uppercased())
                .zoomFont(.caption.weight(.semibold))
                .foregroundStyle(.secondary)

            Spacer()

            Button("Edit", action: onEdit)
                .zoomFont(.callout)
                .disabled(isBusy)
        }
    }

    private var variations: some View {
        ZoomVStack(alignment: .leading, spacing: 10) {
            ForEach(bit.variants) { variant in
                ZoomVStack(alignment: .leading, spacing: 4) {
                    Text(variant.kindLabel)
                        .zoomFont(.caption.weight(.semibold))
                        .foregroundStyle(.secondary)
                    Text(variant.prompt)
                        .zoomFont(.title3)
                    Text(variant.answer)
                        .zoomFont(.body)
                        .foregroundStyle(.secondary)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .zoomPadding(12)
                .background(Color.secondary.opacity(0.08), in: RoundedRectangle(cornerRadius: 12))
                .accessibilityElement(children: .combine)
            }
        }
    }

    @ViewBuilder
    private var example: some View {
        if let background = bit.background, !background.isEmpty {
            ZoomVStack(alignment: .leading, spacing: 4) {
                Text("EXAMPLE")
                    .zoomFont(.caption.weight(.semibold))
                    .foregroundStyle(.secondary)
                Text(background)
                    .zoomFont(.callout)
            }
        }
    }

    private var fact: some View {
        ZoomVStack(alignment: .leading, spacing: 6) {
            Text("FACT")
                .zoomFont(.caption.weight(.semibold))
                .foregroundStyle(.secondary)
            Text(bit.body)
                .zoomFont(.headline)

            if bit.origin != "manual" {
                Text("AI-generated")
                    .zoomFont(.caption2)
                    .zoomPadding(.horizontal, 6)
                    .zoomPadding(.vertical, 2)
                    .background(.quaternary, in: Capsule())
            }

            if let text = source?.sourceText, !text.isEmpty {
                DisclosureGroup("Where this came from") {
                    Text(text)
                        .zoomFont(.callout)
                        .foregroundStyle(.secondary)
                        .frame(maxWidth: .infinity, alignment: .leading)
                }
                .zoomFont(.caption)
            }
        }
    }

    private var noteField: some View {
        ZoomVStack(alignment: .leading, spacing: 4) {
            Text("Note (optional)")
                .zoomFont(.caption.weight(.semibold))
                .foregroundStyle(.secondary)
            TextField("Why approve or reject? Helps future cards.", text: $note, axis: .vertical)
                .lineLimit(2...5)
                .textFieldStyle(.roundedBorder)
                .onChange(of: note) {
                    if note.count > FocusTriageNote.maxCharacters {
                        note = String(note.prefix(FocusTriageNote.maxCharacters))
                    }
                }
        }
    }

    private var actions: some View {
        ZoomHStack(spacing: 12) {
            Button {
                pressed = .reject
                onReject()
            } label: {
                label("Reject", for: .reject)
            }
            .buttonStyle(.bordered)
            .tint(.red)

            Button {
                pressed = .approve
                onApprove()
            } label: {
                label("Approve", for: .approve)
            }
            .buttonStyle(.borderedProminent)
            .disabled(bit.variants.isEmpty)
        }
        .controlSize(.large)
        .disabled(isBusy)
        .zoomPadding()
        .background(.bar)
    }

    private func label(_ title: String, for decision: PendingReviewDecision) -> some View {
        ZoomHStack(spacing: 6) {
            if isBusy && pressed == decision {
                ProgressView()
            }

            Text(title).zoomFont(.headline)
        }
        .frame(maxWidth: .infinity, minHeight: 44)
    }
}
