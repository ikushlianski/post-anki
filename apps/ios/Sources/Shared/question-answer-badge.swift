import SwiftUI

struct QuestionAnswerBadge: View {
    enum Kind: String {
        case question = "Q"
        case answer = "A"
    }

    let kind: Kind

    @ZoomMetric private var side: CGFloat = 20
    @ZoomMetric private var corner: CGFloat = 5

    var body: some View {
        Text(kind.rawValue)
            .zoomFont(.caption.weight(.bold).monospaced())
            .foregroundStyle(.secondary)
            .frame(width: side, height: side)
            .background(.quaternary, in: RoundedRectangle(cornerRadius: corner))
            .accessibilityHidden(true)
    }
}

struct QuestionAnswerRow<Content: View>: View {
    let kind: QuestionAnswerBadge.Kind
    var spacing: CGFloat = 8
    @ViewBuilder let content: Content

    var body: some View {
        ZoomHStack(alignment: .top, spacing: spacing) {
            QuestionAnswerBadge(kind: kind)
            content
                .frame(maxWidth: .infinity, alignment: .leading)
        }
    }
}
