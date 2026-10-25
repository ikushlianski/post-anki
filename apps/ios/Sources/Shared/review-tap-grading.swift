import CoreGraphics
import PostAnkiAPI

enum ReviewTapSide: Equatable {
    case left
    case right

    static func side(x: CGFloat, width: CGFloat) -> ReviewTapSide {
        x >= width / 2 ? .right : .left
    }
}

enum ReviewTapAction: Equatable {
    case reveal
    case grade(ReviewGrade)
    case ignore
}

enum ReviewTapGrading {
    static func grade(for side: ReviewTapSide) -> ReviewGrade {
        side == .right ? .good : .again
    }

    static func action(isRevealed: Bool, isGrading: Bool, side: ReviewTapSide) -> ReviewTapAction {
        guard !isGrading else { return .ignore }

        return isRevealed ? .grade(grade(for: side)) : .reveal
    }
}
