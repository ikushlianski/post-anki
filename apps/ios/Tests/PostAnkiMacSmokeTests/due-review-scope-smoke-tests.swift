import Foundation
import PostAnkiAPI
import Testing

extension SmokeTests {
    @Suite("Review can be limited to a subject, tag, topic or a single card")
    struct DueReviewScopeSmokeTests {
        @Test("should send only the subject filter and keep the subject name as title")
        func subjectScope() {
            let scope = DueReviewScope.subject(id: "s1", name: "Math")

            #expect(scope.subjectId == "s1")
            #expect(scope.tagId == nil && scope.topicId == nil && scope.knowledgeBitId == nil)
            #expect(scope.title == "Math")
        }

        @Test("should send only the tag filter for a tag review")
        func tagScope() {
            let scope = DueReviewScope.tag(id: "t1", name: "Swift")

            #expect(scope.tagId == "t1")
            #expect(scope.subjectId == nil && scope.topicId == nil && scope.knowledgeBitId == nil)
        }

        @Test("should send only the topic filter for a topic review")
        func topicScope() {
            let scope = DueReviewScope.topic(id: "p1", title: "Closures")

            #expect(scope.topicId == "p1")
            #expect(scope.subjectId == nil && scope.tagId == nil && scope.knowledgeBitId == nil)
            #expect(scope.title == "Closures")
        }

        @Test("should send only the knowledge bit id for a single-card review")
        func cardScope() {
            let scope = DueReviewScope.card(knowledgeBitId: "k1", title: "Card")

            #expect(scope.knowledgeBitId == "k1")
            #expect(scope.subjectId == nil && scope.tagId == nil && scope.topicId == nil)
        }

        @Test("should build scope from a topic model")
        func fromTopic() throws {
            let json = Data(#"{"id":"p1","moduleId":"m1","title":"Closures"}"#.utf8)
            let scope = DueReviewScope(topic: try JSONDecoder().decode(Topic.self, from: json))

            #expect(scope == .topic(id: "p1", title: "Closures"))
        }
    }
}
