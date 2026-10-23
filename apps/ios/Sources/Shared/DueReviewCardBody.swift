import PostAnkiAPI
import SwiftUI

struct DueReviewCardBody<AnswerInput: View, RevealedFooter: View, Unrevealed: View>: View {
    let model: DueReviewModel
    let card: ReviewCard
    @ViewBuilder let answerInput: () -> AnswerInput
    @ViewBuilder let revealedFooter: () -> RevealedFooter
    @ViewBuilder let unrevealed: () -> Unrevealed

    var body: some View {
        ZoomVStack(alignment: .leading, spacing: 16) {
            if let notice = model.notice {
                Text(notice)
                    .zoomFont(.footnote)
                    .foregroundStyle(.secondary)
            }

            Text(DueReviewModel.displayPrompt(card))
                .zoomFont(.title3)

            answerInput()

            if model.isRevealed {
                Divider()

                Text(card.answer)
                    .zoomFont(.title3.weight(.semibold))

                if let background = card.background {
                    Text(background)
                        .zoomFont(.subheadline)
                        .foregroundStyle(.secondary)
                }

                DueReviewGradeButtons(preview: card.intervalPreview, isDisabled: model.isGrading) { grade in
                    Task { await model.grade(grade) }
                }

                revealedFooter()
            } else {
                unrevealed()
            }

            gradeErrorView

            if model.reviewedCount > 0 {
                Text("\(model.reviewedCount) reviewed this session")
                    .zoomFont(.footnote)
                    .foregroundStyle(.secondary)
            }

            DueReviewPendingCaption(count: model.pendingCount)
        }
        .zoomPadding()
        .frame(maxWidth: .infinity, alignment: .leading)
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
