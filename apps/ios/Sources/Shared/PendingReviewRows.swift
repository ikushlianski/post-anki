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
        VStack(alignment: .leading, spacing: 2) {
            Text(source.subjectName ?? "No subject")
                .font(.subheadline.weight(.semibold))
            Text(preview)
                .lineLimit(2)
            Text(source.bits.count == 1 ? "1 item" : "\(source.bits.count) items")
        }
        .font(.caption)
        .textCase(nil)
    }
}

struct PendingReviewBitRow: View {
    let bit: PendingReviewBit
    let isBusy: Bool
    let message: String?
    let onDecide: (PendingReviewDecision) -> Void
    let onEdit: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .firstTextBaseline) {
                Text(bit.body)
                    .font(.headline)

                if bit.origin == "manual" {
                    Text("Manual")
                        .font(.caption2)
                        .padding(.horizontal, 6)
                        .padding(.vertical, 2)
                        .background(.quaternary, in: Capsule())
                }
            }

            if let background = bit.background, !background.isEmpty {
                Text(background)
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }

            if bit.variants.isEmpty {
                Text("No questions yet")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            } else {
                ForEach(bit.variants) { variant in
                    PendingReviewVariantBlock(variant: variant)
                }
            }

            if isBusy {
                ProgressView()
            }

            if let message {
                Text(message)
                    .font(.caption)
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
        .padding(.vertical, 4)
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
        VStack(alignment: .leading, spacing: 2) {
            Text(variant.kindLabel)
                .font(.caption2)
                .foregroundStyle(.secondary)
            Text(variant.prompt)
                .font(.subheadline)
            Text(variant.answer)
                .font(.subheadline)
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
        VStack(alignment: .leading, spacing: 6) {
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
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
        .textCase(nil)
    }
}
