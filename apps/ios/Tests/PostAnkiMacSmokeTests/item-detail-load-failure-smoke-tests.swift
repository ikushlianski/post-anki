import Foundation
import PostAnkiAPI
import Testing

extension SmokeTests {
    @MainActor
    @Suite("Item detail says when its note or cards could not be loaded")
    struct ItemDetailLoadFailureSmokeTests {
        private static let item = Wire.decode(
            KnowledgeOverviewItem.self,
            #"{"knowledgeBitId":"kb_1","question":"Q?","answer":"A","subjectId":"s_a","state":"review","dueAt":null,"lapses":0}"#
        )

        @Test("should not open any editor and should say so when the note lookup fails")
        func noteLookupFails() async {
            let session = FakeServerSession(["/knowledge-bits/kb_1": .status(500)])
            defer { session.end() }
            let model = KnowledgeItemActionsModel(item: Self.item)

            let opens = await model.prepareEdit()

            #expect(!opens)
            #expect(model.noteSource == nil)
            #expect(model.message?.contains("Couldn't load") == true)
        }

        @Test("should open the question editor without an error when the item simply has no note")
        func noNote() async {
            let session = FakeServerSession(["/knowledge-bits/kb_1": .json(200, #"{"knowledgeBitId":"kb_1","phrasings":[]}"#)])
            defer { session.end() }
            let model = KnowledgeItemActionsModel(item: Self.item)

            let opens = await model.prepareEdit()

            #expect(opens)
            #expect(model.noteSource == nil)
            #expect(model.message == nil)
        }

        @Test("should show the Cards section with a failure when the cards cannot be loaded")
        func cardsFail() async {
            let session = FakeServerSession(["/knowledge-bits/kb_1": .failure(.notConnectedToInternet)])
            defer { session.end() }
            let model = KnowledgeItemCardsModel(bitId: "kb_1")

            await model.load()

            #expect(model.loadFailed)
            #expect(model.showsCards)
        }

        @Test("should clear the failure once a later load succeeds")
        func cardsRecover() async {
            let session = FakeServerSession(["/knowledge-bits/kb_1": .json(200, #"{"knowledgeBitId":"kb_1","cards":[]}"#)])
            defer { session.end() }
            let model = KnowledgeItemCardsModel(bitId: "kb_1")
            model.loadFailed = true

            await model.load()

            #expect(!model.loadFailed)
            #expect(!model.showsCards)
        }
    }

    @MainActor
    @Suite("Study material generation and domain accept say when they time out or fail")
    struct GenerationTimeoutSmokeTests {
        private static let generating = #"[{"id":"m_1","kind":"analogy","status":"generating","body":null,"citations":[],"failureReason":null}]"#
        private static let recommendation = #"{"id":"dr_1","domainNodeId":"n_1","axis":"deepen","reason":"r","status":"accepted","createdCurriculumId":"c_1"}"#

        @Test("should say it is still generating when polling runs out while a material is generating")
        func materialsTimeOut() async {
            let session = FakeServerSession(["/topics/t_1/study-materials": .json(200, Self.generating)])
            defer { session.end() }
            let model = StudyMaterialsModel(topicId: "t_1", pollInterval: .milliseconds(1), pollLimit: 2)

            await model.load()

            #expect(model.timedOut)
        }

        @Test("should show an error instead of polling silently when refreshes keep failing")
        func materialsPollFails() async {
            let session = FakeServerSession(["/topics/t_1/study-materials": .json(200, Self.generating)])
            let model = StudyMaterialsModel(topicId: "t_1", pollInterval: .milliseconds(1), pollLimit: 10)
            model.items = try! JSONDecoder().decode([StudyMaterial].self, from: Data(Self.generating.utf8))
            session.end()
            let offline = FakeServerSession(["/topics/t_1/study-materials": .failure(.notConnectedToInternet)])
            defer { offline.end() }

            await model.request(kind: "analogy")

            #expect(model.errorMessage != nil)
            #expect(!model.timedOut)
        }

        @Test("should say the subject could not be opened when the course lookup fails after accept")
        func acceptLookupFails() async {
            let session = FakeServerSession([
                "PATCH /domain-recommendations/dr_1": .json(200, Self.recommendation),
                "/curricula": .status(500),
                "/subjects/s_1/domain-recommendations": .json(200, "[]")
            ])
            defer { session.end() }
            let model = DomainRecommendationModel(subjectId: "s_1")
            let item = Wire.decode(DomainRecommendation.self, Self.recommendation)

            await model.accept(item)

            #expect(model.createdCourse == nil)
            #expect(model.notice == DomainRecommendationModel.courseNotFoundNotice)
        }

        @Test("should say a timed out accept may have finished")
        func acceptTimesOut() async {
            let session = FakeServerSession(["PATCH /domain-recommendations/dr_1": .failure(.timedOut), "/subjects/s_1/domain-recommendations": .json(200, "[]")])
            defer { session.end() }
            let model = DomainRecommendationModel(subjectId: "s_1")

            await model.accept(Wire.decode(DomainRecommendation.self, Self.recommendation))

            #expect(model.notice?.contains("took too long") == true)
        }
    }
}
