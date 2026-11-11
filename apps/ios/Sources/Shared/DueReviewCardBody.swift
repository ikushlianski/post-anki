import PostAnkiAPI
import SwiftUI

struct DueReviewCardBody<AnswerInput: View, RevealedFooter: View, Unrevealed: View>: View {
    @Environment(\.zoomScale) private var zoomScale
    let model: DueReviewModel
    let card: ReviewCard
    var showsGradeButtons = true
    var showsReviewedCount = true
    var showsKeyHints = false
    var showsProgress = false
    @ViewBuilder let answerInput: () -> AnswerInput
    @ViewBuilder let revealedFooter: () -> RevealedFooter
    @ViewBuilder let unrevealed: () -> Unrevealed

    var body: some View {
        ZoomVStack(alignment: .leading, spacing: 16) {
            if let caption = model.packCaption {
                Text(caption)
                    .zoomFont(.footnote)
                    .foregroundStyle(.secondary)
            }

            if let notice = model.notice {
                Text(notice)
                    .zoomFont(.footnote)
                    .foregroundStyle(.secondary)
            }

            ZoomVStack(alignment: .leading, spacing: 6) {
                if card.isRehearsal {
                    Text(DueReviewGradeOptions.rehearsalLabel)
                        .zoomFont(.caption.weight(.medium))
                        .foregroundStyle(.secondary)
                }

                if showsProgress, let header = progressHeader {
                    Text(header)
                        .zoomFont(.caption.weight(.medium))
                        .foregroundStyle(.secondary)
                }

                CardContextLine(text: card.face.context)

                CardRichText(text: card.face.front, font: .title3) {
                    Text(card.face.front)
                        .zoomFont(.title3)
                        .textSelection(.enabled)
                }
            }

            answerInput()

            if model.isRevealed {
                Divider()

                let answerText = card.filledSentence ?? card.answer

                CardRichText(text: answerText, font: .title3.weight(.semibold)) {
                    Text(answerText)
                        .zoomFont(.title3.weight(.semibold))
                        .textSelection(.enabled)
                }

                AiSuggestionBlock(suggestion: card.aiSuggestion, original: card.originalPhrase)

                if let background = card.background {
                    Text(background)
                        .zoomFont(.subheadline)
                        .foregroundStyle(.secondary)
                        .textSelection(.enabled)
                }

                CopyAllButton(parts: CardCopyText.reviewParts(card))

                if showsGradeButtons, card.isRehearsal {
                    DueReviewRehearsalButtons(isDisabled: model.isGrading) { grade in
                        Task { await model.grade(grade) }
                    }
                } else if showsGradeButtons {
                    DueReviewGradeButtons(preview: card.intervalPreview, isDisabled: model.isGrading, showsKeyHints: showsKeyHints) { grade in
                        Task { await model.grade(grade) }
                    }
                }

                revealedFooter()
            } else {
                unrevealed()
            }

            gradeErrorView

            if showsReviewedCount, model.reviewedCount > 0 {
                Text("\(model.reviewedCount) reviewed this session")
                    .zoomFont(.footnote)
                    .foregroundStyle(.secondary)
            }

        }
        .textSelection(.enabled)
        .zoomPadding(20)
        .background(FocusTriageCardStyle.fill, in: RoundedRectangle(cornerRadius: FocusTriageCardStyle.cornerRadius, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: FocusTriageCardStyle.cornerRadius, style: .continuous)
                .strokeBorder(Color.primary.opacity(0.12), lineWidth: 1)
        }
        .frame(maxWidth: 560 * CGFloat(zoomScale), alignment: .leading)
        .zoomPadding(FocusTriageCardStyle.margin)
        .frame(maxWidth: .infinity, alignment: .center)
    }

    private var progressHeader: String? {
        let parts = [model.subjectName, model.progressLabel].compactMap { $0 }

        return parts.isEmpty ? nil : parts.joined(separator: " · ")
    }

    @ViewBuilder
    private var gradeErrorView: some View {
        if let error = model.gradeError {
            ZoomVStack(alignment: .leading, spacing: 8) {
                Text(error)
                    .zoomFont(.footnote)
                    .foregroundStyle(.red)

                if model.isRevealed, let failed = model.failedGrade {
                    Button("Retry") {
                        Task { await model.grade(failed) }
                    }
                    .buttonStyle(.bordered)
                    .disabled(model.isGrading)
                }
            }
        }
    }
}
