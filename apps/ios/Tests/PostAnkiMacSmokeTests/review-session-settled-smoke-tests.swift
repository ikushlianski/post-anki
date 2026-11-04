import Foundation
import PostAnkiAPI
import Testing

extension SmokeTests {
    @MainActor
    @Suite("Review does not bring back cards already graded in the session, and Enter keys confirm")
    struct ReviewSessionSettledSmokeTests {
        private func tempFile() -> URL {
            FileManager.default.temporaryDirectory.appendingPathComponent("settled-\(UUID().uuidString).json")
        }

        private func cardsJSON(_ range: ClosedRange<Int>) -> String {
            let cards = range.map { index -> String in
                let id = String(format: "%02d", index)

                return """
                {"variantId":"v\(id)","knowledgeBitId":"k\(id)","kind":"wh_question","prompt":"Q\(id)","answer":"A\(id)",\
                "background":null,"isAiGenerated":false,"sourceLinks":[],"phase":"learning","leech":false,\
                "intervalPreview":{"again":60,"hard":360,"good":600,"easy":3600}}
                """
            }

            return """
            {"cards":[\(cards.joined(separator: ","))],"counts":{"new":0,"learning":\(range.count),"review":0},\
            "newRemainingToday":0,"nextDueAt":null}
            """
        }

        private static let gradeResult = #"{"reviewId":"rev_1","knowledgeBitId":"k01","phase":"learning","dueAt":"2026-10-28T09:00:00.000Z","intervalDays":0,"lapses":0,"leech":false,"suspended":false}"#

        private func shownIds(_ model: DueReviewModel) -> [String] {
            (model.current.map { [$0.variantId] } ?? []) + model.queue.map(\.variantId)
        }

        private func gradeFirstThenReload(_ grade: ReviewGrade) async -> [String] {
            let file = tempFile()
            defer { try? FileManager.default.removeItem(at: file) }

            let session = FakeServerSession([
                "/knowledge-bits/review-cards": .json(200, cardsJSON(1...3)),
                "/knowledge-bits/reviews": .json(200, Self.gradeResult)
            ])
            defer { session.end() }

            let model = DueReviewModel(gradeQueue: PendingGradeQueue(fileURL: file), retryDelay: nil)

            await model.load()
            model.reveal()
            await model.grade(grade)
            await model.sendTask?.value
            await model.load()

            let ids = shownIds(model)

            await model.stopBackgroundWork()

            return ids
        }

        @Test("should not bring a learning card back after it was graded Good")
        func goodCardStaysGone() async {
            #expect(!(await gradeFirstThenReload(.good)).contains("v01"))
        }

        @Test("should not bring a learning card back after it was graded Hard")
        func hardCardStaysGone() async {
            #expect(!(await gradeFirstThenReload(.hard)).contains("v01"))
        }

        @Test("should bring a card back after it was graded Again")
        func againCardReturns() async {
            #expect((await gradeFirstThenReload(.again)).contains("v01"))
        }

        @Test("should never filter out a rehearsal follow-up of a graded card")
        func rehearsalIsNotFiltered() {
            let preview = try! JSONDecoder().decode(IntervalPreview.self, from: Data(#"{"again":1,"hard":1,"good":1,"easy":1}"#.utf8))
            let card = ReviewCard(variantId: "a", knowledgeBitId: "k", kind: "wh_question", prompt: "p", answer: "a", background: nil, phase: "review", leech: false, intervalPreview: preview)

            #expect(DueReviewModel.isSettled(card, settledVariantIds: ["a"], settledBitIds: ["k"]))
            #expect(!DueReviewModel.isSettled(card.asRehearsal, settledVariantIds: ["a"], settledBitIds: ["k"]))
        }

        @Test("should treat Space, Return and numpad Enter as the confirm key")
        func confirmKeyCodes() {
            #expect(ReviewConfirmKey.isConfirmKeyCode(49))
            #expect(ReviewConfirmKey.isConfirmKeyCode(36))
            #expect(ReviewConfirmKey.isConfirmKeyCode(76))
            #expect(!ReviewConfirmKey.isConfirmKeyCode(0))
        }

        @Test("should not confirm while typing, with command modifiers, on key repeat or with a sheet open")
        func confirmIsGated() {
            func confirm(
                _ code: UInt16,
                command: Bool = false,
                typing: Bool = false,
                repeating: Bool = false,
                overlay: Bool = false
            ) -> Bool {
                ReviewConfirmKey.shouldConfirm(keyCode: code, hasCommandModifiers: command, isEditingText: typing, isRepeat: repeating, isOverlayShown: overlay)
            }

            for code in [UInt16(49), 36, 76] {
                #expect(confirm(code))
                #expect(!confirm(code, command: true))
                #expect(!confirm(code, typing: true))
                #expect(!confirm(code, repeating: true))
                #expect(!confirm(code, overlay: true))
            }
        }
    }
}
