import Foundation
import Testing
@testable import PostAnkiAPI

@Suite("Study plan decoding and rules")
struct StudyPlanDecodingTests {
    private let en = Locale(identifier: "en_US_POSIX")
    private var utc: Calendar {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "UTC")!
        return calendar
    }

    private func options() throws -> SubjectStudyOptions {
        try Fixture.decode(SubjectStudyOptions.self, "subject-study-options")
    }

    private func summary(_ name: String) throws -> StudyPlanSummary {
        StudyPlanSummary(try Fixture.decode(StudyForecast.self, name), calendar: utc, locale: en)
    }

    private func json(_ update: SubjectStudyOptionsUpdate) throws -> [String: Any] {
        let data = try JSONEncoder().encode(update)

        return try #require(JSONSerialization.jsonObject(with: data) as? [String: Any])
    }

    @Test("should decode an inherited Exam intent with the subject it comes from")
    func decodesInheritedExam() throws {
        let value = try options()

        #expect(value.intent.studyIntent == .exam)
        #expect(value.intent.examDate == "2027-01-15")
        #expect(value.intent.source == "sub_parent")
        #expect(value.own.studyIntent == nil)
        #expect(value.sources.desiredRetention == "sub_parent")
        #expect(StudyPlanSource.text(source: "sub_parent", subjectId: "child", names: ["sub_parent": "Biology"]) == "Inherited from Biology.")
    }

    @Test("should decode a forecast with a late finish and a pause")
    func decodesLateForecast() throws {
        let forecast = try Fixture.decode(StudyForecast.self, "study-forecast-exam")

        #expect(forecast.newCards.pausedToday)
        #expect(forecast.newCards.finishesBeforeExam == false)
        #expect(forecast.reviews.averagePerDay == 41.5)
        #expect(forecast.days.count == 15)
    }

    @Test("should decode an empty forecast with no recent retention")
    func decodesEmptyForecast() throws {
        let forecast = try Fixture.decode(StudyForecast.self, "study-forecast-empty")

        #expect(forecast.recentRetention == nil)
        #expect(forecast.daysLeft == nil)
        #expect(forecast.days.isEmpty)
    }

    @Test("should encode inherit as an explicit null and leave unchanged fields out")
    func encodesTriState() throws {
        var update = SubjectStudyOptionsUpdate()

        update.newCardsPerDay = .inherit
        update.desiredRetention = .set(0.85)

        let body = try json(update)

        #expect(body["newCardsPerDay"] is NSNull)
        #expect(body["desiredRetention"] as? Double == 0.85)
        #expect(body["studyIntent"] == nil)
        #expect(body["examDate"] == nil)
        #expect(SubjectStudyOptionsUpdate().isEmpty)
    }

    @Test("should decode an old study options payload without the review cap")
    func decodesOldPayloadWithoutReviewCap() throws {
        let value = try options()

        #expect(value.own.maxReviewsPerDay == nil)
        #expect(value.effective.maxReviewsPerDay == nil)
        #expect(value.sources.maxReviewsPerDay == nil)
        #expect(StudyPlanDraft(value).maxReviewsPerDay == nil)
    }

    @Test("should decode the review cap and send it, inherit it as null, or leave it out")
    func reviewCapRoundTrip() throws {
        let payload = #"{"own":{"newCardsPerDay":null,"maxReviewsPerDay":50,"learningStepsMinutes":null,"relearningStepsMinutes":null,"desiredRetention":null,"studyIntent":null,"examDate":null},"intent":{"studyIntent":"long_term","examDate":null,"source":"app"},"effective":{"newCardsPerDay":20,"maxReviewsPerDay":50,"learningStepsMinutes":[1,10],"relearningStepsMinutes":[10],"desiredRetention":0.9},"sources":{"newCardsPerDay":"app","maxReviewsPerDay":"s1","learningStepsMinutes":"app","relearningStepsMinutes":"app","desiredRetention":"app"}}"#
        let value = try JSONDecoder().decode(SubjectStudyOptions.self, from: Data(payload.utf8))

        #expect(value.own.maxReviewsPerDay == 50)
        #expect(value.effective.maxReviewsPerDay == 50)
        #expect(value.sources.maxReviewsPerDay == "s1")

        var draft = StudyPlanDraft(value)

        #expect(draft.update(from: value).isEmpty)

        draft.maxReviewsPerDay = 0
        #expect(try json(draft.update(from: value))["maxReviewsPerDay"] as? Int == 0)

        draft.maxReviewsPerDay = nil
        #expect(try json(draft.update(from: value))["maxReviewsPerDay"] is NSNull)
        #expect(try json(SubjectStudyOptionsUpdate())["maxReviewsPerDay"] == nil)
    }

    @Test("should send Exam together with its date in one change")
    func examSendsDate() throws {
        var draft = StudyPlanDraft(try options())

        draft.intent = .exam
        draft.examDate = "2027-02-01"

        let body = try json(draft.update(from: try options()))

        #expect(body["studyIntent"] as? String == "exam")
        #expect(body["examDate"] as? String == "2027-02-01")
    }

    @Test("should decode the saved detail level and hinting, treating an unknown level as standard")
    func decodesLearningSettings() throws {
        let value = try options()

        #expect(value.own.detailLevel == .deep)
        #expect(value.own.hintingEnabled == false)

        let unknown = #"{"newCardsPerDay":null,"learningStepsMinutes":null,"relearningStepsMinutes":null,"desiredRetention":null,"studyIntent":null,"examDate":null,"detailLevel":"exhaustive","hintingEnabled":null}"#
        let own = try JSONDecoder().decode(SubjectStudyOptions.Own.self, from: Data(unknown.utf8))

        #expect(own.detailLevel == .standard)
        #expect(own.hintingEnabled == nil)
    }

    @Test("should encode detail level and hinting changes, with null when cleared")
    func encodesLearningSettings() throws {
        var draft = StudyPlanDraft(try options())

        draft.detailLevel = .concise
        draft.hintingEnabled = nil

        let body = try json(draft.update(from: try options()))

        #expect(body["detailLevel"] as? String == "concise")
        #expect(body["hintingEnabled"] is NSNull)
        #expect(body["newCardsPerDay"] == nil)
    }

    @Test("should send nothing when the draft matches what is saved")
    func noChangeIsEmpty() throws {
        let value = try options()

        #expect(StudyPlanDraft(value).update(from: value).isEmpty)
    }

    @Test("should switch back to inherit with a null intent and keep the date out")
    func inheritClearsIntent() throws {
        var draft = StudyPlanDraft(intent: .exam, examDate: "2027-02-01", retentionPercent: nil, newCardsPerDay: nil)
        let saved = try options()
        var changed = saved.own

        changed = SubjectStudyOptions.Own(
            newCardsPerDay: nil, maxReviewsPerDay: nil, learningStepsMinutes: nil, relearningStepsMinutes: nil,
            desiredRetention: nil, studyIntent: .exam, examDate: "2027-02-01"
        )

        draft.intent = .inherit

        let update = draft.update(from: SubjectStudyOptions(own: changed, intent: saved.intent, effective: saved.effective, sources: saved.sources))

        #expect(update.studyIntent == .inherit)
        #expect(update.examDate == .unchanged)
    }

    @Test("should keep retention within 70 to 99 percent as a fraction and clear it on inherit")
    func retentionRules() throws {
        var draft = StudyPlanDraft(try options())

        draft.retentionPercent = 95

        #expect(draft.update(from: try options()).desiredRetention == .set(0.95))

        draft.retentionPercent = nil

        #expect(draft.update(from: try options()).desiredRetention == .unchanged)
        #expect(StudyPlanDraft.retentionRange == 70...99)
        #expect(StudyPlanDraft.newCardsRange == 1...200)
    }

    @Test("should refuse Exam without a date or with a past date using the web sentences")
    func validatesExamDate() {
        var draft = StudyPlanDraft(intent: .exam, examDate: nil, retentionPercent: nil, newCardsPerDay: nil)

        #expect(draft.validationMessage(today: "2026-10-26") == "Pick the exam date to study for an exam.")

        draft.examDate = "2026-10-25"

        #expect(draft.validationMessage(today: "2026-10-26") == "The exam date has to be today or later.")

        draft.examDate = "2026-10-26"

        #expect(draft.validationMessage(today: "2026-10-26") == nil)
        #expect(StudyPlanDraft(intent: .longTerm, examDate: nil, retentionPercent: nil, newCardsPerDay: nil).validationMessage(today: "2026-10-26") == nil)
    }

    @Test("should explain each server refusal in plain words and keep the draft only for 400s")
    func explainsErrors() {
        let tooFar = APIError.badStatus(400, "exam_date_too_far")

        #expect(StudyPlanMessage.save(tooFar) == "The exam date can be at most two years ahead.")
        #expect(StudyPlanMessage.save(APIError.badStatus(400, "exam_date_requires_exam_intent")) == "An exam date only works when studying for an Exam.")
        #expect(StudyPlanMessage.save(APIError.badStatus(400, "invalid_input")) == StudyPlanRefusal.invalidInput.message)
        #expect(StudyPlanMessage.load(APIError.badStatus(404, "subject_not_found")) == "This subject no longer exists.")
        #expect(StudyPlanMessage.load(APIError.badStatus(404, nil)) == "This subject no longer exists.")
        #expect(StudyPlanMessage.save(URLError(.notConnectedToInternet))?.hasPrefix("Couldn't save") == true)
        #expect(StudyPlanMessage.save(CancellationError()) == nil)
        #expect(StudyPlanMessage.keepsDraft(tooFar))
        #expect(!StudyPlanMessage.keepsDraft(APIError.badStatus(500, nil)))
    }

    @Test("should describe a late finish against the exam date in plain words")
    func summaryLateFinish() throws {
        let value = try summary("study-forecast-exam")

        #expect(value.daysLeftText == "81 days left to the exam")
        #expect(value.dueTodayText == "120 reviews due today")
        #expect(value.averageText == "About 41.5 reviews a day over the next 81 days")
        #expect(value.peakText == "Busiest day: 130 reviews on Oct 27")
        #expect(value.finishText?.contains("after the exam on Jan 15, 2027") == true)
        #expect(value.finishesLate)
        #expect(value.pausedText?.contains("100 or more reviews") == true)
        #expect(value.retentionText == "Recent retention 87% (goal 90%)")
        #expect(value.bars.count == 14)
    }

    @Test("should show friendly empty-state wording when there are no cards")
    func summaryEmpty() throws {
        let value = try summary("study-forecast-empty")

        #expect(value.daysLeftText == nil)
        #expect(value.dueTodayText == "No reviews due today")
        #expect(value.peakText == nil)
        #expect(value.finishText == nil)
        #expect(value.retentionText == "No reviews in the last 30 days yet (goal 90%)")
        #expect(value.bars.isEmpty)
    }

    @Test("should convert calendar dates without shifting the day")
    func dateRoundTrip() throws {
        let date = try #require(StudyPlanDate.parse("2027-03-01", calendar: utc))

        #expect(StudyPlanDate.string(from: date, calendar: utc) == "2027-03-01")
    }
}

