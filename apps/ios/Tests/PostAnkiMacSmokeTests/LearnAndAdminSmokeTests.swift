import Foundation
import Testing

extension SmokeTests {
    @MainActor
    @Suite("Learning list and admin load from a fake server")
    struct LearnAndAdminSmokeTests {
        @Test("should split the learning list into items awaiting a decision and items still being sorted")
        func learningListLoads() async throws {
            let session = FakeServerSession(["/learning-list-items": .fixture("learning-list")])
            defer { session.end() }

            let model = LearningListModel()

            await model.load()

            #expect(model.hasLoaded)
            #expect(model.awaiting.map(\.id) == ["li_01"])
            #expect(model.working.map(\.id) == ["li_02"])
        }

        @Test("should show signed out for the learning list on a 401")
        func learningListUnauthorized() async throws {
            let session = FakeServerSession(["/learning-list-items": .status(401)])
            defer { session.end() }

            let model = LearningListModel()

            await model.load()

            #expect(model.failureKind == .unauthorized)
            #expect(!model.hasLoaded)
        }

        @Test("should show offline for the learning list when the connection drops, never signed out")
        func learningListOffline() async throws {
            let session = FakeServerSession(["/learning-list-items": .failure(.cannotConnectToHost)])
            defer { session.end() }

            let model = LearningListModel()

            await model.load()

            #expect(model.failureKind == .offline)
        }

        @Test("should load admin settings, observability and feedback together")
        func adminLoads() async throws {
            let session = FakeServerSession([
                "/admin/settings": .fixture("admin-settings"),
                "/admin/observability": .fixture("admin-observability"),
                "/admin/knowledge-bit-feedback/by-model": .fixture("admin-feedback-by-model")
            ])
            defer { session.end() }

            let model = AdminModel()

            await model.load()

            #expect(model.hasLoaded)
            #expect(model.settings?.modelTier == "cheap")
            #expect(model.observability?.stuckCurricula.count == 1)
            #expect(model.feedback.first?.approved == 12)
        }

        @Test("should show the server's refusal for admin on a 403, not signed out")
        func adminForbidden() async throws {
            let session = FakeServerSession([
                "/admin/settings": .status(403),
                "/admin/observability": .status(403),
                "/admin/knowledge-bit-feedback/by-model": .status(403)
            ])
            defer { session.end() }

            let model = AdminModel()

            await model.load()

            #expect(model.failureKind == .other)
            #expect(model.forbiddenDetail != nil)
            #expect(!model.hasLoaded)
        }
    }
}
