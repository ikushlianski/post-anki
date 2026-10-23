import Foundation
import Testing

extension SmokeTests {
    @MainActor
    @Suite("Home and review load from a fake server")
    struct HomeAndReviewSmokeTests {
        @Test("should show the streak and top subjects on home when the server answers")
        func homeSummaryLoads() async throws {
            let session = FakeServerSession([
                "/home/summary": .fixture("home-summary"),
                "/streak": .fixture("streak")
            ])
            defer { session.end() }

            let model = HomeSummaryModel()

            await model.load()

            #expect(model.summary?.topSubjects.count == 2)
            #expect(model.summary?.funStats.currentStreak == 4)
            #expect(model.streak?.longestStreak == 19)
            #expect(model.failure == nil)
        }

        @Test("should total new, learning and review cards into the due count")
        func dueCountsLoad() async throws {
            let session = FakeServerSession(["/knowledge-bits/review-cards": .fixture("review-cards")])
            defer { session.end() }

            let model = DueTodayModel()

            await model.load()

            #expect(model.counts?.review == 12)
            #expect(model.total == 21)
            #expect(model.state == .idle)
        }

        @Test("should report signed out when the server rejects the token for due counts")
        func dueCountsUnauthorized() async throws {
            let session = FakeServerSession(["/knowledge-bits/review-cards": .status(401)])
            defer { session.end() }

            let model = DueTodayModel()

            await model.load()

            #expect(model.state == .failed(.unauthorized))
            #expect(model.counts == nil)
        }

        @Test("should report offline, never signed out, when the connection drops for due counts")
        func dueCountsOffline() async throws {
            let session = FakeServerSession(["/knowledge-bits/review-cards": .failure(.networkConnectionLost)])
            defer { session.end() }

            let model = DueTodayModel()

            await model.load()

            #expect(model.state == .failed(.offline))
        }

        @Test("should load the pending review list into sources")
        func pendingReviewLoads() async throws {
            let session = FakeServerSession(["/knowledge-bits/pending-review": .fixture("pending-review")])
            defer { session.end() }

            let model = PendingReviewListModel()

            await model.load()

            #expect(model.hasLoaded)
            #expect(model.sources.first?.knowledgeSourceId == "src_01")
            #expect(model.errorMessage == nil)
        }
    }
}
