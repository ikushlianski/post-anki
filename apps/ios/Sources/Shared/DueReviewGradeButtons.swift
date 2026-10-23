import PostAnkiAPI
import SwiftUI

struct DueReviewGradeButtons: View {
    let preview: IntervalPreview
    let isDisabled: Bool
    let onGrade: (ReviewGrade) -> Void

    var body: some View {
        ZoomHStack(spacing: 8) {
            ForEach(ReviewGrade.allCases, id: \.self) { grade in
                Button {
                    onGrade(grade)
                } label: {
                    ZoomVStack(spacing: 2) {
                        Text(IntervalFormat.short(seconds: preview.seconds(for: grade)))
                            .zoomFont(.caption2)
                            .foregroundStyle(.secondary)
                        Text(grade.rawValue.capitalized)
                    }
                    .frame(maxWidth: .infinity)
                }
                .accessibilityLabel(
                    "\(grade.rawValue.capitalized), next in \(IntervalFormat.spoken(seconds: preview.seconds(for: grade)))"
                )
                .buttonStyle(.bordered)
                .disabled(isDisabled)
                #if os(macOS)
                .keyboardShortcut(Self.shortcutKey(for: grade), modifiers: [])
                #endif
            }
        }
    }

    #if os(macOS)
    private static func shortcutKey(for grade: ReviewGrade) -> KeyEquivalent {
        let index = ReviewGrade.allCases.firstIndex(of: grade) ?? 0

        return KeyEquivalent(Character(String(index + 1)))
    }
    #endif
}
