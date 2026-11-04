import Testing
@testable import PostAnkiAPI

private final class FakeBadgeCenter: BadgeCenter, @unchecked Sendable {
    var status: BadgeAuthorization
    var grantOnRequest: Bool
    var requests = 0
    var badges: [Int] = []

    init(status: BadgeAuthorization, grantOnRequest: Bool = true) {
        self.status = status
        self.grantOnRequest = grantOnRequest
    }

    func authorization() async -> BadgeAuthorization { status }

    func requestAuthorization() async -> Bool {
        requests += 1
        status = grantOnRequest ? .granted : .denied

        return grantOnRequest
    }

    func setBadge(_ count: Int) async { badges.append(count) }
}

@Suite("Due badge updater")
struct DueBadgeUpdaterTests {
    @Test("should show the due count on the icon when badges are allowed")
    func granted() async {
        let center = FakeBadgeCenter(status: .granted)

        await DueBadgeUpdater(center: center).update(due: 12)

        #expect(center.badges == [12])
        #expect(center.requests == 0)
    }

    @Test("should do nothing when the user denied badges")
    func denied() async {
        let center = FakeBadgeCenter(status: .denied)
        let updater = DueBadgeUpdater(center: center)

        await updater.update(due: 12)
        await updater.clear()

        #expect(center.badges.isEmpty)
        #expect(center.requests == 0)
    }

    @Test("should ask once for badge permission and set the badge when allowed")
    func asksOnce() async {
        let center = FakeBadgeCenter(status: .notDetermined)
        let updater = DueBadgeUpdater(center: center)

        await updater.update(due: 3)
        await updater.update(due: 4)

        #expect(center.requests == 1)
        #expect(center.badges == [3, 4])
    }

    @Test("should not ask for permission while nothing is due, and ask once something is")
    func noAskWhenNothingDue() async {
        let center = FakeBadgeCenter(status: .notDetermined)
        let updater = DueBadgeUpdater(center: center)

        await updater.update(due: 0)

        #expect(center.requests == 0)
        #expect(center.badges.isEmpty)

        await updater.update(due: 2)

        #expect(center.requests == 1)
        #expect(center.badges == [2])
    }

    @Test("should stay silent and not ask again when the prompt is declined")
    func declinedPrompt() async {
        let center = FakeBadgeCenter(status: .notDetermined, grantOnRequest: false)
        let updater = DueBadgeUpdater(center: center)

        await updater.update(due: 3)
        await updater.update(due: 4)

        #expect(center.requests == 1)
        #expect(center.badges.isEmpty)
    }

    @Test("should clear the badge to zero when nothing is due or the user signs out")
    func clears() async {
        let center = FakeBadgeCenter(status: .granted)
        let updater = DueBadgeUpdater(center: center)

        await updater.update(due: 0)
        await updater.clear()

        #expect(center.badges == [0, 0])
    }

    @Test("should keep the badge value within sensible bounds")
    func bounds() {
        #expect(DueBadgeUpdater.badgeValue(forDue: -4) == 0)
        #expect(DueBadgeUpdater.badgeValue(forDue: 250_000) == 99_999)
        #expect(DueBadgeUpdater.badgeValue(forDue: 7) == 7)
    }
}
