import Foundation
import Testing

extension SmokeTests {
    @MainActor
    @Suite("Quick practice loads from a fake server")
    struct PracticeSmokeTests {
        private let path = "/knowledge-bits/question-variants/next"

        @Test("should queue the questions to answer and start on the first one")
        func quickPracticeLoads() async throws {
            let session = FakeServerSession([path: .fixture("next-question-variants")])
            defer { session.end() }

            let model = IngestScreenModel()

            await model.load()

            #expect(model.queue.map(\.variantId) == ["var_01", "var_02"])
            #expect(model.current?.variantId == "var_01")
            #expect(model.failure == nil)
            #expect(model.errorMessage == nil)
        }

        @Test("should show signed out for quick practice on a 401, not a generic failure")
        func quickPracticeUnauthorized() async throws {
            let session = FakeServerSession([path: .status(401)])
            defer { session.end() }

            let model = IngestScreenModel()

            await model.load()

            #expect(model.failure == .unauthorized)
            #expect(model.queue.isEmpty)
        }

        @Test("should show offline for quick practice when the connection drops, never signed out")
        func quickPracticeOffline() async throws {
            let session = FakeServerSession([path: .failure(.networkConnectionLost)])
            defer { session.end() }

            let model = IngestScreenModel()

            await model.load()

            #expect(model.failure == .offline)
            #expect(model.errorMessage != nil)
        }
    }
}
