import Foundation
import PostAnkiAPI
import Testing

extension SmokeTests {
    @MainActor
    @Suite("Focus triage finishing without feedback")
    struct FocusTriageFinishWithoutFeedbackSmokeTests {
        private let started = #"{"id":"ts1","subjectId":null,"status":"open","startedAt":"2026-10-24T10:00:00.000Z","endedAt":null,"acceptedCount":0,"rejectedCount":0,"feedbackText":null,"notes":[]}"#
        private let finished = #"{"id":"ts1","subjectId":null,"status":"finished","startedAt":"2026-10-24T10:00:00.000Z","endedAt":"2026-10-24T10:05:00.000Z","acceptedCount":0,"rejectedCount":0,"feedbackText":null,"notes":[]}"#

        @Test("should let the owner finish triage with no feedback at all")
        func finishesWithEmptyFeedback() async {
            let name = "focus-triage-tests-\(UUID().uuidString)"
            let suite = UserDefaults(suiteName: name) ?? .standard

            suite.removePersistentDomain(forName: name)

            let store = FocusTriageSessionStore(defaults: suite, scope: { "https://one" })
            let pending = FocusTriageFixtures.list([
                FocusTriageFixtures.source("s1", subjectId: nil, bits: [FocusTriageFixtures.bit("a")])
            ])
            let server = FakeServerSession([
                "/knowledge-bits/pending-review": .json(200, pending),
                "POST /triage-sessions": .json(200, started),
                "POST /triage-sessions/ts1/finish": .json(200, finished)
            ])
            defer { server.end() }

            let triage = FocusTriageModel(list: PendingReviewListModel())

            await triage.load()

            let model = FocusTriageSessionModel(triage: triage, store: store)

            await model.start()
            model.openFinish()

            #expect(await model.finish(feedback: ""))
            #expect(FakeServer.writes.last?.bodyObject?["feedbackText"] as? String == "")
            #expect(model.phase == .result)
            #expect(model.error == nil)
        }
    }
}
