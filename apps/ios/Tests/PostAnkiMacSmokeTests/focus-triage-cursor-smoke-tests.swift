import Foundation
import PostAnkiAPI
import Testing

extension SmokeTests {
    @MainActor
    @Suite("Focus triage walks past 200 pending cards with a cursor")
    struct FocusTriageCursorSmokeTests {
        private let path = "/knowledge-bits/pending-review"

        private func stamp(_ number: Int) -> String {
            "2026-01-01T00:00:00." + String(format: "%06d", number) + "Z"
        }

        private func dated(_ id: String, _ number: Int) -> String {
            let plain = FocusTriageFixtures.bit(id)

            return String(plain.dropLast()) + #","createdAt":"\#(stamp(number))"}"#
        }

        private func bit(_ number: Int) -> String {
            dated("b\(number)", number)
        }

        private func page(_ range: ClosedRange<Int>, total: Int) -> FakeReply {
            let source = FocusTriageFixtures.source("s1", bits: range.map(bit))
            let items = FocusTriageFixtures.list([source])

            return .json(200, #"{"items":\#(items),"total":\#(total)}"#)
        }

        private func nextKey(after number: Int) -> String {
            let encoded = stamp(number).replacingOccurrences(of: ":", with: "%3A")

            return "GET \(path)?limit=50&afterCreatedAt=\(encoded)&afterId=b\(number)&includeTotal=1"
        }

        private func pendingQueries() -> [String] {
            FakeServer.requests.filter { $0.path == path }.compactMap(\.query)
        }

        private func drain(_ triage: FocusTriageModel) async {
            triage.syncPin()
            await triage.list.topUpTask?.value
        }

        private func loaded(_ routes: [String: FakeReply]) async -> (FocusTriageModel, FakeServerSession) {
            var all = routes

            all["GET \(path)?attention=1&limit=20&includeTotal=1"] = page(1...20, total: 250)

            let session = FakeServerSession(all)
            let triage = FocusTriageModel(list: PendingReviewListModel(), decisionQueue: .isolated())

            await triage.load()

            return (triage, session)
        }

        private func workThroughEverything(_ triage: FocusTriageModel) async -> [String] {
            var seen: [String] = []

            for _ in 0..<10 {
                let ids = triage.list.sources.flatMap(\.bits).map(\.id)

                if ids.isEmpty { break }

                seen += ids
                ids.forEach { triage.list.remove(bitId: $0) }

                await drain(triage)
            }

            return seen
        }

        private var routes: [String: FakeReply] {
            [
                nextKey(after: 20): page(21...70, total: 250),
                nextKey(after: 70): page(71...120, total: 250),
                nextKey(after: 120): page(121...170, total: 250),
                nextKey(after: 170): page(171...220, total: 250),
                nextKey(after: 220): page(221...250, total: 250)
            ]
        }

        @Test("should reach cards beyond the first 200 by continuing after the last loaded card")
        func reachesBeyondTwoHundred() async {
            let (triage, session) = await loaded(routes)
            defer { session.end() }

            let seen = await workThroughEverything(triage)

            #expect(seen.count == 250)
            #expect(seen.last == "b250")
            #expect(pendingQueries().count == 6)
            #expect(pendingQueries().allSatisfy { !$0.contains("limit=70") })
        }

        @Test("should never show the same card twice across pages")
        func noDuplicatesAcrossPages() async {
            var overlapping = routes

            overlapping[nextKey(after: 20)] = page(20...69, total: 250)

            let (triage, session) = await loaded(overlapping)
            defer { session.end() }

            for number in 1...13 { triage.list.remove(bitId: "b\(number)") }

            await drain(triage)

            let ids = triage.list.sources.flatMap(\.bits).map(\.id)

            #expect(Set(ids).count == ids.count)
            #expect(ids.count == 50 - 1 + 7)
        }

        @Test("should stop asking once a page comes back shorter than requested")
        func exhaustedOnShortPage() async {
            let (triage, session) = await loaded([nextKey(after: 20): page(21...30, total: 30)])
            defer { session.end() }

            for number in 1...14 { triage.list.remove(bitId: "b\(number)") }

            await drain(triage)

            let requestsAfterShortPage = pendingQueries().count

            for number in 15...30 { triage.list.remove(bitId: "b\(number)") }

            await drain(triage)

            #expect(requestsAfterShortPage == 2)
            #expect(pendingQueries().count == 2)
            #expect(triage.readyCount == 0)
        }

        @Test("should take the server-last card as cursor when card ids sort differently as strings")
        func cursorFollowsServerOrderNotIdStrings() throws {
            let sources = try FocusTriageFixtures.sources([
                FocusTriageFixtures.source("s1", bits: [dated("kb_c", 1), dated("kb_a", 3)]),
                FocusTriageFixtures.source("s2", bits: [dated("kb_b", 2)])
            ])

            #expect(PendingReviewWindow.cursor(after: nil, loaded: sources) == PendingReviewCursor(createdAt: stamp(3), id: "kb_a"))
        }

        @Test("should keep showing the server total as remaining while paging with the cursor")
        func remainingFollowsTotalWhilePaging() async {
            let (triage, session) = await loaded(routes)
            defer { session.end() }

            for number in 1...13 { triage.list.remove(bitId: "b\(number)") }

            await drain(triage)

            #expect(triage.remainingCount == 250)
        }
    }
}
