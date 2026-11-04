import PostAnkiAPI
import SwiftUI

struct DueReviewRehearsalButtons: View {
    @AppStorage(AnswerButtonSizeStore.key) private var sizeRaw = AnswerButtonSize.defaultSize.rawValue

    let isDisabled: Bool
    let onGrade: (ReviewGrade) -> Void

    var body: some View {
        ZoomHStack(spacing: 8) {
            ForEach(DueReviewGradeOptions.rehearsalOrdered, id: \.grade) { option in
                Button(option.title) { onGrade(option.grade) }
                    .frame(maxWidth: .infinity, minHeight: buttonHeight)
                    .buttonStyle(.bordered)
                    .tint(DueReviewGradeOptions.tint(for: option.grade))
                    .disabled(isDisabled)
                    #if os(macOS)
                    .keyboardShortcut(option.grade == .good ? "2" : "1", modifiers: [])
                    #endif
            }
        }
    }

    private var buttonHeight: CGFloat {
        max((AnswerButtonSize(rawValue: sizeRaw) ?? .defaultSize).height, AnswerButtonLayout.minHeight)
    }
}
