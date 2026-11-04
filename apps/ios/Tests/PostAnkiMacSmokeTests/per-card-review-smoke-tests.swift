import Foundation
import PostAnkiAPI
import Testing

extension SmokeTests {
    @MainActor
    @Suite("Per-card review queue handling")
    struct PerCardReviewSmokeTests {
        private static func card(_ variant: String, bit: String, key: String, kind: String = "cloze") -> String {
            """
            {"variantId":"\(variant)","knowledgeBitId":"\(bit)","kind":"\(kind)","cardKey":"\(key)","prompt":"p","answer":"a",
            "background":null,"phase":"new","leech":false,"intervalPreview":{"again":60,"hard":360,"good":600,"easy":3600}}
            """
        }

        private static var queueJSON: String {
            let cards = [
                card("c1", bit: "kb_1", key: "cloze:1"),
                card("c2", bit: "kb_1", key: "cloze:2"),
                card("c3", bit: "kb_1", key: "cloze:3"),
                card("b1", bit: "kb_2", key: "", kind: "basic")
            ].joined(separator: ",")

            return #"{"cards":[\#(cards)],"counts":{"new":4,"learning":0,"review":0},"newRemainingToday":10,"nextDueAt":null}"#
        }

        private static func gradeResult(buried: String?) -> String {
            let extra = buried.map { #","cardKey":"cloze:1","buriedVariantIds":\#($0)"# } ?? ""

            return #"{"reviewId":"rev_1","knowledgeBitId":"kb_1","phase":"learning","dueAt":"2026-10-28T09:00:00.000Z","intervalDays":0,"lapses":0,"leech":false,"suspended":false\#(extra)}"#
        }

        private func tempQueue() -> (PendingGradeQueue, URL) {
            let file = FileManager.default.temporaryDirectory.appendingPathComponent("grades-\(UUID().uuidString).json")

            return (PendingGradeQueue(fileURL: file), file)
        }

        private func gradeFirst(buried: String?, undoReply: String? = nil) async -> DueReviewModel {
            let (queue, file) = tempQueue()
            defer { try? FileManager.default.removeItem(at: file) }

            var routes: [String: FakeReply] = [
                "/knowledge-bits/review-cards": .json(200, Self.queueJSON),
                "/knowledge-bits/reviews": .json(201, Self.gradeResult(buried: buried))
            ]

            if let undoReply { routes["/knowledge-bits/reviews/rev_1"] = .json(200, undoReply) }

            let session = FakeServerSession(routes)
            defer { session.end() }

            let model = DueReviewModel(gradeQueue: queue)

            await model.load()
            model.reveal()
            await model.grade(.good)
            await model.sendTask?.value

            if undoReply != nil { await model.undo() }

            return model
        }

        @Test("should hide only the gaps the server buried and keep other notes in the queue")
        func gradeDropsBuriedIds() async {
            let model = await gradeFirst(buried: #"["c2","c3"]"#)

            #expect(model.current?.variantId == "b1")
            #expect(model.queue.isEmpty)
        }

        @Test("should hide every gap of the graded note at once, before the server reports what it buried")
        func gradeHidesSameNoteImmediately() async {
            let model = await gradeFirst(buried: #"["c2"]"#)

            #expect(model.current?.variantId == "b1")
            #expect(model.queue.isEmpty)
        }

        @Test("should drop same-note cards when an older server returns no buried list")
        func oldServerDropsSameNote() async {
            let model = await gradeFirst(buried: nil)

            #expect(model.current?.variantId == "b1")
        }

        @Test("should send the time zone with a grade and omit burySiblings in a normal session")
        func gradeSendsTimeZone() async {
            _ = await gradeFirst(buried: "[]")

            let body = FakeServer.writes.first?.bodyObject

            #expect(body?["tz"] as? String == TimeZone.current.identifier)
            #expect(body?["burySiblings"] == nil)
            #expect(body?["variantId"] as? String == "c1")
        }

        @Test("should bring the graded gap back on undo without restoring buried siblings locally")
        func undoReinsertsOnlyGradedCard() async {
            let model = await gradeFirst(
                buried: #"["c2","c3"]"#,
                undoReply: #"{"knowledgeBitId":"kb_1","variantId":"c1","cardKey":"cloze:1","unburiedVariantIds":["c2","c3"]}"#
            )

            #expect(model.current?.variantId == "c1")
            #expect(model.queue.map(\.variantId) == ["b1"])
        }

        @Test("should hold back a card from a note with a pending offline grade only when siblings are buried")
        func heldBackRules() {
            let preview = try! JSONDecoder().decode(
                IntervalPreview.self,
                from: Data(#"{"again":1,"hard":1,"good":1,"easy":1}"#.utf8)
            )
            let gap = ReviewCard(variantId: "c2", knowledgeBitId: "kb_1", kind: "cloze", prompt: "p", answer: "a", background: nil, phase: "new", leech: false, intervalPreview: preview, cardKey: "cloze:2")
            let basic = ReviewCard(variantId: "b2", knowledgeBitId: "kb_1", kind: "basic", prompt: "p", answer: "a", background: nil, phase: "new", leech: false, intervalPreview: preview)

            #expect(DueReviewModel.isHeldBack(gap, pendingBits: ["kb_1"], pendingVariants: ["c1"], buriesSiblings: true))
            #expect(!DueReviewModel.isHeldBack(gap, pendingBits: ["kb_1"], pendingVariants: ["c1"], buriesSiblings: false))
            #expect(DueReviewModel.isHeldBack(gap, pendingBits: ["kb_1"], pendingVariants: ["c2"], buriesSiblings: false))
            #expect(DueReviewModel.isHeldBack(basic, pendingBits: ["kb_1"], pendingVariants: [], buriesSiblings: false))
        }
    }
}
