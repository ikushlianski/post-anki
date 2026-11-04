import Foundation
import Testing

extension SmokeTests {
    @MainActor
    @Suite("Chat search clears, keeps results on failure and flags a cut list")
    struct ChatQueueSearchModelSmokeTests {
        private func hit(_ n: Int) -> String {
            "{\"cardId\":\"c\(n)\",\"seq\":\(n),\"role\":\"user\",\"snippet\":\"match \(n)\"}"
        }

        private func reply(_ count: Int, hasMore: Bool) -> FakeReply {
            .json(200, "{\"results\":[\((1...max(count, 1)).prefix(count).map(hit).joined(separator: ","))],\"hasMore\":\(hasMore)}")
        }

        private let path = "/knowledge-bits/chat-queue/search"

        @Test("should show hits for a query of two or more characters")
        func showsHits() async {
            let session = FakeServerSession([path: reply(2, hasMore: false)])
            defer { session.end() }
            let model = ChatQueueSearchModel()

            model.query = "ma"
            await model.run()

            guard case .ready(let hits, let isCut) = model.state else {
                Issue.record("not ready: \(model.state)")

                return
            }

            #expect(hits.count == 2)
            #expect(!isCut)
        }

        @Test("should go back to idle without a request when the query is emptied")
        func emptyQueryClears() async {
            let session = FakeServerSession([path: reply(2, hasMore: false)])
            defer { session.end() }
            let model = ChatQueueSearchModel()

            model.query = "ma"
            await model.run()
            model.query = "  "
            await model.run()

            #expect(model.state == .idle)
            #expect(FakeServer.requested.count == 1)
        }

        @Test("should treat a one-character query as not searchable")
        func shortQuery() async {
            let session = FakeServerSession([path: reply(2, hasMore: false)])
            defer { session.end() }
            let model = ChatQueueSearchModel()

            model.query = "m"
            await model.run()

            #expect(model.state == .idle)
            #expect(FakeServer.requested.isEmpty)
        }

        @Test("should flag a cut list when the server says there are more than the first 20")
        func cutNotice() async {
            let session = FakeServerSession([path: reply(20, hasMore: true)])
            defer { session.end() }
            let model = ChatQueueSearchModel()

            model.query = "match"
            await model.run()

            guard case .ready(let hits, let isCut) = model.state else {
                Issue.record("not ready: \(model.state)")

                return
            }

            #expect(hits.count == 20)
            #expect(isCut)
        }

        @Test("should show a failure message when the search fails")
        func failureShown() async {
            let session = FakeServerSession([path: reply(2, hasMore: false)])
            defer { session.end() }
            let model = ChatQueueSearchModel()

            model.query = "ma"
            await model.run()
            FakeServer.start([path: .failure(.notConnectedToInternet)])
            model.query = "mat"
            await model.run()

            guard case .failed(let message) = model.state else {
                Issue.record("not failed: \(model.state)")

                return
            }

            #expect(!message.isEmpty)
        }
    }
}
