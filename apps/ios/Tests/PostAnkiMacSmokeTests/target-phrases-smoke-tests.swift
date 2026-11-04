import Foundation
import PostAnkiAPI
import Testing

extension SmokeTests {
    @MainActor
    @Suite("Target phrases appear only for English subjects")
    struct TargetPhrasesSmokeTests {
        private let subjects = [
            Subject(id: "en", name: "english", description: nil, parentId: nil),
            Subject(id: "en_gr", name: "Grammar", description: nil, parentId: "en"),
            Subject(id: "en_gr_t", name: "Tenses", description: nil, parentId: "en_gr"),
            Subject(id: "fin", name: "Finance", description: nil, parentId: nil),
            Subject(id: "fin_en", name: "English law", description: nil, parentId: "fin")
        ]

        @Test("should show the section for English and any sub-subject of it")
        func englishAncestry() {
            #expect(TargetPhrases.isEnglish(subjectId: "en", subjects: subjects))
            #expect(TargetPhrases.isEnglish(subjectId: "en_gr_t", subjects: subjects))
        }

        @Test("should hide the section for other subjects or none")
        func nonEnglish() {
            #expect(!TargetPhrases.isEnglish(subjectId: "fin", subjects: subjects))
            #expect(!TargetPhrases.isEnglish(subjectId: "fin_en", subjects: subjects))
            #expect(!TargetPhrases.isEnglish(subjectId: nil, subjects: subjects))
            #expect(!TargetPhrases.isEnglish(subjectId: "missing", subjects: subjects))
        }

        @Test("should trim, drop empties, dedupe ignoring case and cap at five")
        func cleaning() {
            let cleaned = TargetPhrases.cleaned([" Thorough ", "", "  ", "thorough", "a", "b", "c", "d", "e"])

            #expect(cleaned == ["Thorough", "a", "b", "c", "d"])
        }

        @Test("should send cleaned phrases for English, omit them otherwise, and reset after adding")
        func sendsAndResets() async {
            let session = FakeServerSession([
                "GET /subjects": .json(200, #"[{"id":"en","name":"English","parentId":null}]"#),
                "POST /knowledge-sources": .json(200, #"{"id":"src_1","status":"pending"}"#),
                "POST /knowledge-sources/detect-bits": .status(200)
            ])
            defer { session.end() }

            let model = IngestionDictationScreenModel(topic: nil, subjectId: "en")
            await model.loadSubjects()
            model.text = "Some text"
            model.targetPhrases = [" thorough ", "", "Thorough"]

            #expect(model.showsTargetPhrases)

            await model.submit()

            let body = FakeServer.writes.first { $0.path == "/knowledge-sources" }?.bodyObject
            #expect(body?["targetPhrases"] as? [String] == ["thorough"])
            #expect(model.targetPhrases == [""])
        }
    }
}
