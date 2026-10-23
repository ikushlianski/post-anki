import Foundation
import PostAnkiAPI
import Testing

extension SmokeTests {
    @MainActor
    @Suite("Third review fixes hold against a fake server")
    struct ReviewFixes3SmokeTests {
        private let subject = try! JSONDecoder().decode(
            PracticeSubject.self,
            from: Data(#"{"id":"sub_02","name":"Russian","kind":"language-practice"}"#.utf8)
        )

        @Test("should not show an offline error when the learning list load is cancelled")
        func learningListCancelledIsSilent() async {
            let session = FakeServerSession(["/learning-list-items": .failure(.cancelled)])
            defer { session.end() }

            let model = LearningListModel()

            await model.load()

            #expect(model.errorMessage == nil)
            #expect(model.failureKind == nil)
        }

        @Test("should not show an offline error when the tags load is cancelled")
        func tagsCancelledIsSilent() async {
            let session = FakeServerSession([
                "/tags": .failure(.cancelled),
                "/tags/mastery": .failure(.cancelled)
            ])
            defer { session.end() }

            let model = TagsModel()

            await model.load()

            #expect(model.errorMessage == nil)
            #expect(model.failureKind == nil)
        }

        @Test("should not call a cancelled request offline in the shared study message")
        func studyMessageForCancelled() {
            let cancelled = StudyToolsError.message(for: URLError(.cancelled))
            let offline = StudyToolsError.message(for: URLError(.notConnectedToInternet))

            #expect(!cancelled.localizedCaseInsensitiveContains("offline"))
            #expect(offline.localizedCaseInsensitiveContains("offline"))
        }

        @Test("should send only the most recent chat turns to the tutor")
        func chatSendsRecentTurns() async {
            var received = 0
            let model = StudyChatModel { _, transcript in
                received = transcript.count

                return StudyChatReply(reply: "ok", matchedCards: [], lookupFailed: false)
            }

            for index in 0..<150 {
                model.turns.append(StudyChatTurn(entry: ChatTranscriptEntry(role: "user", text: "turn \(index)")))
            }

            model.draft = "next question"
            await model.send()

            #expect(received == [ChatTranscriptEntry].recentTurnLimit)
            #expect(model.errorMessage == nil)
        }

        @Test("should keep the newest turns when trimming a long transcript")
        func recentTurnsKeepsNewest() {
            let entries = (0..<30).map { ChatTranscriptEntry(role: "user", text: "turn \($0)") }

            #expect(entries.recentTurns.last?.text == "turn 29")
            #expect(entries.recentTurns.first?.text == "turn 18")
        }

        @Test("should tell a signed-out learner to check Settings in the knowledge-item chat")
        func knowledgeItemChatSignedOut() async {
            let session = FakeServerSession(["/knowledge-bits/kb_1/chat": .status(401)])
            defer { session.end() }

            let model = KnowledgeItemChatModel(knowledgeBitId: "kb_1", bitBody: "body")

            model.draft = "hello"
            await model.send()

            #expect(model.errorMessage?.contains("Settings") == true)
            #expect(model.draft == "hello")
            #expect(model.transcript.isEmpty)
        }

        @Test("should keep the in-progress practice batch when the sidebar switches away and back")
        func practiceBatchSurvivesSwitch() async {
            let session = FakeServerSession([
                "/subjects/sub_02/practice-settings": .fixture("practice-settings"),
                "/subjects/sub_02/phrase-batches": .fixture("phrase-batch")
            ])
            defer { session.end() }

            let store = PracticeModelStore()
            let first = store.model(for: subject)

            await first.start()

            let second = store.model(for: subject)

            await second.start()

            #expect(first === second)
            #expect(second.phrases.map(\.id) == ["ph_01", "ph_02"])
            #expect(FakeServer.requested.filter { $0.hasSuffix("/phrase-batches") }.count == 1)
        }

        @Test("should start a fresh practice model after the server settings change")
        func practiceStoreResets() {
            let store = PracticeModelStore()
            let before = store.model(for: subject)

            store.reset()

            #expect(store.model(for: subject) !== before)
        }
    }
}
