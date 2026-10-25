import Foundation
import PostAnkiAPI
import Testing

extension SmokeTests {
    @Suite("Triage subject suggestion")
    struct FocusTriageSubjectSuggestionSmokeTests {
        private func source(subjectId: String?, suggestion: String) throws -> PendingReviewSource {
            let json = #"{"knowledgeSourceId":"s1","sourceText":null,"subjectName":null,"subjectId":\#(subjectId.map { "\"\($0)\"" } ?? "null"),\#(suggestion),"bits":[]}"#

            return try JSONDecoder().decode(PendingReviewSource.self, from: Data(json.utf8))
        }

        @Test("should offer the suggested subject when the source has none")
        func offersSuggestion() throws {
            let item = try source(subjectId: nil, suggestion: #""suggestedSubjectId":"sub_a","suggestedSubjectName":"Pricing","suggestedSubjectConfidence":"medium""#)

            #expect(item.subjectSuggestion?.id == "sub_a")
            #expect(item.subjectSuggestion?.name == "Pricing")
            #expect(item.suggestedSubjectConfidence == "medium")
        }

        @Test("should hide the suggestion when it equals the current subject or is absent")
        func hidesSuggestion() throws {
            let same = try source(subjectId: "sub_a", suggestion: #""suggestedSubjectId":"sub_a","suggestedSubjectName":"Pricing","suggestedSubjectConfidence":null"#)
            let none = try source(subjectId: nil, suggestion: #""suggestedSubjectId":null,"suggestedSubjectName":null,"suggestedSubjectConfidence":null"#)

            #expect(same.subjectSuggestion?.id == nil)
            #expect(none.subjectSuggestion?.id == nil)
        }
    }
}
