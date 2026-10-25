import PostAnkiAPI
import SwiftUI

enum FocusTriageCardSection: Equatable {
    case question
    case answer
    case example
}

struct FocusTriageCardParts: Equatable {
    let front: String?
    let back: String?
    let example: String?
    let sourceName: String
    let sourceText: String?

    init(bit: PendingReviewBit, source: PendingReviewSource?) {
        let variant = PendingReviewTriageSelection.bestVariant(in: bit.variants)
        let trimmedExample = bit.background?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        let text = source?.sourceText ?? ""

        front = variant?.prompt
        back = variant?.answer
        example = trimmedExample.isEmpty ? nil : trimmedExample
        sourceName = source?.subjectName ?? "No subject"
        sourceText = text.isEmpty ? nil : text
    }

    var sections: [FocusTriageCardSection] {
        [.question, .answer] + (example == nil ? [] : [.example])
    }
}

struct FocusTriageCard: View {
    let bit: PendingReviewBit
    let source: PendingReviewSource?
    @Binding var note: String
    let message: String?
    let onEdit: () -> Void

    private var parts: FocusTriageCardParts { FocusTriageCardParts(bit: bit, source: source) }

    var body: some View {
        ScrollView {
            ZoomVStack(alignment: .leading, spacing: 16) {
                Text(parts.sourceName.uppercased())
                    .zoomFont(.caption.weight(.semibold))
                    .foregroundStyle(.secondary)

                editableArea
                sourceDisclosure
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
    }

    private var editableArea: some View {
        ZoomVStack(alignment: .leading, spacing: 12) {
            Text(parts.front ?? "")
                .zoomFont(.title2.weight(.semibold))
                .frame(maxWidth: .infinity, alignment: .leading)
                .fixedSize(horizontal: false, vertical: true)
                .accessibilityLabel("Question: \(parts.front ?? "")")

            Text(parts.back ?? "")
                .zoomFont(.body)
                .frame(maxWidth: .infinity, alignment: .leading)
                .fixedSize(horizontal: false, vertical: true)
                .accessibilityLabel("Answer: \(parts.back ?? "")")

            if let example = parts.example {
                Text(example)
                    .zoomFont(.footnote)
                    .foregroundStyle(.secondary)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .fixedSize(horizontal: false, vertical: true)
                    .accessibilityLabel("Example: \(example)")
            }
        }
        .contentShape(Rectangle())
        .onTapGesture(perform: onEdit)
        .accessibilityElement(children: .contain)
        .accessibilityAddTraits(.isButton)
        .accessibilityHint("Opens the editor")
    }

    @ViewBuilder
    private var sourceDisclosure: some View {
        if let text = parts.sourceText {
            DisclosureGroup("Original source") {
                ZoomVStack(alignment: .leading, spacing: 4) {
                    Text(parts.sourceName)
                        .zoomFont(.caption.weight(.semibold))
                    Text(text)
                        .zoomFont(.callout)
                        .foregroundStyle(.secondary)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            .zoomFont(.caption)
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
}
