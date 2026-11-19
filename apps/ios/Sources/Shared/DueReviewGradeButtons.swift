import PostAnkiAPI
import SwiftUI

struct DueReviewGradeButtons: View {
    @State private var graded: ReviewGrade?
    @AppStorage(AnswerButtonSizeStore.key) private var sizeRaw = AnswerButtonSize.defaultSize.rawValue

    let preview: IntervalPreview
    let isDisabled: Bool
    var showsKeyHints = false
    var onKnown: (() -> Void)?
    let onGrade: (ReviewGrade) -> Void

    var body: some View {
        ZoomHStack(spacing: 8) {
            ForEach(ReviewGrade.allCases, id: \.self) { grade in
                if grade == .easy, let onKnown {
                    knownButton(onKnown)
                }

                Button {
                    graded = grade
                    onGrade(grade)
                } label: {
                    ZoomVStack(spacing: 2) {
                        Text(IntervalFormat.short(seconds: preview.seconds(for: grade)))
                            .zoomFont(.caption2)
                            .foregroundStyle(.secondary)
                        HStack(spacing: 4) {
                            if showsKeyHints {
                                Text(Self.keyHint(for: grade))
                                    .zoomFont(.caption.monospaced())
                                    .foregroundStyle(.secondary)
                            }

                            Text(grade.rawValue.capitalized)
                        }
                    }
                    .frame(maxWidth: .infinity, minHeight: buttonHeight)
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
        .sensoryFeedback(trigger: graded) { _, new in new.map(Self.feedback(for:)) }
    }

    private func knownButton(_ action: @escaping () -> Void) -> some View {
        Button(action: action) {
            ZoomVStack(spacing: 2) {
                Image(systemName: "checkmark.seal.fill")
                    .zoomFont(.caption2)
                    .foregroundStyle(.green)
                HStack(spacing: 4) {
                    if showsKeyHints {
                        Text("K")
                            .zoomFont(.caption.monospaced())
                            .foregroundStyle(.secondary)
                    }

                    Text("Known")
                }
            }
            .frame(maxWidth: .infinity, minHeight: buttonHeight)
        }
        .buttonStyle(.bordered)
        .tint(.green)
        .disabled(isDisabled)
        .accessibilityIdentifier("due-review-known")
        .accessibilityLabel("I already know it")
        .accessibilityHint("Hides this card for 6 to 12 months")
    }

    private var buttonHeight: CGFloat {
        max((AnswerButtonSize(rawValue: sizeRaw) ?? .defaultSize).height, AnswerButtonLayout.minHeight)
    }

    static func keyHint(for grade: ReviewGrade) -> String {
        String((ReviewGrade.allCases.firstIndex(of: grade) ?? 0) + 1)
    }

    static func feedback(for grade: ReviewGrade) -> SensoryFeedback {
        switch ReviewGradeHaptic.kind(for: grade) {
        case .strong: .impact(weight: .heavy)
        case .light: .impact(weight: .light)
        }
    }

    #if os(macOS)
    private static func shortcutKey(for grade: ReviewGrade) -> KeyEquivalent {
        let index = ReviewGrade.allCases.firstIndex(of: grade) ?? 0

        return KeyEquivalent(Character(String(index + 1)))
    }
    #endif
}
