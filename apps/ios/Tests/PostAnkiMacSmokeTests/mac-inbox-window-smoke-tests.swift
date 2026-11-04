import Foundation
import PostAnkiAPI
import Testing

extension SmokeTests {
    @MainActor
    @Suite("Mac inbox list loads a window of cards and tops it up")
    struct MacInboxWindowSmokeTests {
        private let path = "/knowledge-bits/pending-review"
        private let first = "GET /knowledge-bits/pending-review?attention=1&limit=20&includeTotal=1"

        private func reply(_ range: ClosedRange<Int>, subjectId: String = "sub1") -> FakeReply {
            let bits = range.map { FocusTriageFixtures.bit("b\($0)") }

            return .json(200, FocusTriageFixtures.list([FocusTriageFixtures.source("s\(subjectId)", subjectId: subjectId, bits: bits)]))
        }

        private func pendingQueries() -> [String] {
            FakeServer.requests.filter { $0.path == path }.compactMap(\.query)
        }

        private func loadedList(_ routes: [String: FakeReply]) async -> (PendingReviewListModel, FakeServerSession) {
            let session = FakeServerSession(routes)
            let list = PendingReviewListModel(windowed: true)

            await list.load()

            return (list, session)
        }

        private func ids(_ list: PendingReviewListModel) -> [String] {
            list.sources.flatMap(\.bits).map(\.id)
        }

        @Test("should load only the first 20 pending cards into the inbox list")
        func listLoadsTwentyFirst() async {
            let (list, session) = await loadedList([first: reply(1...20)])
            defer { session.end() }

            #expect(pendingQueries() == ["attention=1&limit=20&includeTotal=1"])
            #expect(ids(list).count == 20)
        }

        @Test("should not ask for more while the visible row is not in the last 8")
        func listNoTopUpAwayFromEnd() async {
            let (list, session) = await loadedList([first: reply(1...20)])
            defer { session.end() }

            list.rowAppeared("b12")
            await list.topUpTask?.value

            #expect(pendingQueries().count == 1)
        }

        @Test("should top up when a row in the last 8 appears without re-adding decided cards")
        func listTopsUpNearEnd() async {
            let (list, session) = await loadedList([
                first: reply(1...20),
                "GET \(path)?limit=70&includeTotal=1": reply(1...60)
            ])
            defer { session.end() }

            list.remove(bitId: "b1")
            list.remove(bitId: "b2")
            list.rowAppeared("b14")
            await list.topUpTask?.value

            let held = ids(list)

            #expect(held.count == 58)
            #expect(Set(held).count == 58)
            #expect(held.contains("b60"))
            #expect(!held.contains("b1"))
        }

        @Test("should stop asking once the server has no more pending cards for the list")
        func listStopsWhenExhausted() async {
            let (list, session) = await loadedList([
                first: reply(1...20),
                "GET \(path)?limit=70&includeTotal=1": reply(1...25)
            ])
            defer { session.end() }

            list.rowAppeared("b20")
            await list.topUpTask?.value
            list.rowAppeared("b25")
            await list.topUpTask?.value

            #expect(pendingQueries().count == 2)
            #expect(ids(list).count == 25)
        }

        @Test("should reload only the first 20 when the list is refreshed")
        func listRefreshResetsWindow() async {
            let (list, session) = await loadedList([
                first: reply(1...20),
                "GET \(path)?limit=70&includeTotal=1": reply(1...60)
            ])
            defer { session.end() }

            list.rowAppeared("b20")
            await list.topUpTask?.value
            await list.load()

            #expect(ids(list).count == 20)
        }

        @Test("should reload a newly scoped window even when a poll load is already running")
        func scopeReloadsWhilePollRuns() async throws {
            let poll = FocusTriageFixtures.list([
                FocusTriageFixtures.source("spoll", subjectId: "sub1", bits: (21...40).map { FocusTriageFixtures.bit("b\($0)") })
            ])
            let session = FakeServerSession([
                first: .held(200, poll),
                "GET \(path)?attention=1&limit=20&subjectId=sub2&includeTotal=1": reply(1...20, subjectId: "sub2")
            ])
            defer { session.end() }

            let list = PendingReviewListModel(windowed: true)
            let triage = PendingReviewTriageModel(list: list, decisionQueue: .isolated())
            let pollLoad = Task { await list.load() }

            for _ in 0..<300 where FakeServer.heldCount < 1 { try await Task.sleep(for: .milliseconds(10)) }

            let scoped = Task { await triage.setScope("sub2") }

            for _ in 0..<300 where !list.reloadRequested { try await Task.sleep(for: .milliseconds(10)) }

            FakeServer.releaseHeld()
            await pollLoad.value
            await scoped.value

            #expect(ids(list) == (1...20).map { "b\($0)" })
            #expect(list.sources.map(\.id) == ["ssub2"])
        }

        private func stamp(_ number: Int) -> String {
            "2026-01-01T00:00:00." + String(format: "%06d", number) + "Z"
        }

        private func stamped(_ range: ClosedRange<Int>, total: Int) -> FakeReply {
            let bits = range.map { number in
                String(FocusTriageFixtures.bit("b\(number)").dropLast()) + #","createdAt":"\#(stamp(number))"}"#
            }
            let items = FocusTriageFixtures.list([FocusTriageFixtures.source("s1", bits: bits)])

            return .json(200, #"{"items":\#(items),"total":\#(total)}"#)
        }

        private func nextKey(after number: Int) -> String {
            let encoded = stamp(number).replacingOccurrences(of: ":", with: "%3A")

            return "GET \(path)?limit=50&afterCreatedAt=\(encoded)&afterId=b\(number)&includeTotal=1"
        }

        private var cursorRoutes: [String: FakeReply] {
            [
                first: stamped(1...20, total: 250),
                nextKey(after: 20): stamped(21...70, total: 250),
                nextKey(after: 70): stamped(71...120, total: 250),
                nextKey(after: 120): stamped(121...170, total: 250),
                nextKey(after: 170): stamped(171...220, total: 250),
                nextKey(after: 220): stamped(221...250, total: 250)
            ]
        }

        @Test("should reach a card beyond the 200 cap in the inbox list through cursor pages without repeats")
        func listReachesBeyondTwoHundred() async {
            let (list, session) = await loadedList(cursorRoutes)
            defer { session.end() }

            var seen: [String] = []

            for _ in 0..<10 {
                let held = ids(list)

                if held.isEmpty { break }

                seen += held
                list.remove(bitIds: Set(held))
                list.topUpIfNeeded(remaining: 0, subjectId: nil)
                await list.topUpTask?.value
            }

            #expect(seen.count == 250)
            #expect(Set(seen).count == 250)
            #expect(seen.last == "b250")
            #expect(pendingQueries().count == 6)
            #expect(pendingQueries().allSatisfy { !$0.contains("limit=70") })
        }

        @Test("should reset the cursor to the first page when the list is refreshed")
        func listRefreshResetsCursor() async {
            let (list, session) = await loadedList(cursorRoutes)
            defer { session.end() }

            list.rowAppeared("b20")
            await list.topUpTask?.value
            await list.load()

            #expect(ids(list).count == 20)
            #expect(list.windowCursor?.id == "b20")
        }
    }
}
