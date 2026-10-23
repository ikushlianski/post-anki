import Foundation
import PostAnkiAPI
import Testing

extension SmokeTests {
    @MainActor
    @Suite("Mac list screens keep the real failure and the review inbox handles bulk and cancelled loads")
    struct ReviewFixesSmokeTests {
        private func inboxRoutes() -> [String: FakeReply] {
            [
                "/knowledge-bits/placement-suggestions": .fixture("placement-suggestions"),
                "/curricula": .fixture("curricula"),
                "/curricula/cur_01": .fixture("curriculum-detail"),
                "/knowledge-bits/bit_01/placement-suggestion": .status(200)
            ]
        }

        @Test("should tell a signed-out user to add a token on every Mac list screen, not show a generic failure")
        func unauthorizedKinds() async throws {
            let session = FakeServerSession([
                "/sources": .status(401),
                "/content-inbox": .status(401),
                "/subjects": .status(401),
                "/curricula": .status(401),
                "/tags": .status(401),
                "/tags/mastery": .status(401),
                "/study-sessions": .status(401),
                "/study-sessions/consistency": .status(401),
                "/gaps/due-for-resurface": .status(401)
            ])
            defer { session.end() }

            let sources = SourceLibraryModel()
            let contentInbox = ContentInboxModel()
            let subjects = SubjectManageModel()
            let maps = DomainMapModel()
            let tags = TagsModel()
            let sessions = StudySessionsModel()
            let gaps = ResurfacingGapsModel()

            await sources.load()
            await contentInbox.load()
            await subjects.load()
            await maps.load()
            await tags.load()
            await sessions.load()
            await gaps.load()

            #expect(sources.failureKind == .unauthorized)
            #expect(contentInbox.failureKind == .unauthorized)
            #expect(subjects.failureKind == .unauthorized)
            #expect(maps.failureKind == .unauthorized)
            #expect(tags.failureKind == .unauthorized)
            #expect(sessions.failureKind == .unauthorized)
            #expect(gaps.failureKind == .unauthorized)
        }

        @Test("should tell an offline user to check the connection on the sources and sessions screens")
        func offlineKinds() async throws {
            let session = FakeServerSession([
                "/sources": .failure(.notConnectedToInternet),
                "/study-sessions": .failure(.notConnectedToInternet),
                "/study-sessions/consistency": .failure(.notConnectedToInternet),
                "/curricula": .failure(.notConnectedToInternet)
            ])
            defer { session.end() }

            let sources = SourceLibraryModel()
            let sessions = StudySessionsModel()

            await sources.load()
            await sessions.load()

            #expect(sources.failureKind == .offline)
            #expect(sessions.failureKind == .offline)
        }

        @Test("should clear the previous failure kind once a reload succeeds")
        func failureClearsOnSuccess() async throws {
            let failing = FakeServerSession(["/sources": .status(401)])
            let model = SourceLibraryModel()

            await model.load()
            failing.end()

            #expect(model.failureKind == .unauthorized)

            let working = FakeServerSession(["/sources": .fixture("library-sources")])
            defer { working.end() }

            await model.load()

            #expect(model.failureKind == nil)
            #expect(model.hasLoaded)
        }

        @Test("should keep the inbox in its loading state and show no error when the first load is cancelled")
        func inboxCancelledFirstLoad() async throws {
            let session = FakeServerSession(inboxRoutes())
            defer { session.end() }

            let model = KnowledgeItemInboxModel()
            let task = Task { await model.load() }

            task.cancel()
            await task.value

            #expect(!model.hasLoaded)
            #expect(model.errorMessage == nil)
            #expect(!model.isLoading)
        }

        @Test("should not mark the inbox loaded when the first load fails, and show the signed-out state")
        func inboxFailedFirstLoad() async throws {
            let session = FakeServerSession([
                "/knowledge-bits/placement-suggestions": .status(401),
                "/curricula": .status(401)
            ])
            defer { session.end() }

            let model = KnowledgeItemInboxModel()

            await model.load()

            #expect(!model.hasLoaded)
            #expect(model.failureKind == .unauthorized)
            #expect(model.errorMessage != nil)
        }

        @Test("should approve only confident matches in a bulk approve and leave the rest for one-by-one review")
        func bulkApproveLeavesUnmatched() async throws {
            let session = FakeServerSession(inboxRoutes())
            defer { session.end() }

            let model = KnowledgeItemInboxModel()

            await model.load()
            await model.approveSelected(model.items)

            #expect(model.items.map(\.id) == ["bit_02", "bit_03"])
            #expect(model.editingItem == nil)
            #expect(model.notice?.hasPrefix("2 items need a deck") == true)
            #expect(FakeServer.requested.contains("/knowledge-bits/bit_01/placement-suggestion"))
            #expect(!FakeServer.requested.contains("/knowledge-bits/bit_02/placement-suggestion"))
        }

        @Test("should open the deck editor when a single unmatched item is approved")
        func singleUnmatchedOpensEditor() async throws {
            let session = FakeServerSession(inboxRoutes())
            defer { session.end() }

            let model = KnowledgeItemInboxModel()

            await model.load()

            let unmatched = try #require(model.items.first { $0.id == "bit_02" })

            await model.approveSelected([unmatched])

            #expect(model.editingItem?.id == "bit_02")
            #expect(model.notice == nil)
        }

        @Test("should leave open questions without an error when a load is cancelled")
        func openQuestionsCancelled() async throws {
            let session = FakeServerSession([:])
            defer { session.end() }

            let model = OpenQuestionsModel()
            let task = Task { await model.load() }

            task.cancel()
            await task.value

            #expect(model.loadError == nil)
            #expect(model.failureKind == nil)
            #expect(!model.isLoading)
        }

        @Test("should leave topic gaps without an error when a load is cancelled")
        func topicGapsCancelled() async throws {
            let session = FakeServerSession([:])
            defer { session.end() }

            let model = TopicGapsModel(topicId: "top_01")
            let task = Task { await model.load() }

            task.cancel()
            await task.value

            #expect(model.errorMessage == nil)
            #expect(!model.isLoading)
        }
    }
}
