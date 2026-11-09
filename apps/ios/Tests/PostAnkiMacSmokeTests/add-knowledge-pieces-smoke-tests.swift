import Foundation
import PostAnkiAPI
import Testing

extension SmokeTests {
    @MainActor
    @Suite("Add knowledge sends several pieces under one subject")
    struct AddKnowledgePiecesSmokeTests {
        private let detect = "POST /knowledge-sources/detect-bits"

        private func sentBodies() -> [NSDictionary] {
            FakeServer.writes.filter { $0.path == "/knowledge-sources" }.compactMap(\.bodyObject)
        }

        private func twoPieces() -> IngestionDictationScreenModel {
            let model = IngestionDictationScreenModel(topic: nil, subjectId: nil, drafts: InMemoryAddDraftStore())

            model.text = "First idea."
            model.addPiece()
            model.setText("Second idea.", for: model.pieces[1].id)

            return model
        }

        @Test("should send every non-empty piece with the one chosen subject and clear them all")
        func sendsAll() async {
            let session = FakeServerSession([
                "POST /knowledge-sources": .json(200, #"{"id":"src_1","status":"pending"}"#),
                detect: .status(200)
            ])
            defer { session.end() }

            let model = twoPieces()
            model.addPiece()
            model.subjectPicker.selectedId = "sub_1"

            await model.submit()

            let bodies = sentBodies()
            #expect(bodies.map { $0["text"] as? String } == ["First idea.", "Second idea."])
            #expect(bodies.allSatisfy { $0["subjectId"] as? String == "sub_1" })
            #expect(model.pieces.count == 1)
            #expect(model.text.isEmpty)
            #expect(model.hasSent)
            #expect(model.errorMessage == nil)
        }

        @Test("should send each piece with its own highlights")
        func ownHighlights() async {
            let session = FakeServerSession([
                "POST /knowledge-sources": .json(200, #"{"id":"src_1","status":"pending"}"#),
                detect: .status(200)
            ])
            defer { session.end() }

            let model = twoPieces()
            model.pieces[1].highlights = [KnowledgeHighlight(start: 0, end: 6)]

            await model.submit()

            let bodies = sentBodies()
            #expect(bodies[0]["highlights"] == nil)
            #expect(bodies[1]["highlights"] as? [[String: Int]] == [["start": 0, "end": 6]])
        }

        @Test("should keep only the failed piece with its reason and clear the sent one")
        func partialFailure() async {
            let session = FakeServerSession([
                "POST /knowledge-sources": .sequence([
                    .json(200, #"{"id":"src_1","status":"pending"}"#),
                    .json(409, #"{"error":"fetch_failed"}"#)
                ]),
                detect: .status(200)
            ])
            defer { session.end() }

            let model = twoPieces()

            await model.submit()

            #expect(model.pieces.map(\.text) == ["Second idea."])
            #expect(model.pieces[0].failure == "That page could not be opened.")
            #expect(model.errorMessage == "Piece 1 could not be added. Try again.")
            #expect(model.hasSent)
        }

        @Test("should name the failed pieces when several fail and send nothing as sent")
        func allFail() async {
            let session = FakeServerSession(["POST /knowledge-sources": .json(409, #"{"error":"empty_content"}"#)])
            defer { session.end() }

            let model = twoPieces()

            await model.submit()

            #expect(model.pieces.map(\.text) == ["First idea.", "Second idea."])
            #expect(model.errorMessage == "Pieces 1, 2 could not be added. Try again.")
            #expect(model.pieces.allSatisfy { $0.failure == "That page has no readable text." })
            #expect(!model.hasSent)
        }

        @Test("should resend only the duplicate piece with force when asked to add anyway")
        func addAnywayOnePiece() async {
            let session = FakeServerSession([
                "POST /knowledge-sources": .sequence([
                    .json(409, #"{"error":"already_added"}"#),
                    .json(200, #"{"id":"src_2","status":"pending"}"#)
                ]),
                detect: .status(200)
            ])
            defer { session.end() }

            let model = twoPieces()

            await model.submit()

            #expect(model.pieces.count == 1)
            #expect(model.pieces[0].text == "First idea.")
            #expect(model.pieces[0].canAddAnyway)

            FakeServer.start([
                "POST /knowledge-sources": .json(200, #"{"id":"src_3","status":"pending"}"#),
                detect: .status(200)
            ])

            await model.addAnyway(pieceId: model.pieces[0].id)

            #expect(sentBodies().map { $0["force"] as? Bool } == [true])
            #expect(model.pieces.count == 1)
            #expect(model.text.isEmpty)
        }

        @Test("should remove a piece but always keep one to type in")
        func removing() {
            let model = twoPieces()

            model.removePiece(model.pieces[1].id)
            #expect(model.pieces.map(\.text) == ["First idea."])

            model.removePiece(model.pieces[0].id)
            #expect(model.pieces.count == 1)
            #expect(model.text.isEmpty)
        }

        @Test("should bring all unsent pieces back from the draft")
        func draftRestores() {
            let drafts = InMemoryAddDraftStore()
            let first = IngestionDictationScreenModel(topic: nil, subjectId: nil, drafts: drafts)

            first.text = "One"
            first.addPiece()
            first.setText("Two", for: first.pieces[1].id)

            let second = IngestionDictationScreenModel(topic: nil, subjectId: nil, drafts: drafts)

            #expect(second.pieces.map(\.text) == ["One", "Two"])
            #expect(second.hasInput)
        }

        @Test("should never bring back raw draft data when several long pieces exceed the draft limit")
        func longDraftStaysReadable() {
            let drafts = UserDefaultsAddDraftStore(defaults: UserDefaults(suiteName: "pieces-\(UUID().uuidString)")!)
            let first = IngestionDictationScreenModel(topic: nil, subjectId: nil, drafts: drafts)

            first.text = String(repeating: "a\n\"b\" ", count: 3_000)
            first.addPiece()
            first.setText(String(repeating: "second ", count: 3_000), for: first.pieces[1].id)

            let second = IngestionDictationScreenModel(topic: nil, subjectId: nil, drafts: drafts)

            #expect(second.pieces.count == 2)
            #expect(second.pieces.allSatisfy { !$0.text.contains("post-anki-pieces:") && !$0.text.hasPrefix("[") })
            #expect(second.pieces[1].text.hasPrefix("second second"))
        }

        @Test("should start empty rather than show a broken multi-piece draft")
        func brokenDraftIsDropped() {
            #expect(AddKnowledgePieceDraft.decode(#"post-anki-pieces:["cut off"#) == [""])
        }

        @Test("should keep text typed into a piece while it was being sent")
        func keepsTextTypedDuringSend() async {
            let session = FakeServerSession([
                "POST /knowledge-sources": .held(200, #"{"id":"src_1","status":"pending"}"#),
                detect: .status(200)
            ])
            defer { session.end() }

            let model = IngestionDictationScreenModel(topic: nil, subjectId: nil, drafts: InMemoryAddDraftStore())

            model.text = "Sent text."

            let sending = Task { await model.submit() }

            while FakeServer.heldCount == 0 { await Task.yield() }

            model.text = "Sent text. And more typed meanwhile."
            FakeServer.releaseHeld()
            await sending.value

            #expect(model.pieces.map(\.text) == ["Sent text. And more typed meanwhile."])
        }

        @Test("should use the subject chosen when Submit was pressed for every piece")
        func subjectFrozenDuringSend() async {
            let session = FakeServerSession([
                "POST /knowledge-sources": .held(200, #"{"id":"src_1","status":"pending"}"#),
                detect: .status(200)
            ])
            defer { session.end() }

            let model = twoPieces()

            model.subjectPicker.selectedId = "sub_1"

            let sending = Task { await model.submit() }

            while FakeServer.heldCount == 0 { await Task.yield() }

            model.subjectPicker.selectedId = "sub_2"
            FakeServer.releaseHeld()

            while FakeServer.heldCount == 0, !model.pieces.isEmpty, model.isSubmitting { await Task.yield() }

            FakeServer.releaseHeld()
            await sending.value

            #expect(sentBodies().map { $0["subjectId"] as? String } == ["sub_1", "sub_1"])
        }
    }
}
