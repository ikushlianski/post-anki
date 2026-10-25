import Foundation
import PostAnkiAPI
import Testing

extension SmokeTests {
    @MainActor
    @Suite("Pending review inbox scope")
    struct PendingReviewInboxScopeSmokeTests {
        private func sources() throws -> [PendingReviewSource] {
            try FocusTriageFixtures.sources([
                FocusTriageFixtures.source("s1", subjectId: "sub1", bits: [FocusTriageFixtures.bit("a"), FocusTriageFixtures.bit("b")]),
                FocusTriageFixtures.source("s2", subjectId: "sub2", bits: [FocusTriageFixtures.bit("c")]),
                FocusTriageFixtures.source("s3", subjectId: "sub1", bits: [])
            ])
        }

        @Test("should list only the chosen subject's sources and cards and hide sources with no cards")
        func narrowsToSubject() throws {
            let visible = PendingReviewInboxScope.visibleSources(try sources(), subjectId: "sub1", resumed: nil)

            #expect(visible.map(\.id) == ["s1"])
            #expect(visible.first?.bits.count == 2)
        }

        @Test("should list every source that has cards when no subject is chosen")
        func allSubjects() throws {
            let visible = PendingReviewInboxScope.visibleSources(try sources(), subjectId: nil, resumed: nil)

            #expect(visible.map(\.id) == ["s1", "s2"])
        }

        @Test("should fall back to all subjects when the chosen subject no longer exists")
        func staleSubjectFallsBack() throws {
            let visible = PendingReviewInboxScope.visibleSources(try sources(), subjectId: "gone", resumed: nil)

            #expect(visible.map(\.id) == ["s1", "s2"])
        }
    }
}
