import Foundation
import Testing

extension SmokeTests {
    @MainActor
    @Suite("Courses, knowledge and library load from a fake server")
    struct LibrarySmokeTests {
        @Test("should group courses under their subjects once loaded")
        func coursesLoad() async throws {
            let session = FakeServerSession([
                "/subjects": .fixture("subjects"),
                "/curricula": .fixture("curricula")
            ])
            defer { session.end() }

            let model = CoursesScreenModel()

            await model.load()

            #expect(model.hasLoaded)
            #expect(model.curricula(for: "sub_01").count == 2)
            #expect(model.failure == nil)
        }

        @Test("should show the signed-out state for courses on a 401, not a generic failure")
        func coursesUnauthorized() async throws {
            let session = FakeServerSession(["/subjects": .status(401), "/curricula": .status(401)])
            defer { session.end() }

            let model = CoursesScreenModel()

            await model.load()

            #expect(model.failure == .unauthorized)
            #expect(!model.hasLoaded)
        }

        @Test("should show offline for courses when the connection drops, never signed out")
        func coursesOffline() async throws {
            let session = FakeServerSession([
                "/subjects": .failure(.notConnectedToInternet),
                "/curricula": .failure(.notConnectedToInternet)
            ])
            defer { session.end() }

            let model = CoursesScreenModel()

            await model.load()

            #expect(model.failure == .offline)
        }

        @Test("should load the knowledge list first page and its paging flag")
        func knowledgeLoads() async throws {
            let session = FakeServerSession([
                "/knowledge-bits/overview": .fixture("knowledge-overview"),
                "/subjects": .fixture("subjects")
            ])
            defer { session.end() }

            let model = KnowledgeListModel()

            await model.start()

            #expect(model.hasLoaded)
            #expect(model.items.count == 2)
            #expect(model.hasMore)
            #expect(model.failureKind == nil)
        }

        @Test("should load the source library and group sources by subject and course")
        func sourceLibraryLoads() async throws {
            let session = FakeServerSession(["/sources": .fixture("library-sources")])
            defer { session.end() }

            let model = SourceLibraryModel()

            await model.load()

            #expect(model.hasLoaded)
            #expect(model.groups.map(\.title) == ["System design · Distributed systems"])
            #expect(model.groups.first?.sources.count == 2)
        }

        @Test("should load tags together with their mastery")
        func tagsLoad() async throws {
            let session = FakeServerSession([
                "/tags": .fixture("tags"),
                "/tags/mastery": .fixture("tag-mastery")
            ])
            defer { session.end() }

            let model = TagsModel()

            await model.load()

            #expect(model.hasLoaded)
            #expect(model.filtered.map(\.name) == ["caching", "consistency"])
            #expect(model.mastery["tag_02"]?.statusLabel == "Mastered")
        }
    }
}
