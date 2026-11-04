import CoreGraphics

enum FocusTriageVerticalAction: Equatable {
    case inbox
    case chat
}

struct FocusTriageScrollEdge: Equatable {
    var atTop = false
    var atBottom = false

    static let tolerance: CGFloat = 2

    static func measure(contentMinY: CGFloat, contentHeight: CGFloat, viewportHeight: CGFloat) -> FocusTriageScrollEdge {
        guard viewportHeight > 0, contentHeight > 0 else { return FocusTriageScrollEdge() }

        return FocusTriageScrollEdge(
            atTop: contentMinY >= -tolerance,
            atBottom: contentMinY + contentHeight <= viewportHeight + tolerance
        )
    }
}

enum FocusTriageVertical {
    static let threshold: CGFloat = 96
    static let flingThreshold: CGFloat = 300
    static let flingMinimum: CGFloat = 48
    static let dominance: CGFloat = 2

    static func direction(height: CGFloat) -> FocusTriageVerticalAction? {
        if height > 0 { return .inbox }

        return height < 0 ? .chat : nil
    }

    static func isEdgeClear(for action: FocusTriageVerticalAction, edge: FocusTriageScrollEdge) -> Bool {
        action == .inbox ? edge.atTop : edge.atBottom
    }

    static func action(
        translation: CGSize,
        predictedHeight: CGFloat,
        start: FocusTriageScrollEdge,
        end: FocusTriageScrollEdge
    ) -> FocusTriageVerticalAction? {
        let height = translation.height

        guard let action = direction(height: height) else { return nil }
        guard abs(height) >= dominance * abs(translation.width) else { return nil }
        guard isEdgeClear(for: action, edge: start), isEdgeClear(for: action, edge: end) else { return nil }

        if abs(height) >= threshold { return action }

        let sameDirection = (predictedHeight > 0) == (height > 0)

        if sameDirection, abs(predictedHeight) >= flingThreshold, abs(height) >= flingMinimum { return action }

        return nil
    }
}

struct FocusTriageExtraUndo: Equatable {
    enum Kind: Equatable {
        case inbox
        case chat
        case example(text: String, previous: String?)
    }

    let bitId: String
    let kind: Kind
    let afterDecisionBitId: String?

    func isNext(lastDecidedBitId: String?, decidedBitIds: [String]) -> Bool {
        guard let marker = afterDecisionBitId else { return lastDecidedBitId == nil }

        return lastDecidedBitId == marker || !decidedBitIds.contains(marker)
    }
}
