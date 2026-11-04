import Foundation
import PostAnkiAPI
import Testing

extension SmokeTests {
    @MainActor
    @Suite("Focus triage preloads a window of cards and tops it up")
    struct FocusTriageWindowSmokeTests {
        private let path = "/knowledge-bits/pending-review"

        private func reply(_ range: ClosedRange<Int>, subjectId: String = "sub1") -> FakeReply {
            let bits = range.map { FocusTriageFixtures.bit("b\($0)") }

            return .json(200, FocusTriageFixtures.list([FocusTriageFixtures.source("s\(subjectId)", subjectId: subjectId, bits: bits)]))
        }

        private func pendingQueries() -> [String] {
            FakeServer.requests.filter { $0.path == path }.compactMap(\.query)
        }

        private func make(_ routes: [String: FakeReply]) async -> (FocusTriageModel, FakeServerSession) {
            let session = FakeServerSession(routes)
            let triage = FocusTriageModel(list: PendingReviewListModel(), decisionQueue: .isolated())

            await triage.load()

            return (triage, session)
        }

        private func drainTopUp(_ triage: FocusTriageModel) async {
            triage.syncPin()
            await triage.list.topUpTask?.value
        }

        @Test("should preload only the first 20 pending cards when Triage opens")
        func loadsTwentyFirst() async {
            let (triage, session) = await make(["GET \(path)?attention=1&limit=20&includeTotal=1": reply(1...20)])
            defer { session.end() }

            #expect(pendingQueries() == ["attention=1&limit=20&includeTotal=1"])
            #expect(triage.readyCount == 20)
        }

        @Test("should not ask for more cards while 8 or more remain")
        func noTopUpAboveLowWater() async {
            let (triage, session) = await make(["GET \(path)?attention=1&limit=20&includeTotal=1": reply(1...20)])
            defer { session.end() }

            for number in 1...12 { triage.list.remove(bitId: "b\(number)") }

            await drainTopUp(triage)

            #expect(triage.readyCount == 8)
            #expect(pendingQueries().count == 1)
        }

        @Test("should top up by up to 50 once fewer than 8 remain without re-adding decided cards")
        func topsUpWithoutDecidedCards() async {
            let (triage, session) = await make([
                "GET \(path)?attention=1&limit=20&includeTotal=1": reply(1...20),
                "GET \(path)?limit=70&includeTotal=1": reply(1...60)
            ])
            defer { session.end() }

            for number in 1...13 { triage.list.remove(bitId: "b\(number)") }

            await drainTopUp(triage)

            let ids = triage.list.sources.flatMap(\.bits).map(\.id)

            #expect(ids.count == 47)
            #expect(Set(ids).count == 47)
            #expect(ids.contains("b60"))
            #expect(!ids.contains("b13"))
        }

        @Test("should stop asking once the server has no more pending cards")
        func stopsWhenServerExhausted() async {
            let (triage, session) = await make([
                "GET \(path)?attention=1&limit=20&includeTotal=1": reply(1...20),
                "GET \(path)?limit=70&includeTotal=1": reply(1...25)
            ])
            defer { session.end() }

            for number in 1...14 { triage.list.remove(bitId: "b\(number)") }

            await drainTopUp(triage)

            let requestsAfterFirstTopUp = pendingQueries().count

            for number in 15...30 { triage.list.remove(bitId: "b\(number)") }

            await drainTopUp(triage)

            #expect(requestsAfterFirstTopUp == 2)
            #expect(pendingQueries().count == 2)
            #expect(triage.readyCount == 0)
        }

        @Test("should load and top up only the chosen subject when triaging by subject")
        func subjectScopedWindow() async {
            let session = FakeServerSession([
                "GET \(path)?attention=1&limit=20&subjectId=sub2&includeTotal=1": reply(1...20, subjectId: "sub2"),
                "GET \(path)?limit=70&subjectId=sub2&includeTotal=1": reply(1...30, subjectId: "sub2")
            ])
            defer { session.end() }

            let triage = FocusTriageModel(list: PendingReviewListModel(), decisionQueue: .isolated())

            triage.subjectFilter = "sub2"

            await triage.load()

            for number in 1...14 { triage.list.remove(bitId: "b\(number)") }

            await drainTopUp(triage)

            #expect(pendingQueries() == ["attention=1&limit=20&subjectId=sub2&includeTotal=1", "limit=70&subjectId=sub2&includeTotal=1"])
            #expect(triage.readyCount == 16)
        }

        @Test("should show the server's pending total as remaining while only part of it is loaded")
        func remainingUsesServerTotal() async {
            let (triage, session) = await make(["GET \(path)?attention=1&limit=20&includeTotal=1": reply(1...20)])
            defer { session.end() }

            let counts = triage.list.counts

            counts.adjust(by: 57 - counts.count)

            #expect(triage.readyCount == 20)
            #expect(triage.remainingCount == 57)
        }

        @Test("should show the server's exact total as remaining under a subject filter and count down as cards are decided")
        func remainingEqualsServerTotalUnderSubjectFilter() async {
            let page = FocusTriageFixtures.list([
                FocusTriageFixtures.source("ssub2", subjectId: "sub2", bits: (1...20).map { FocusTriageFixtures.bit("b\($0)") })
            ])
            let session = FakeServerSession([
                "GET \(path)?attention=1&limit=20&subjectId=sub2&includeTotal=1": .json(200, #"{"items":\#(page),"total":57}"#)
            ])
            defer { session.end() }

            let triage = FocusTriageModel(list: PendingReviewListModel(), decisionQueue: .isolated())

            triage.subjectFilter = "sub2"

            await triage.load()

            #expect(triage.readyCount == 20)
            #expect(triage.remainingCount == 57)

            for number in 1...3 { triage.list.remove(bitId: "b\(number)") }

            #expect(triage.remainingCount == 54)
        }

        @Test("should show the loaded count as remaining once everything pending is loaded")
        func remainingIsLoadedWhenComplete() async {
            let (triage, session) = await make(["GET \(path)?attention=1&limit=20&includeTotal=1": reply(1...5)])
            defer { session.end() }

            let counts = triage.list.counts

            counts.adjust(by: 57 - counts.count)

            #expect(triage.remainingCount == 5)
        }
    }
}
