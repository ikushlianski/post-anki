import Foundation
import PostAnkiAPI
import Testing

extension SmokeTests {
    @MainActor
    @Suite("Add knowledge sends text or a link and explains refusals")
    struct AddKnowledgeSmokeTests {
        private let created = #"{"id":"src_1","status":"pending"}"#

        private func sentBody() -> NSDictionary? {
            FakeServer.writes.first { $0.path == "/knowledge-sources" }?.bodyObject
        }

        @Test("should treat only a lone http or https link as a link", arguments: [
            ("https://example.com/a?b=1", true),
            ("  http://example.com  ", true),
            ("https://example.com read this", false),
            ("example.com", false),
            ("ftp://example.com/file", false),
            ("two\nlines https://example.com", false)
        ])
        func classifies(raw: String, isLink: Bool) {
            guard let content = AddKnowledgeInput.classify(raw) else { Issue.record("expected content"); return }

            if case .url = content { #expect(isLink) } else { #expect(!isLink) }
        }

        @Test("should ignore blank input")
        func blank() {
            #expect(AddKnowledgeInput.classify("  \n ") == nil)
        }

        @Test("should send pasted prose as text with the chosen subject")
        func sendsText() async {
            let session = FakeServerSession(["POST /knowledge-sources": .json(200, created), "POST /knowledge-sources/detect-bits": .status(200)])
            defer { session.end() }

            let model = IngestionDictationScreenModel(topic: nil, subjectId: nil)
            model.subjectPicker.selectedId = "sub_1"
            model.text = "Mitochondria make energy."

            await model.submit()

            let body = sentBody()
            #expect(body?["text"] as? String == "Mitochondria make energy.")
            #expect(body?["url"] == nil)
            #expect(body?["subjectId"] as? String == "sub_1")
            #expect(model.hasSent)
            #expect(model.text.isEmpty)
        }

        @Test("should send a lone link as a link")
        func sendsLink() async {
            let session = FakeServerSession(["POST /knowledge-sources": .json(200, created), "POST /knowledge-sources/detect-bits": .status(200)])
            defer { session.end() }

            let model = IngestionDictationScreenModel(topic: nil, subjectId: nil)
            model.text = " https://example.com/post "

            await model.submit()

            let body = sentBody()
            #expect(body?["url"] as? String == "https://example.com/post")
            #expect(body?["text"] == nil)
        }

        @Test("should keep a course subject over the picker")
        func courseSubjectWins() async {
            let session = FakeServerSession(["POST /knowledge-sources": .json(200, created), "POST /knowledge-sources/detect-bits": .status(200)])
            defer { session.end() }

            let model = IngestionDictationScreenModel(topic: nil, subjectId: "course_sub")
            model.subjectPicker.selectedId = "other"
            model.text = "Some text"

            await model.submit()

            #expect(sentBody()?["subjectId"] as? String == "course_sub")
            #expect(!model.showsSubjectPicker)
        }

        @Test("should show the server's reason and keep the text when a source is refused", arguments: [
            ("fetch_failed", "That page could not be opened."),
            ("empty_content", "That page has no readable text."),
            ("subject_has_children", "This subject has sub-subjects. Choose one of them."),
            ("text_too_long", "This text is longer than 50,000 characters. Split it into smaller blocks.")
        ])
        func refusals(code: String, message: String) async {
            let session = FakeServerSession(["POST /knowledge-sources": .json(409, #"{"error":"\#(code)"}"#)])
            defer { session.end() }

            let model = IngestionDictationScreenModel(topic: nil, subjectId: nil)
            model.text = "Some text"

            await model.submit()

            #expect(model.errorMessage == message)
            #expect(!model.canAddAnyway)
            #expect(model.text == "Some text")
            #expect(!model.hasSent)
        }

        @Test("should offer Add anyway for a duplicate and resend with force")
        func forceRetry() async {
            let session = FakeServerSession(["POST /knowledge-sources": .json(409, #"{"error":"already_added"}"#)])
            defer { session.end() }

            let model = IngestionDictationScreenModel(topic: nil, subjectId: nil)
            model.text = "https://example.com/dup"

            await model.submit()

            #expect(model.errorMessage == "This was already added.")
            #expect(model.canAddAnyway)
            #expect(sentBody()?["force"] == nil)

            FakeServer.start([
                "POST /knowledge-sources": .json(200, #"{"id":"src_2","status":"pending"}"#),
                "POST /knowledge-sources/detect-bits": .status(200)
            ])

            await model.addAnyway()

            let body = sentBody()
            #expect(body?["force"] as? Bool == true)
            #expect(body?["url"] as? String == "https://example.com/dup")
            #expect(model.hasSent)
            #expect(!model.canAddAnyway)
            #expect(model.errorMessage == nil)
        }

        @Test("should fall back to No subject when subjects cannot be loaded")
        func pickerFallback() async {
            let session = FakeServerSession(["/subjects": .status(500)])
            defer { session.end() }

            let model = AddKnowledgeSubjectPickerModel()
            await model.load()

            #expect(model.loadFailed)
            #expect(model.subjects.isEmpty)
            #expect(model.selectedId == nil)
        }

        @Test("should list subjects for the picker")
        func pickerLoads() async {
            let session = FakeServerSession(["/subjects": .json(200, #"[{"id":"s1","name":"Biology","description":null}]"#)])
            defer { session.end() }

            let model = AddKnowledgeSubjectPickerModel()
            await model.load()

            #expect(model.subjects.map(\.name) == ["Biology"])
            #expect(!model.loadFailed)
        }
    }
}
