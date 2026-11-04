import Foundation
import PostAnkiAPI
import Testing

extension SmokeTests {
    @MainActor
    @Suite("Suggesting a replacement card")
    struct CardReplacementSmokeTests {
        private let transcript = [
            ChatTranscriptEntry(role: "user", text: "Why?"),
            ChatTranscriptEntry(role: "assistant", text: "Because.")
        ]

        private let draftBody = #"{"sources":[],"card":{"front":"F","back":"B","sources":[],"usedWebSearch":false}}"#

        @Test("should show the proposal after drafting and discard it on ignore")
        func draftThenIgnore() async {
            let session = FakeServerSession(["/knowledge-bits/kb_1/chat/draft": .json(200, draftBody)])
            defer { session.end() }

            let model = CardReplacementModel(knowledgeBitId: "kb_1")
            await model.draft(transcript: transcript)

            #expect(model.proposal?.front == "F")

            model.ignore()

            #expect(model.proposal == nil)
            #expect(model.phase == .idle)
        }

        @Test("should report a draft failure and allow trying again")
        func draftFailure() async {
            let session = FakeServerSession(["/knowledge-bits/kb_1/chat/draft": .status(500)])
            defer { session.end() }

            let model = CardReplacementModel(knowledgeBitId: "kb_1")
            await model.draft(transcript: transcript)

            #expect(model.draftError != nil)
            #expect(model.phase == .idle)
        }

        @Test("should only continue to the old card after the replacement is saved")
        func acceptSavesThenContinues() async {
            let session = FakeServerSession([
                "/knowledge-bits/kb_1/chat/draft": .json(200, draftBody),
                "/knowledge-bits/kb_1/derived-items": .json(200, #"{"id":"kb_2"}"#)
            ])
            defer { session.end() }

            let model = CardReplacementModel(knowledgeBitId: "kb_1")
            await model.draft(transcript: transcript)

            var continued = false
            await model.accept { continued = true }

            #expect(continued)
            #expect(model.saveError == nil)
        }

        @Test("should keep the proposal and not continue when saving fails")
        func acceptFailureKeepsOldCard() async {
            let session = FakeServerSession([
                "/knowledge-bits/kb_1/chat/draft": .json(200, draftBody),
                "/knowledge-bits/kb_1/derived-items": .status(500)
            ])
            defer { session.end() }

            let model = CardReplacementModel(knowledgeBitId: "kb_1")
            await model.draft(transcript: transcript)

            var continued = false
            await model.accept { continued = true }

            #expect(!continued)
            #expect(model.saveError != nil)
            #expect(model.proposal?.front == "F")
        }
    }
}
