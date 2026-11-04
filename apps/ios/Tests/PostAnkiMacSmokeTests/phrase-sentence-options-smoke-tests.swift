import Foundation
import PostAnkiAPI
import Testing

extension SmokeTests {
    @MainActor
    @Suite("Phrase sentence options in triage")
    struct PhraseSentenceOptionsSmokeTests {
        private static func bit(_ id: String, answerChoice: String = #","answerChoice":true"#) -> String {
            let items = (1...3).map {
                #"{"id":"\#(id)_s\#($0)","kind":"basic","prompt":"In a meeting you agree","answer":"Sentence \#($0)"}"#
            }

            return #"{"id":"\#(id)","body":"touch base","background":null,"origin":"extracted","variants":[\#(items.joined(separator: ","))]\#(answerChoice)}"#
        }

        private static func list(_ bits: [String]) -> String {
            FocusTriageFixtures.list([FocusTriageFixtures.source("s1", bits: bits)])
        }

        private func variants(count: Int) throws -> [PendingReviewVariant] {
            let items = (1...count).map { #"{"id":"v\#($0)","kind":"basic","prompt":"p","answer":"a\#($0)"}"# }

            return try JSONDecoder().decode([PendingReviewVariant].self, from: Data("[\(items.joined(separator: ","))]".utf8))
        }

        @Test("should treat a bit with no answerChoice field as an ordinary card")
        func missingFlagIsFalse() throws {
            let source = try FocusTriageFixtures.sources([FocusTriageFixtures.source("s1", bits: [Self.bit("a", answerChoice: "")])])

            #expect(source[0].bits[0].answerChoice == false)
            #expect(source[0].bits[0].offersSentenceChoice == false)
        }

        @Test("should offer a choice only when the bit is flagged and has more than one sentence")
        func offersChoice() throws {
            let source = try FocusTriageFixtures.sources([FocusTriageFixtures.source("s1", bits: [Self.bit("a")])])

            #expect(source[0].bits[0].offersSentenceChoice)
            #expect(source[0].bits[0].withExample("e", aiGeneratedAt: nil).answerChoice)
        }

        @Test("should keep exactly one sentence however many are tapped")
        func keepsExactlyOne() throws {
            var selection = PendingReviewTriageSelection(variants: try variants(count: 3), pickOne: true)

            #expect(selection.keepIds == ["v1"])

            selection.toggle(at: 2)
            selection.toggle(at: 1)

            #expect(selection.keepIds == ["v2"])
            #expect(selection.hint == nil)
        }

        @Test("should move the highlighted sentence with Up and Down and stop at the ends")
        func movesAndClamps() throws {
            var selection = PendingReviewTriageSelection(variants: try variants(count: 3), pickOne: true)

            selection.move(by: -1)
            #expect(selection.keepIds == ["v1"])

            selection.move(by: 1)
            selection.move(by: 1)
            selection.move(by: 1)
            #expect(selection.keepIds == ["v3"])
        }

        @Test("should keep the old two-card rule for an ordinary card")
        func ordinaryCardUnchanged() throws {
            var selection = PendingReviewTriageSelection(variants: try variants(count: 3))

            selection.move(by: 1)

            #expect(!selection.pickOne)
            #expect(selection.keepIds == ["v1"])
        }

        @Test("should map Up, Down, Left and Right to option moves")
        func mapsArrows() {
            #expect(PendingReviewTriageKeyMap.action(for: .up) == .moveOption(-1))
            #expect(PendingReviewTriageKeyMap.action(for: .down) == .moveOption(1))
            #expect(PendingReviewTriageKeyMap.action(for: .left) == .moveOption(-1))
            #expect(PendingReviewTriageKeyMap.action(for: .right) == .moveOption(1))
            #expect(PendingReviewTriageKeyMap.action(for: .returnKey) == .keep)
            #expect(PendingReviewTriageKeyMap.action(for: .character("x")) == .drop)
        }

        @Test("should save only the highlighted sentence when Return is pressed on the Mac")
        func macKeepsChosen() async throws {
            let session = FakeServerSession([
                "/knowledge-bits/pending-review": .json(200, Self.list([Self.bit("a"), FocusTriageFixtures.bit("b", variants: 2)])),
                "POST /knowledge-bits/a/triage": .json(200, #"{"ok":true,"droppedVariantIds":["a_s1","a_s3"]}"#)
            ])
            defer { session.end() }

            let list = PendingReviewListModel()

            await list.load()

            let model = PendingReviewTriageModel(list: list, decisionQueue: .isolated())

            await model.perform(.moveOption(1))
            await model.perform(.keep)
            await model.settlePending()

            let body = FakeServer.writes.first?.bodyObject

            #expect(FakeServer.writes.map(\.path) == ["/knowledge-bits/a/triage"])
            #expect(body?["keepVariantIds"] as? [String] == ["a_s2"])
            #expect(model.list.keptUndo?.restoreVariantIds == ["a_s1", "a_s3"])
        }

        @Test("should ignore Up and Down on an ordinary card")
        func ordinaryCardIgnoresMoves() async throws {
            let session = FakeServerSession(["/knowledge-bits/pending-review": .json(200, Self.list([FocusTriageFixtures.bit("b", variants: 2)]))])
            defer { session.end() }

            let list = PendingReviewListModel()

            await list.load()

            let model = PendingReviewTriageModel(list: list, decisionQueue: .isolated())

            await model.perform(.moveOption(1))

            #expect(!model.selection.pickOne)
            #expect(model.selection.keepIds == ["b_v0"])
        }

        @Test("should save only the chosen sentence on accept and reject the whole phrase on reject")
        func iosAcceptAndReject() async throws {
            let session = FakeServerSession([
                "/knowledge-bits/pending-review": .json(200, Self.list([Self.bit("a"), Self.bit("b")])),
                "POST /knowledge-bits/a/triage": .json(200, #"{"ok":true,"droppedVariantIds":["a_s1","a_s2"]}"#),
                "POST /knowledge-bits/b/reject": .json(200, #"{"feedbackId":null}"#)
            ])
            defer { session.end() }

            let model = FocusTriageModel(list: PendingReviewListModel(), decisionQueue: .isolated())

            await model.load()

            let first = try #require(model.current)

            model.choose(2, in: first)
            await model.approve()
            await model.reject()
            await model.settlePending()

            let writes = FakeServer.writes

            #expect(writes.map(\.path) == ["/knowledge-bits/a/triage", "/knowledge-bits/b/reject"])
            #expect(writes[0].bodyObject?["keepVariantIds"] as? [String] == ["a_s3"])
        }

        @Test("should bring back all three sentences when an accepted phrase is undone")
        func iosUndoRestoresAll() async throws {
            let session = FakeServerSession([
                "/knowledge-bits/pending-review": .json(200, Self.list([Self.bit("a")])),
                "POST /knowledge-bits/a/triage": .json(200, #"{"ok":true,"droppedVariantIds":["a_s2","a_s3"]}"#),
                "POST /knowledge-bits/a/triage/undo": .json(200, #"{"ok":true}"#)
            ])
            defer { session.end() }

            let model = FocusTriageModel(list: PendingReviewListModel(), decisionQueue: .isolated())

            await model.load()
            await model.approve()
            await model.settlePending()
            await model.undo()

            let undo = FakeServer.writes.last

            #expect(undo?.path == "/knowledge-bits/a/triage/undo")
            #expect(undo?.bodyObject?["restoreVariantIds"] as? [String] == ["a_s2", "a_s3"])
            #expect(model.current?.id == "a")
        }
    }
}
