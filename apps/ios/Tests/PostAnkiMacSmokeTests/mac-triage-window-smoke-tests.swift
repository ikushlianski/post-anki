import Foundation
import PostAnkiAPI
import Testing

extension SmokeTests {
    @MainActor
    @Suite("Mac card triage loads a window of cards and tops it up")
    struct MacTriageWindowSmokeTests {
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

        private func triageModel(_ routes: [String: FakeReply]) async -> (PendingReviewTriageModel, FakeServerSession) {
            let (list, session) = await loadedList(routes)

            return (PendingReviewTriageModel(list: list, decisionQueue: .isolated()), session)
        }

        @Test("should start card triage with only the first 20 cards")
        func triageLoadsTwentyFirst() async {
            let (triage, session) = await triageModel([first: reply(1...20)])
            defer { session.end() }

            let counts = triage.list.counts

            counts.adjust(by: 20 - counts.count)

            #expect(triage.queue.count == 20)
            #expect(triage.remaining == 20)
        }

        @Test("should not top up card triage while 8 or more undecided cards remain")
        func triageNoTopUpAboveLowWater() async {
            let (triage, session) = await triageModel([first: reply(1...20)])
            defer { session.end() }

            for number in 1...12 { triage.list.remove(bitId: "b\(number)") }

            triage.topUpIfNeeded()
            await triage.list.topUpTask?.value

            #expect(pendingQueries().count == 1)
        }

        @Test("should top up card triage below 8 remaining without re-adding decided cards")
        func triageTopsUp() async {
            let (triage, session) = await triageModel([
                first: reply(1...20),
                "GET \(path)?limit=70&includeTotal=1": reply(1...60)
            ])
            defer { session.end() }

            for number in 1...13 { triage.list.remove(bitId: "b\(number)") }

            triage.topUpIfNeeded()
            await triage.list.topUpTask?.value

            let held = triage.queue.map(\.id)

            #expect(held.count == 47)
            #expect(Set(held).count == 47)
            #expect(!held.contains("b13"))
            #expect(held.contains("b60"))
        }

        @Test("should stop topping up card triage once the server is exhausted")
        func triageStopsWhenExhausted() async {
            let (triage, session) = await triageModel([
                first: reply(1...20),
                "GET \(path)?limit=70&includeTotal=1": reply(1...25)
            ])
            defer { session.end() }

            for number in 1...14 { triage.list.remove(bitId: "b\(number)") }

            triage.topUpIfNeeded()
            await triage.list.topUpTask?.value

            for number in 15...30 { triage.list.remove(bitId: "b\(number)") }

            triage.topUpIfNeeded()
            await triage.list.topUpTask?.value

            #expect(pendingQueries().count == 2)
            #expect(triage.queue.isEmpty)
        }

        @Test("should load and top up only the chosen subject in card triage")
        func triageSubjectScope() async {
            let session = FakeServerSession([
                "GET \(path)?attention=1&limit=20&subjectId=sub2&includeTotal=1": reply(1...20, subjectId: "sub2"),
                "GET \(path)?limit=70&subjectId=sub2&includeTotal=1": reply(1...30, subjectId: "sub2")
            ])
            defer { session.end() }

            let triage = PendingReviewTriageModel(list: PendingReviewListModel(windowed: true), decisionQueue: .isolated())

            await triage.setScope("sub2")

            for number in 1...14 { triage.list.remove(bitId: "b\(number)") }

            triage.topUpIfNeeded()
            await triage.list.topUpTask?.value

            #expect(pendingQueries() == ["attention=1&limit=20&subjectId=sub2&includeTotal=1", "limit=70&subjectId=sub2&includeTotal=1"])
            #expect(triage.queue.count == 16)
        }

        @Test("should show the server's pending total as remaining while only part is loaded")
        func remainingUsesServerTotal() async {
            let (triage, session) = await triageModel([first: reply(1...20)])
            defer { session.end() }

            let counts = triage.list.counts

            counts.adjust(by: 57 - counts.count)

            #expect(triage.remaining == 57)
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

        @Test("should reach a card beyond the 200 cap in card triage through cursor pages without repeats")
        func triageReachesBeyondTwoHundred() async {
            let (triage, session) = await triageModel(cursorRoutes)
            defer { session.end() }

            var seen: [String] = []

            for _ in 0..<10 {
                let held = triage.queue.map(\.id)

                if held.isEmpty { break }

                seen += held
                held.forEach { triage.list.remove(bitId: $0) }
                triage.topUpIfNeeded()
                await triage.list.topUpTask?.value
            }

            #expect(seen.count == 250)
            #expect(Set(seen).count == 250)
            #expect(seen.last == "b250")
            #expect(pendingQueries().count == 6)
        }

        @Test("should drop a card the cursor page repeats and stop after a short page in card triage")
        func triageCursorDedupesAndExhausts() async {
            let (triage, session) = await triageModel([
                first: stamped(1...20, total: 30),
                nextKey(after: 20): stamped(20...30, total: 30)
            ])
            defer { session.end() }

            for number in 1...14 { triage.list.remove(bitId: "b\(number)") }

            triage.topUpIfNeeded()
            await triage.list.topUpTask?.value

            let held = triage.queue.map(\.id)

            #expect(Set(held).count == held.count)
            #expect(held.count == 16)

            held.forEach { triage.list.remove(bitId: $0) }
            triage.topUpIfNeeded()
            await triage.list.topUpTask?.value

            #expect(pendingQueries().count == 2)
        }
    }
}
