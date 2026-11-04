import SwiftUI

struct QuestionAnswerBadge: View {
    enum Kind: String {
        case question = "Question"
        case answer = "Answer"
    }

    let kind: Kind

    var body: some View {
        Text(kind.rawValue)
            .zoomFont(.caption2.weight(.semibold))
            .foregroundStyle(.secondary)
            .accessibilityHidden(true)
    }
}

struct QuestionAnswerRow<Content: View>: View {
    let kind: QuestionAnswerBadge.Kind
    var spacing: CGFloat = 8
    @ViewBuilder let content: Content

    var body: some View {
        ZoomVStack(alignment: .leading, spacing: min(spacing, 4)) {
            QuestionAnswerBadge(kind: kind)
            content
                .frame(maxWidth: .infinity, alignment: .leading)
        }
    }
}
