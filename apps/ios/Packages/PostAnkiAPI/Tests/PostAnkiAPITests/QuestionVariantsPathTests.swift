import Foundation
import Testing
@testable import PostAnkiAPI

@Suite("Next question variants path")
struct QuestionVariantsPathTests {
    @Test("should percent-encode a topic id so it cannot inject extra query parameters")
    func encodesTopicId() {
        let path = APIClient.nextQuestionVariantsPath(topicId: "a&limit=999#x y", limit: 5)

        #expect(path == "/knowledge-bits/question-variants/next?limit=5&topicId=a%26limit%3D999%23x%20y")
    }

    @Test("should omit the topic filter when no topic is given")
    func omitsTopic() {
        #expect(APIClient.nextQuestionVariantsPath(topicId: nil, limit: 3) == "/knowledge-bits/question-variants/next?limit=3")
    }
}
