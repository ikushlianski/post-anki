import Foundation
import PostAnkiAPI
import Testing

extension SmokeTests {
    @MainActor
    @Suite("Move sheet says when subjects failed to load")
    struct MoveSheetSubjectsFailureSmokeTests {
        private static let item = Wire.decode(
            KnowledgeOverviewItem.self,
            #"{"knowledgeBitId":"kb_1","question":"Q?","answer":"A","subjectId":"s_a","state":"review","dueAt":null,"lapses":0}"#
        )

        private let subjects = "[{\"id\":\"a\",\"name\":\"Business\",\"description\":null,\"parentId\":null}]"

        @Test("should show a could-not-load notice when subjects fail and clear it after a successful retry")
        func noticeAndRetry() async {
            let session = FakeServerSession(["/subjects": .status(500)])
            defer { session.end() }
            let model = KnowledgeItemActionsModel(item: Self.item)

            await model.loadSubjects()

            #expect(model.subjectsNotice == SubjectListNotice.moveSheet)

            FakeServer.start(["/subjects": .json(200, subjects)])

            await model.loadSubjects()

            #expect(model.subjectsNotice == nil)
            #expect(model.subjects.count == 1)
        }

        @Test("should stay silent when subjects loaded or none exist")
        func silentWhenEmptyOrLoaded() {
            #expect(SubjectListNotice.moveSheetMessage(failed: false, subjectCount: 0) == nil)
            #expect(SubjectListNotice.moveSheetMessage(failed: true, subjectCount: 2) == nil)
            #expect(SubjectListNotice.moveSheetMessage(failed: true, subjectCount: 0) == SubjectListNotice.moveSheet)
        }
    }
}
