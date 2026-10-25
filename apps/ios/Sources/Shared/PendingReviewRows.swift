import PostAnkiAPI
import SwiftUI

struct PendingReviewSourceHeader: View {
    let source: PendingReviewSource

    private var preview: String {
        let collapsed = (source.sourceText ?? "")
            .split(whereSeparator: \.isWhitespace)
            .joined(separator: " ")

        return collapsed.isEmpty ? "Untitled source" : collapsed
    }

    var body: some View {
        ZoomVStack(alignment: .leading, spacing: 2) {
            Text(source.subjectName ?? "No subject")
                .zoomFont(.subheadline.weight(.semibold))
            Text(preview)
                .lineLimit(2)
            Text(source.bits.count == 1 ? "1 item" : "\(source.bits.count) items")
        }
        .zoomFont(.caption)
        .textCase(nil)
    }
}

struct PendingReviewBitRow: View {
    let bit: PendingReviewBit
    var subjectName: String?
    let isBusy: Bool
    let message: String?
    let onDecide: (PendingReviewDecision) -> Void
    let onEdit: () -> Void

    var body: some View {
        ZoomVStack(alignment: .leading, spacing: 8) {
            if subjectName != nil || bit.origin == "manual" {
                HStack(alignment: .firstTextBaseline) {
                    if bit.origin == "manual" {
                        Text("Manual")
                            .zoomFont(.caption2)
                            .zoomPadding(.horizontal, 6)
                            .zoomPadding(.vertical, 2)
                            .background(.quaternary, in: Capsule())
                    }

                    Spacer(minLength: 8)

                    if let subjectName {
                        Text(subjectName)
                            .zoomFont(.caption)
                            .foregroundStyle(.secondary)
                            .multilineTextAlignment(.trailing)
                    }
                }
            }

            if bit.variants.isEmpty {
                Text("No questions yet")
                    .zoomFont(.subheadline)
                    .foregroundStyle(.secondary)
            } else {
                ForEach(bit.variants) { variant in
                    PendingReviewVariantBlock(variant: variant)
                }
            }

            if let background = bit.background, !background.isEmpty {
                Text(background)
                    .zoomFont(.caption)
                    .foregroundStyle(.secondary)
                    .lineLimit(3)
            }

            if isBusy {
                ProgressView()
            }

            if let message {
                Text(message)
                    .zoomFont(.caption)
                    .foregroundStyle(.red)
            }

            HStack {
                Button("Reject") { onDecide(.reject) }
                    .buttonStyle(.bordered)
                    .tint(.red)

                Button("Edit", action: onEdit)
                    .buttonStyle(.bordered)

                Spacer()

                Button("Approve") { onDecide(.approve) }
                    .buttonStyle(.borderedProminent)
                    .disabled(bit.variants.isEmpty)
            }
            .buttonStyle(.borderless)
            .disabled(isBusy)
        }
        .zoomPadding(.vertical, 4)
        .swipeActions(edge: .trailing, allowsFullSwipe: false) {
            Button("Reject") { onDecide(.reject) }
                .tint(.red)
                .disabled(isBusy)
        }
        .swipeActions(edge: .leading, allowsFullSwipe: false) {
            if !bit.variants.isEmpty {
                Button("Approve") { onDecide(.approve) }
                    .tint(.green)
                    .disabled(isBusy)
            }
        }
    }
}

struct PendingReviewVariantBlock: View {
    let variant: PendingReviewVariant

    var body: some View {
        ZoomVStack(alignment: .leading, spacing: 2) {
            Text(variant.kindLabel)
                .zoomFont(.caption2)
                .foregroundStyle(.secondary)
            Text(variant.prompt)
                .zoomFont(.subheadline)
            Text(variant.answer)
                .zoomFont(.subheadline)
                .foregroundStyle(.secondary)
        }
    }
}

struct PendingReviewSourceFooter: View {
    let readyCount: Int
    let isBulkBusy: Bool
    let message: String?
    let onApproveAll: () -> Void

    var body: some View {
        ZoomVStack(alignment: .leading, spacing: 6) {
            if readyCount > 1 || isBulkBusy {
                HStack {
                    Button("Approve all (\(readyCount))", action: onApproveAll)
                        .buttonStyle(.bordered)
                        .disabled(isBulkBusy)

                    if isBulkBusy {
                        ProgressView()
                    }
                }
            }

            if let message {
                Text(message)
                    .zoomFont(.caption)
                    .foregroundStyle(.secondary)
            }
        }
        .textCase(nil)
    }
}