extension NetworkContracts {
    @Suite("Study plan contract")
    struct StudyPlanContractTests {
        @Test("should read options and forecast from the subject paths with the time zone")
        func readsPaths() async throws {
            RecordingStub.install(body: try Fixture.data("study-forecast-empty"))
            _ = try await APIClient.studyForecast(subjectId: "sub/1", timeZone: "Europe/Warsaw")
            let request = try #require(RecordingStub.last)

            #expect(request.method == "GET")
            #expect(request.path == "/subjects/sub%2F1/study-forecast")
            #expect(APIClient.studyForecastPath("sub_1", timeZone: "Europe/Warsaw") == "/subjects/sub_1/study-forecast?tz=Europe%2FWarsaw")
        }

        @Test("should patch only the changed settings and explain a refused date")
        func patchesSubset() async throws {
            RecordingStub.install(body: try Fixture.data("subject-study-options"))
            var update = SubjectStudyOptionsUpdate()

            update.studyIntent = .set(.exam)
            update.examDate = .set("2027-02-01")
            _ = try await APIClient.updateStudyOptions(subjectId: "sub_1", update)
            let request = try #require(RecordingStub.last)

            #expect(request.method == "PATCH")
            #expect(request.path == "/subjects/sub_1/study-options")
            #expect(request.body?["examDate"] as? String == "2027-02-01")
            #expect(request.body?["desiredRetention"] == nil)

            RecordingStub.install(status: 400, body: Data(#"{"error":"exam_date_in_past"}"#.utf8))

            do {
                _ = try await APIClient.updateStudyOptions(subjectId: "sub_1", update)
                Issue.record("expected a refusal")
            } catch {
                #expect(StudyPlanMessage.save(error) == "The exam date has to be today or later.")
            }
        }
    }
}
