import Foundation
import PostAnkiAPI
import Testing

extension SmokeTests {
    @MainActor
    @Suite("Study plan screen model loads, saves and explains refusals")
    struct StudyPlanSmokeTests {
        private let options = #"""
        {"own":{"newCardsPerDay":null,"learningStepsMinutes":null,"relearningStepsMinutes":null,"desiredRetention":null,"studyIntent":null,"examDate":null},
         "intent":{"studyIntent":"long_term","examDate":null,"source":"app"},
         "effective":{"newCardsPerDay":20,"learningStepsMinutes":[1,10],"relearningStepsMinutes":[10],"desiredRetention":0.9},
         "sources":{"newCardsPerDay":"app","learningStepsMinutes":"app","relearningStepsMinutes":"app","desiredRetention":"app"}}
        """#
        private let forecast = #"""
        {"intent":"long_term","examDate":null,"daysLeft":null,"examPassed":false,"desiredRetention":0.9,"recentRetention":null,"maxIntervalDays":180,"hasCards":false,
         "newCards":{"perDay":20,"paced":false,"pausedToday":false,"pauseThreshold":0,"remaining":0,"finishOn":null,"finishesBeforeExam":null},
         "reviews":{"dueToday":0,"averagePerDay":0,"peakPerDay":0,"peakOn":null,"horizonDays":30},"days":[]}
        """#

        private func routes(patch: FakeReply) -> [String: FakeReply] {
            [
                "GET /subjects": .json(200, "[]"),
                "GET /subjects/s1/study-options": .json(200, options),
                "GET /subjects/s1/study-forecast": .json(200, forecast),
                "PATCH /subjects/s1/study-options": patch
            ]
        }

        @Test("should load the saved settings and the forecast for the subject")
        func loads() async {
            let session = FakeServerSession(routes(patch: .status(200)))
            defer { session.end() }

            let model = StudyPlanModel(subjectId: "s1")

            await model.load()

            #expect(model.hasLoaded)
            #expect(model.forecast?.reviews.horizonDays == 30)
            #expect(model.draft?.intent == .inherit)
            #expect(!model.hasChanges)
        }

        @Test("should keep the typed exam date and show the web sentence when the server refuses it")
        func refusal() async {
            let session = FakeServerSession(routes(patch: .json(400, #"{"error":"exam_date_too_far"}"#)))
            defer { session.end() }

            let model = StudyPlanModel(subjectId: "s1")

            await model.load()
            model.draft?.intent = .exam
            model.draft?.examDate = "2099-01-01"
            await model.save(today: "2026-10-26")

            #expect(model.saveMessage == "The exam date can be at most two years ahead.")
            #expect(model.draft?.intent == .exam)
            #expect(model.options?.own.studyIntent == nil)
        }

        @Test("should send Exam with its date, then show the stored values after a successful save")
        func saves() async {
            let session = FakeServerSession(routes(patch: .json(200, options.replacingOccurrences(of: #""studyIntent":null,"examDate":null"#, with: #""studyIntent":"exam","examDate":"2026-12-01""#))))
            defer { session.end() }

            let model = StudyPlanModel(subjectId: "s1")

            await model.load()
            model.draft?.intent = .exam
            model.draft?.examDate = "2026-12-01"
            await model.save(today: "2026-10-26")

            let body = FakeServer.writes.first { $0.method == "PATCH" }?.bodyObject

            #expect(body?["studyIntent"] as? String == "exam")
            #expect(body?["examDate"] as? String == "2026-12-01")
            #expect(model.options?.own.studyIntent == .exam)
            #expect(model.justSaved)
            #expect(!model.hasChanges)
        }

        @Test("should send the review cap, inherit it back with null, and load a stored value")
        func reviewCapRoundTrip() async {
            let stored = options
                .replacingOccurrences(of: #""own":{"newCardsPerDay":null"#, with: #""own":{"newCardsPerDay":null,"maxReviewsPerDay":50"#)
            let session = FakeServerSession(routes(patch: .json(200, stored)))
            defer { session.end() }

            let model = StudyPlanModel(subjectId: "s1")

            await model.load()

            #expect(model.draft?.maxReviewsPerDay == nil)

            model.draft?.maxReviewsPerDay = 50
            await model.save(today: "2026-10-26")

            let body = FakeServer.writes.first { $0.method == "PATCH" }?.bodyObject

            #expect(body?["maxReviewsPerDay"] as? Int == 50)
            #expect(model.options?.own.maxReviewsPerDay == 50)
            #expect(model.draft?.maxReviewsPerDay == 50)
            #expect(!model.hasChanges)

            model.draft?.maxReviewsPerDay = nil

            #expect(model.hasChanges)
        }

        @Test("should not call the server when Exam has no date and should say why")
        func needsDate() async {
            let session = FakeServerSession(routes(patch: .status(200)))
            defer { session.end() }

            let model = StudyPlanModel(subjectId: "s1")

            await model.load()
            model.draft?.intent = .exam
            await model.save(today: "2026-10-26")

            #expect(model.saveMessage == "Pick the exam date to study for an exam.")
            #expect(FakeServer.writes.isEmpty)
        }

        @Test("should explain a missing subject instead of failing silently")
        func notFound() async {
            let session = FakeServerSession(["GET /subjects": .json(200, "[]"), "GET /subjects/gone/study-options": .json(404, #"{"error":"subject_not_found"}"#)])
            defer { session.end() }

            let model = StudyPlanModel(subjectId: "gone")

            await model.load()

            #expect(!model.hasLoaded)
            #expect(model.loadMessage == "This subject no longer exists.")
        }
    }
}
