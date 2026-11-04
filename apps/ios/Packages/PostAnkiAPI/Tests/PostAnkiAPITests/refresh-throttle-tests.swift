import Foundation
import Testing
@testable import PostAnkiAPI

@Suite("Refresh throttle")
struct RefreshThrottleTests {
    @Test("returning to the app twice within 10 seconds refreshes only once")
    func throttles() {
        var now = Date(timeIntervalSince1970: 1000)
        var throttle = RefreshThrottle(clock: { now })

        let first = throttle.shouldRun()

        now = now.addingTimeInterval(5)

        let second = throttle.shouldRun()

        #expect(first)
        #expect(!second)
    }

    @Test("returning to the app after 10 seconds refreshes again")
    func runsAfterInterval() {
        var now = Date(timeIntervalSince1970: 1000)
        var throttle = RefreshThrottle(clock: { now })

        let first = throttle.shouldRun()

        now = now.addingTimeInterval(10)

        let second = throttle.shouldRun()

        #expect(first)
        #expect(second)
    }
}
