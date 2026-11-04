import PostAnkiAPI
import SwiftUI

enum FocusTriageCardSection: Equatable {
    case question
    case answer
    case example
}

struct FocusTriageCardParts: Equatable {
    let context: String?
    let front: String?
    let back: String?
    let example: String?
    let exampleIsAI: Bool
    let sourceName: String
    let sourceText: String?

    init(bit: PendingReviewBit, source: PendingReviewSource?, selectedIndex: Int = 0) {
        let variant = Self.shownVariant(bit: bit, selectedIndex: selectedIndex)
        let trimmedExample = bit.background?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        let text = source?.sourceText ?? ""

        context = variant?.face.context
        front = variant?.face.front
        back = variant?.answer
        example = trimmedExample.isEmpty ? nil : trimmedExample
        exampleIsAI = !trimmedExample.isEmpty && bit.exampleAiGeneratedAt != nil
        sourceName = source?.subjectName ?? "No subject"
        sourceText = text.isEmpty ? nil : text
    }

    static func varies(_ bit: PendingReviewBit) -> Bool {
        bit.offersSentenceChoice && TriageVariantFronts.differ(bit.variants)
    }

    private static func shownVariant(bit: PendingReviewBit, selectedIndex: Int) -> PendingReviewVariant? {
        if varies(bit) { return TriageVariantFronts.variant(in: bit.variants, at: selectedIndex) }

        return PendingReviewTriageSelection.bestVariant(in: bit.variants)
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
    var isWritingExample = false
    var selectedIndex = 0
    var onSelect: ((Int) -> Void)?
    var onScrollEdgeChange: ((FocusTriageScrollEdge) -> Void)?
    let onEdit: () -> Void
    var onRefresh: (() async -> Void)?
    var onResolveDuplicate: ((Bool) async -> Bool)?

    private var parts: FocusTriageCardParts { FocusTriageCardParts(bit: bit, source: source, selectedIndex: selectedIndex) }

    var body: some View {
        ScrollView {
            ZoomVStack(alignment: .leading, spacing: 16) {
                Text(parts.sourceName.uppercased())
                    .zoomFont(.caption.weight(.semibold))
                    .foregroundStyle(.secondary)

                FocusTriageSubjectSuggestion(bit: bit, source: source)

                ModelBadges(modelIds: bit.modelIds)

                if let duplicate = bit.duplicateOf, let onResolveDuplicate {
                    FocusTriageDuplicateSection(duplicate: duplicate, message: message, onResolve: onResolveDuplicate)
                }

                editableArea
                sentenceOptions
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
            .textSelection(.enabled)
            .zoomPadding()
            .readingScrollContentFrame()
        }
        .refreshable { await onRefresh?() }
        .scrollDismissesKeyboard(.interactively)
        .trackingScrollEdge { onScrollEdgeChange?($0) }
    }

    private var editableArea: some View {
        ZoomVStack(alignment: .leading, spacing: 20) {
            CardContextLine(text: parts.context)

            QuestionAnswerRow(kind: .question, spacing: 10) {
                Text(parts.front ?? "")
                    .zoomFont(.title.weight(.semibold))
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .fixedSize(horizontal: false, vertical: true)
                    .textSelection(.enabled)
                    .copyMenu(parts.front)
                    .accessibilityLabel("Question: \(parts.front ?? "")")
            }

            if !bit.offersSentenceChoice || FocusTriageCardParts.varies(bit) {
                QuestionAnswerRow(kind: .answer, spacing: 10) {
                    Text(TargetPhraseHighlight.attributed(parts.back ?? "", phrase: bit.body))
                        .zoomFont(.title2)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .fixedSize(horizontal: false, vertical: true)
                        .textSelection(.enabled)
                        .copyMenu(parts.back)
                        .accessibilityLabel("Answer:\(parts.back ?? "")")
                }
            }

            AiSuggestionBlock(suggestion: bit.aiSuggestion, original: bit.body)

            if isWritingExample {
                ZoomHStack(spacing: 8) {
                    ProgressView()
                    Text("Writing example…")
                        .zoomFont(.footnote)
                        .foregroundStyle(.secondary)
                }
                .accessibilityElement(children: .combine)
            } else if let example = parts.example {
                TriageExampleBlock(text: example, isAI: parts.exampleIsAI)
            }

            CopyAllButton(parts: CardCopyText.triageParts(parts, suggestion: bit.aiSuggestion, original: bit.body))
        }
        .contentShape(Rectangle())
        .cardCopyMenu(question: parts.front, answer: parts.back)
        .onTapGesture(perform: onEdit)
        .accessibilityElement(children: .contain)
        .accessibilityAddTraits(.isButton)
        .accessibilityHint("Opens the editor")
    }

    @ViewBuilder
    private var sentenceOptions: some View {
        if FocusTriageCardParts.varies(bit) {
            TriageVariantIndicator(index: selectedIndex, count: bit.variants.count, onSelect: { onSelect?($0) })
        } else if bit.offersSentenceChoice {
            FocusTriageSentenceOptions(variants: bit.variants, phrase: bit.body, selectedIndex: selectedIndex, onSelect: { onSelect?($0) })
        }
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
                        .textSelection(.enabled)
                        .copyMenu(text)
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
                    if note.utf16.count > FocusTriageNote.maxUnits {
                        note = FocusTriageNote.clamped(note)
                    }
                }
        }
    }
}
