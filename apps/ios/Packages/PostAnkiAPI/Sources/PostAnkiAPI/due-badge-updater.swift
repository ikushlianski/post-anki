public enum BadgeAuthorization: Sendable, Equatable {
    case notDetermined
    case granted
    case denied
}

public protocol BadgeCenter: Sendable {
    func authorization() async -> BadgeAuthorization
    func requestAuthorization() async -> Bool
    func setBadge(_ count: Int) async
}

public actor DueBadgeUpdater {
    public static let maxBadge = 99_999

    private let center: BadgeCenter
    private var askedThisLaunch = false

    public init(center: BadgeCenter) {
        self.center = center
    }

    public static func badgeValue(forDue due: Int) -> Int {
        min(max(0, due), maxBadge)
    }

    public func update(due: Int) async {
        guard await isAllowed(due: due) else { return }

        await center.setBadge(Self.badgeValue(forDue: due))
    }

    public func clear() async {
        guard await center.authorization() == .granted else { return }

        await center.setBadge(0)
    }

    private func isAllowed(due: Int) async -> Bool {
        switch await center.authorization() {
        case .granted:
            return true
        case .denied:
            return false
        case .notDetermined:
            guard due > 0, !askedThisLaunch else { return false }

            askedThisLaunch = true

            return await center.requestAuthorization()
        }
    }
}
