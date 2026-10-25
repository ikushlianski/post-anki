import Foundation
import PostAnkiAPI
import Testing

extension SmokeTests {
    @MainActor
    @Suite("Focus triage subject filter recovery")
    struct FocusTriageSubjectFilterSmokeTests {
        private let started = #"{"id":"ts1","subjectId":null,"status":"open","startedAt":"2026-10-25T10:00:00.000Z","endedAt":null,"acceptedCount":0,"rejectedCount":0,"feedbackText":null,"notes":[]}"#
        private let finished = #"{"id":"ts1","subjectId":null,"status":"distilled","startedAt":"2026-10-25T10:00:00.000Z","endedAt":"2026-10-25T10:05:00.000Z","acceptedCount":0,"rejectedCount":0,"feedbackText":null,"notes":[]}"#

        private func store() -> FocusTriageSessionStore {
            let name = "focus-triage-filter-tests-\(UUID().uuidString)"
            let suite = UserDefaults(suiteName: name) ?? .standard

            suite.removePersistentDomain(forName: name)

            return FocusTriageSessionStore(defaults: suite, scope: { "https://one" })
        }

        private func make(extra: [String: FakeReply]) async -> (FocusTriageSessionModel, FakeServerSession) {
            let pending = FocusTriageFixtures.list([
                FocusTriageFixtures.source("s1", subjectId: "sub1", bits: [FocusTriageFixtures.bit("a")])
            ])
            var routes: [String: FakeReply] = ["/knowledge-bits/pending-review": .json(200, pending)]

            routes.merge(extra) { _, new in new }

            let session = FakeServerSession(routes)
            let triage = FocusTriageModel(list: PendingReviewListModel())

            await triage.load()

            return (FocusTriageSessionModel(triage: triage, store: store()), session)
        }

        @Test("should fall back to All when the chosen subject no longer has any pending cards")
        func staleFilterRecovers() async {
            let (model, session) = await make(extra: [:])
            defer { session.end() }

            model.triage.subjectFilter = "gone"

            let valid = PendingReviewInboxSummary.validSubject(model.triage.subjectFilter, in: model.triage.list.sources)

            #expect(model.triage.readyCount == 0)
            #expect(valid == nil)
            #expect(PendingReviewInboxSummary.validSubject("sub1", in: model.triage.list.sources) == "sub1")
        }

        @Test("should clear the subject filter once a triage session is finished")
        func finishClearsFilter() async {
            let (model, session) = await make(extra: [
                "POST /triage-sessions": .json(200, started),
                "POST /triage-sessions/ts1/finish": .json(200, finished)
            ])
            defer { session.end() }

            model.triage.subjectFilter = "sub1"
            await model.start()
            model.openFinish()
            _ = await model.finish(feedback: "")

            #expect(model.triage.subjectFilter == nil)

            model.closeResult()

            #expect(model.triage.subjectFilter == nil)
        }

        @Test("should clear the subject filter when a triage session is discarded")
        func discardClearsFilter() async {
            let (model, session) = await make(extra: [
                "POST /triage-sessions": .json(200, started),
                "POST /triage-sessions/ts1/discard": .json(200, finished)
            ])
            defer { session.end() }

            model.triage.subjectFilter = "sub1"
            await model.start()
            await model.discard()

            #expect(model.triage.subjectFilter == nil)
        }
    }
}
