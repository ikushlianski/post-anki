import PostAnkiAPI
#if canImport(UIKit)
import UIKit
#endif

@MainActor
enum TriageFeedbackPlayer {
    static func announce(_ announcement: TriageAnnouncement) {
        announce(message: announcement.message)
    }

    static func announce(message: String) {
        #if canImport(UIKit)
        UIAccessibility.post(notification: .announcement, argument: message)
        #endif
    }

    static func haptic(for decision: TriageSwipeDecision) {
        #if canImport(UIKit)
        switch TriageHapticKind.kind(for: decision) {
        case .success: UINotificationFeedbackGenerator().notificationOccurred(.success)
        case .warning: UINotificationFeedbackGenerator().notificationOccurred(.warning)
        case .lightImpact: UIImpactFeedbackGenerator(style: .light).impactOccurred()
        case .rigidImpact: UIImpactFeedbackGenerator(style: .rigid).impactOccurred()
        }
        #endif
    }
}
