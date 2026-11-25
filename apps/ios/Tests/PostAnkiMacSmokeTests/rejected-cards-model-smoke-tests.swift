import Foundation
import Testing

extension SmokeTests {
    @MainActor
    @Suite("Rejected cards list stays consistent while restoring, paging and failing")
    struct RejectedCardsModelSmokeTests {
        private func card(_ id: String) -> String {
            "{\"knowledgeBitId\":\"\(id)\",\"body\":\"Card \(id)\",\"reasonCode\":\"wrong\",\"decidedAt\":\"2026-10-01T00:00:00Z\"}"
        }

        private func page(_ ids: [String], hasMore: Bool) -> FakeReply {
            .json(200, "{\"items\":[\(ids.map(card).joined(separator: ","))],\"hasMore\":\(hasMore),\"reasonCounts\":{\"wrong\":\(ids.count)}}")
        }

        @Test("should remove a card from the list once it is restored")
        func restoreRemovesRow() async throws {
            let session = FakeServerSession([
                "/knowledge-bits/rejected": page(["c1", "c2"], hasMore: false),
                "POST /knowledge-bits/c1/restore-rejected": .status(200),
            ])
            defer { session.end() }
            let model = RejectedCardsModel()

            await model.load()

            let first = try #require(model.items.first)

            await model.restore(first)

            #expect(model.items.map(\.id) == ["c2"])

            await model.settle()

            #expect(FakeServer.writes.map(\.path) == ["/knowledge-bits/c1/restore-rejected"])
            #expect(model.items.map(\.id) == ["c2"])
            #expect(model.failure == nil)
        }

        @Test("should let the next card be restored while the first restore is still being sent")
        func nextRestoreWhileHeld() async throws {
            let session = FakeServerSession([
                "/knowledge-bits/rejected": page(["c1", "c2", "c3"], hasMore: false),
                "POST /knowledge-bits/c1/restore-rejected": .held(200, "{}"),
                "POST /knowledge-bits/c2/restore-rejected": .status(200)
            ])
            defer { session.end() }
            let model = RejectedCardsModel()

            await model.load()
            await model.restore(model.items[0])
            await model.restore(model.items[0])

            #expect(model.items.map(\.id) == ["c3"])

            for _ in 0..<300 where FakeServer.heldCount < 1 { try await Task.sleep(for: .milliseconds(10)) }

            FakeServer.releaseHeld()
            await model.settle()

            #expect(model.items.map(\.id) == ["c3"])
            #expect(model.failure == nil)
        }

        @Test("should bring back only the card whose restore failed, in its old place, and say so")
        func lateFailureRestoresOnlyThatCard() async throws {
            let session = FakeServerSession([
                "/knowledge-bits/rejected": page(["c1", "c2", "c3"], hasMore: false),
                "POST /knowledge-bits/c2/restore-rejected": .held(500, "{}"),
                "POST /knowledge-bits/c1/restore-rejected": .status(200)
            ])
            defer { session.end() }
            let model = RejectedCardsModel()

            await model.load()
            await model.restore(model.items[1])
            await model.restore(model.items[0])

            #expect(model.items.map(\.id) == ["c3"])

            for _ in 0..<300 where FakeServer.heldCount < 1 { try await Task.sleep(for: .milliseconds(10)) }

            FakeServer.releaseHeld()
            await model.settle()

            #expect(model.items.map(\.id).sorted() == ["c2", "c3"])
            #expect(model.failure != nil)
        }

        @Test("should append the next page once and stop asking when there is no more")
        func loadMoreAppendsOnce() async throws {
            let session = FakeServerSession(["/knowledge-bits/rejected": page(["c1", "c2"], hasMore: true)])
            defer { session.end() }
            let model = RejectedCardsModel()

            await model.load()
            FakeServer.start(["/knowledge-bits/rejected": page(["c2", "c3"], hasMore: false)])

            let last = try #require(model.items.last)

            await model.loadMore(current: last)

            #expect(model.items.map(\.id) == ["c1", "c2", "c3"])
            #expect(!model.hasMore)

            let requestsBefore = FakeServer.requested.count

            await model.loadMore(current: try #require(model.items.last))

            #expect(FakeServer.requested.count == requestsBefore)
            #expect(model.items.map(\.id) == ["c1", "c2", "c3"])
        }

        @Test("should clear the search and show the full list again when the search text is emptied")
        func emptyQueryClears() async {
            let session = FakeServerSession(["/knowledge-bits/rejected": page(["c1", "c2"], hasMore: false)])
            defer { session.end() }
            let model = RejectedCardsModel()

            await model.search("c1")
            await model.search(nil)

            #expect(model.query == nil)
            #expect(model.items.map(\.id) == ["c1", "c2"])
            #expect(FakeServer.requested.count == 2)
        }

        @Test("should keep the previous list and show an error when a reload fails")
        func failedLoadKeepsList() async {
            let session = FakeServerSession(["/knowledge-bits/rejected": page(["c1", "c2"], hasMore: false)])
            defer { session.end() }
            let model = RejectedCardsModel()

            await model.load()
            FakeServer.start(["/knowledge-bits/rejected": .failure(.notConnectedToInternet)])
            await model.load()

            #expect(model.items.map(\.id) == ["c1", "c2"])
            #expect(model.failure != nil)
            #expect(!model.isLoading)
        }
    }
}
