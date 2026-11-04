import PostAnkiAPI
import SwiftUI

struct DueReviewTapSurface<Content: View>: View {
    let model: DueReviewModel
    @ViewBuilder let content: () -> Content

    var body: some View {
        GeometryReader { proxy in
            content()
                .frame(width: proxy.size.width, height: proxy.size.height)
                .contentShape(Rectangle())
                .onTapGesture { location in
                    handleTap(side: ReviewTapSide.side(x: location.x, width: proxy.size.width))
                }
        }
        .accessibilityActions {
            ForEach(DueReviewGradeOptions.options(rehearsal: model.current?.isRehearsal == true), id: \.grade) { option in
                Button(option.title) { grade(option.grade) }
            }
        }
    }

    private func handleTap(side: ReviewTapSide) {
        switch ReviewTapGrading.action(isRevealed: model.isRevealed, isGrading: model.isGrading, side: side) {
        case .reveal:
            model.reveal()
        case .grade(let grade):
            submit(grade)
        case .ignore:
            break
        }
    }

    private func grade(_ grade: ReviewGrade) {
        guard model.isRevealed, !model.isGrading else { return }

        submit(grade)
    }

    private func submit(_ grade: ReviewGrade) {
        Task { await model.grade(grade) }
    }
}
