import Foundation
import PostAnkiAPI
#if os(iOS)
import UserNotifications
#endif

struct SystemBadgeCenter: BadgeCenter {
    func authorization() async -> BadgeAuthorization {
        #if os(iOS)
        let settings = await UNUserNotificationCenter.current().notificationSettings()

        switch settings.authorizationStatus {
        case .notDetermined: return .notDetermined
        case .denied: return .denied
        default: return settings.badgeSetting == .enabled ? .granted : .denied
        }
        #else
        return .denied
        #endif
    }

    func requestAuthorization() async -> Bool {
        #if os(iOS)
        return (try? await UNUserNotificationCenter.current().requestAuthorization(options: [.badge])) ?? false
        #else
        return false
        #endif
    }

    func setBadge(_ count: Int) async {
        #if os(iOS)
        try? await UNUserNotificationCenter.current().setBadgeCount(count)
        #endif
    }
}

enum DueBadge {
    static let updater = DueBadgeUpdater(center: SystemBadgeCenter())

    static func dueTotal(_ counts: ReviewCounts) -> Int { counts.review + counts.learning }

    static func refresh() async {
        guard TokenStore.read() != nil,
              let response = try? await APIClient.reviewCards(limit: 1, tz: TimeZone.current.identifier) else { return }

        await updater.update(due: dueTotal(response.counts))
    }
}
