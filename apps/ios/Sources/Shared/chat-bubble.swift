import SwiftUI

struct ChatBubble: View {
    let text: String
    let isUser: Bool

    @Environment(\.zoomScale) private var scale

    var body: some View {
        ChatBubbleWidthLayout(fraction: 0.75, isUser: isUser) {
            Text(text)
                .zoomFont(.body)
                .textSelection(.enabled)
                .foregroundStyle(isUser ? Color.white : Color.primary)
                .zoomPadding(.horizontal, 12)
                .zoomPadding(.vertical, 10)
                .background(
                    isUser ? Color.accentColor : Color.secondary.opacity(0.18),
                    in: shape
                )
        }
    }

    private var shape: UnevenRoundedRectangle {
        let big = 16 * CGFloat(scale)
        let tail = 4 * CGFloat(scale)

        return UnevenRoundedRectangle(
            topLeadingRadius: big,
            bottomLeadingRadius: isUser ? big : tail,
            bottomTrailingRadius: isUser ? tail : big,
            topTrailingRadius: big,
            style: .continuous
        )
    }
}

struct ChatBubbleWidthLayout: Layout {
    let fraction: CGFloat
    let isUser: Bool

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let width = proposal.width ?? 400
        let size = subviews.first?.sizeThatFits(ProposedViewSize(width: width * fraction, height: nil)) ?? .zero

        return CGSize(width: width, height: size.height)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        guard let subview = subviews.first else { return }

        let size = subview.sizeThatFits(ProposedViewSize(width: bounds.width * fraction, height: nil))
        let x = isUser ? bounds.maxX - size.width : bounds.minX

        subview.place(at: CGPoint(x: x, y: bounds.minY), anchor: .topLeading, proposal: ProposedViewSize(size))
    }
}
