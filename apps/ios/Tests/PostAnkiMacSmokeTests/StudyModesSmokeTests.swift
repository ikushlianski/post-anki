import Foundation
import Testing

extension SmokeTests {
    @MainActor
    @Suite("Study sessions and resurfacing gaps load from a fake server")
    struct StudyModesSmokeTests {
        private let signedOut = "Check Settings: your access token was rejected."
        private let offline = "Couldn't connect to the server. Try again."

        private func sessionRoutes(_ reply: FakeReply? = nil) -> [String: FakeReply] {
            [
                "/study-sessions": reply ?? .fixture("study-sessions"),
                "/study-sessions/consistency": reply ?? .fixture("study-session-consistency"),
                "/curricula": reply ?? .fixture("curricula")
            ]
        }

        @Test("should sort study sessions into upcoming by date, in progress, missed and done")
        func studySessionsLoad() async throws {
            let session = FakeServerSession(sessionRoutes())
            defer { session.end() }

            let model = StudySessionsModel()

            await model.load()

            #expect(model.hasLoaded)
            #expect(model.upcoming.map(\.id) == ["ss_02", "ss_01"])
            #expect(model.inProgress.map(\.id) == ["ss_03"])
            #expect(model.missed.map(\.id) == ["ss_04"])
            #expect(model.done.map(\.id) == ["ss_05"])
        }

        @Test("should show the completion rate and name each session's course")
        func studySessionsConsistencyAndNames() async throws {
            let session = FakeServerSession(sessionRoutes())
            defer { session.end() }

            let model = StudySessionsModel()

            await model.load()

            #expect(model.consistency?.completed == 3)
            #expect(model.consistency?.rate == 0.6)
            #expect(model.targetLabel(type: "curriculum", id: "cur_01") == "Distributed systems")
            #expect(model.targetLabel(type: nil, id: nil) == "Anything")
        }

        @Test("should show the rejected-token message for study sessions on a 401")
        func studySessionsUnauthorized() async throws {
            let session = FakeServerSession(sessionRoutes(.status(401)))
            defer { session.end() }

            let model = StudySessionsModel()

            await model.load()

            #expect(model.errorMessage == signedOut)
            #expect(!model.hasLoaded)
        }

        @Test("should show the offline message for study sessions when the connection drops")
        func studySessionsOffline() async throws {
            let session = FakeServerSession(sessionRoutes(.failure(.notConnectedToInternet)))
            defer { session.end() }

            let model = StudySessionsModel()

            await model.load()

            #expect(model.errorMessage == offline)
            #expect(!model.hasLoaded)
        }

        @Test("should list deferred and dismissed gaps that are due to come back")
        func resurfacingGapsLoad() async throws {
            let session = FakeServerSession(["/gaps/due-for-resurface": .fixture("gaps-due-for-resurface")])
            defer { session.end() }

            let model = ResurfacingGapsModel()

            await model.load()

            #expect(model.hasLoaded)
            #expect(model.userDeferred.map(\.id) == ["gap_01"])
            #expect(model.dismissedCheckin.map(\.id) == ["gap_02"])
            #expect(!model.isEmpty)
            #expect(model.errorMessage == nil)
        }

        @Test("should show the rejected-token message for resurfacing gaps on a 401")
        func resurfacingGapsUnauthorized() async throws {
            let session = FakeServerSession(["/gaps/due-for-resurface": .status(401)])
            defer { session.end() }

            let model = ResurfacingGapsModel()

            await model.load()

            #expect(model.errorMessage == signedOut)
            #expect(!model.hasLoaded)
        }

        @Test("should show the offline message for resurfacing gaps when the connection drops")
        func resurfacingGapsOffline() async throws {
            let session = FakeServerSession(["/gaps/due-for-resurface": .failure(.cannotConnectToHost)])
            defer { session.end() }

            let model = ResurfacingGapsModel()

            await model.load()

            #expect(model.errorMessage == offline)
            #expect(!model.hasLoaded)
        }
    }
}
