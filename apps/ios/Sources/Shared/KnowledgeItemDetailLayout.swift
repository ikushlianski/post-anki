import CoreGraphics

enum KnowledgeItemDetailLayout {
    static let maxContentWidth: CGFloat = 760

    static func contentWidth(available: CGFloat) -> CGFloat {
        min(available, maxContentWidth)
    }
}
