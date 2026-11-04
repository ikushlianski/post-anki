import Foundation
import PostAnkiAPI
import Testing

extension SmokeTests {
    @MainActor
    @Suite("Triage starts from a subject list")
    struct TriageSubjectEntrySmokeTests {
        private let subjects = #"[{"subjectId":"sub1","name":"German","path":"Languages / German","pendingCount":2},{"subjectId":"sub2","name":"Cooking","path":"Cooking","pendingCount":1},{"subjectId":"sub3","name":"Empty","path":"Empty","pendingCount":0}]"#

        private func pending() -> String {
            FocusTriageFixtures.list([
                FocusTriageFixtures.source("s1", subjectId: "sub1", bits: [FocusTriageFixtures.bit("a"), FocusTriageFixtures.bit("b")]),
                FocusTriageFixtures.source("s2", subjectId: "sub2", bits: [FocusTriageFixtures.bit("c")])
            ])
        }

        @Test("should list subjects with pending cards and their counts, skipping empty ones")
        func listsSubjectsWithCounts() async {
            let session = FakeServerSession(["/knowledge-bits/pending-review/subjects": .json(200, subjects)])
            defer { session.end() }

            let model = TriageSubjectsModel()

            await model.load()

            #expect(model.rows.map(\.subjectId) == ["sub1", "sub2"])
            #expect(model.totalPending == 3)
            #expect(TriageSubjectsText.triageAll(model.totalPending) == "Triage all (3)")
        }

        @Test("should show a retryable error and no rows when the subject list cannot load")
        func reportsLoadFailure() async {
            let session = FakeServerSession(["/knowledge-bits/pending-review/subjects": .json(500, "{}")])
            defer { session.end() }

            let model = TriageSubjectsModel()

            await model.load()

            #expect(model.rows.isEmpty)
            #expect(model.errorMessage != nil)
            #expect(!model.hasLoaded)
        }

        @Test("should triage only the chosen subject and everything when no subject is chosen")
        func filtersQueueBySubject() async {
            let session = FakeServerSession(["/knowledge-bits/pending-review": .json(200, pending())])
            defer { session.end() }

            let list = PendingReviewListModel()

            await list.load()

            let triage = PendingReviewTriageModel(list: list, decisionQueue: .isolated())

            #expect(triage.remaining == 3)

            triage.subjectFilter = "sub1"

            #expect(triage.queue.map(\.id) == ["a", "b"])

            triage.subjectFilter = nil

            #expect(triage.remaining == 3)
        }
    }
}
