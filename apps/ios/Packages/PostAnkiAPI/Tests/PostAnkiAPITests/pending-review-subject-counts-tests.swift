import Foundation
import Testing
@testable import PostAnkiAPI

struct PendingReviewSubjectCountsTests {
    @Test func subjectRowsDecodeWithTheirPathAndPendingCount() throws {
        let data = Data(#"[{"subjectId":"s1","name":"German","path":"Languages / German","pendingCount":4}]"#.utf8)
        let rows = try JSONDecoder().decode(LossyArray<PendingReviewSubjectCount>.self, from: data).elements

        #expect(rows == [PendingReviewSubjectCount(subjectId: "s1", name: "German", path: "Languages / German", pendingCount: 4)])
    }

    @Test func aBrokenRowDoesNotHideTheOtherSubjects() throws {
        let data = Data(#"[{"name":"no id"},{"subjectId":"s2","name":null,"pendingCount":2.0}]"#.utf8)
        let rows = try JSONDecoder().decode(LossyArray<PendingReviewSubjectCount>.self, from: data).elements

        #expect(rows.map(\.subjectId) == ["s2"])
        #expect(rows[0].name == "Untitled subject")
        #expect(rows[0].pendingCount == 2)
    }
}
