import Foundation
import Testing
@testable import PostAnkiAPI

@Suite("Subject complexity level")
struct StudyComplexityTests {
    private let payload = """
    {
      "own": {"newCardsPerDay": null, "learningStepsMinutes": null, "relearningStepsMinutes": null, "desiredRetention": null, "complexityLevel": "cram", "studyIntent": null, "examDate": null, "detailLevel": null, "hintingEnabled": null},
      "intent": {"studyIntent": "long_term", "examDate": null, "source": "app"},
      "effective": {"newCardsPerDay": 20, "learningStepsMinutes": [1, 10], "relearningStepsMinutes": [10], "desiredRetention": 0.935},
      "complexity": {"level": "cram", "source": "child"},
      "preview": {"goodDays": 8, "easyDays": 10},
      "sources": {"newCardsPerDay": "app", "learningStepsMinutes": "app", "relearningStepsMinutes": "app", "desiredRetention": "child"}
    }
    """

    private func options() throws -> SubjectStudyOptions {
        try JSONDecoder().decode(SubjectStudyOptions.self, from: Data(payload.utf8))
    }

    private func json(_ update: SubjectStudyOptionsUpdate) throws -> [String: Any] {
        let data = try JSONEncoder().encode(update)

        return try #require(JSONSerialization.jsonObject(with: data) as? [String: Any])
    }

    @Test("should decode the saved level, where it comes from, and the Good and Easy gaps")
    func decodesLevelAndPreview() throws {
        let value = try options()

        #expect(value.own.complexityLevel == .cram)
        #expect(value.complexity == .init(level: "cram", source: "child"))
        #expect(value.preview == .init(goodDays: 8, easyDays: 10))
    }

    @Test("should send the new level with retention cleared when a level replaces a typed retention")
    func levelReplacesRetention() throws {
        var draft = StudyPlanDraft(try options())
        draft.complexityLevel = .easy
        draft.retentionPercent = nil

        let update = draft.update(from: try options())

        #expect(update.complexityLevel == .set(.easy))
        #expect(try json(update)["complexityLevel"] as? String == "easy")
    }

    @Test("should send a null level when the subject goes back to inheriting")
    func inheritClearsLevel() throws {
        var draft = StudyPlanDraft(try options())
        draft.complexityLevel = nil

        let update = draft.update(from: try options())

        #expect(update.complexityLevel == .inherit)
        #expect(try json(update)["complexityLevel"] is NSNull)
    }

    @Test("should omit the level from a new top-level subject when Normal is kept, and send it for sub-subjects")
    func createChoices() {
        #expect(ComplexityChoice.shown(nil, hasParent: false) == .normal)
        #expect(ComplexityChoice.toSend(nil, hasParent: false) == nil)
        #expect(ComplexityChoice.toSend(.normal, hasParent: false) == nil)
        #expect(ComplexityChoice.toSend(.cram, hasParent: false) == .cram)
        #expect(ComplexityChoice.toSend(nil, hasParent: true) == nil)
        #expect(ComplexityChoice.toSend(.normal, hasParent: true) == .normal)
    }

    @Test("should write the level into the create request only when one is chosen")
    func createRequestBody() throws {
        let with = try JSONEncoder().encode(SubjectManageCreateInput(name: "TCP", parentId: nil, complexityLevel: .easy))
        let without = try JSONEncoder().encode(SubjectManageCreateInput(name: "TCP", parentId: nil))

        #expect(String(decoding: with, as: UTF8.self).contains("\"complexityLevel\":\"easy\""))
        #expect(!String(decoding: without, as: UTF8.self).contains("complexityLevel"))
    }
}
