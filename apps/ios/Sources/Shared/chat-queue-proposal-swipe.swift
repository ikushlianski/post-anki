import CoreGraphics
import PostAnkiAPI

enum ChatQueueProposalSwipe {
    static let macThreshold: CGFloat = 120

    #if os(macOS)
    static let platformIsMac = true
    #else
    static let platformIsMac = false
    #endif

    static func decision(width: CGFloat, predictedWidth: CGFloat, isMac: Bool = platformIsMac) -> ChatQueueProposalDecision? {
        if isMac {
            guard abs(width) >= macThreshold else { return nil }

            return width > 0 ? .accept : .reject
        }

        return FocusTriageSwipe.decision(width: width, predictedWidth: predictedWidth).map(ChatQueueProposalDecision.init(swipe:))
    }

    static func isHorizontal(_ translation: CGSize) -> Bool {
        abs(translation.width) > abs(translation.height)
    }
}
