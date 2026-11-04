import Foundation
import Testing

extension SmokeTests {
    @MainActor
    @Suite("Learning list and Rejected cards say when subjects failed to load")
    struct SubjectListFailureSmokeTests {
        private let subjects = "[{\"id\":\"a\",\"name\":\"Business\",\"description\":null,\"parentId\":null}]"

        @Test("should show a notice on the Learning list when subjects fail and clear it after a successful retry")
        func learningListNoticeAndRetry() async {
            let session = FakeServerSession(["/subjects": .status(500)])
            defer { session.end() }
            let model = LearningListModel()

            await model.loadSubjects()

            #expect(model.subjectsNotice == SubjectListNotice.learningList)

            FakeServer.start(["/subjects": .json(200, subjects)])

            await model.loadSubjects()

            #expect(model.subjectsNotice == nil)
            #expect(model.subjects.count == 1)
        }

        @Test("should show a notice on the Rejected cards filter when subjects fail and clear it after retry")
        func rejectedFilterNoticeAndRetry() async {
            let session = FakeServerSession(["/subjects": .status(500)])
            defer { session.end() }
            let model = RejectedCardsModel()

            await model.loadSubjects()

            #expect(model.subjectsNotice == SubjectListNotice.rejectedFilter)

            FakeServer.start(["/subjects": .json(200, subjects)])

            await model.loadSubjects()

            #expect(model.subjectsNotice == nil)
            #expect(model.subjectOptions.count == 1)
        }

        @Test("should stay silent when subjects loaded or the list is legitimately empty")
        func noNoticeOnSuccess() {
            #expect(SubjectListNotice.learningListMessage(failed: false, subjectCount: 0) == nil)
            #expect(SubjectListNotice.learningListMessage(failed: true, subjectCount: 2) == nil)
            #expect(SubjectListNotice.rejectedFilterMessage(failed: false, optionCount: 0) == nil)
        }
    }
}
