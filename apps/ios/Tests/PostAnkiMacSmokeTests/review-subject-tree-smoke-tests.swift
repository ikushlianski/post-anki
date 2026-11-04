import Foundation
import Testing

extension SmokeTests {
    @MainActor
    @Suite("Mac review subject tree shows rolled-up counts and remembers expansion")
    struct ReviewSubjectTreeSmokeTests {
        private let subjects: FakeReply = .json(200, "[{\"id\":\"a\",\"name\":\"Business\",\"description\":null,\"parentId\":null},{\"id\":\"b\",\"name\":\"Sales\",\"description\":null,\"parentId\":\"a\"},{\"id\":\"c\",\"name\":\"Cold sales\",\"description\":null,\"parentId\":\"b\"}]")
        private let due: FakeReply = .json(200, "{\"subjects\":[{\"subjectId\":\"a\",\"dueCount\":12,\"newCount\":5},{\"subjectId\":\"b\",\"dueCount\":7,\"newCount\":3},{\"subjectId\":\"c\",\"dueCount\":0,\"newCount\":0}],\"unsorted\":{\"dueCount\":0,\"newCount\":0},\"newRemainingToday\":5}")

        private var routes: [String: FakeReply] {
            ["/subjects": subjects, "/knowledge-bits/browser/subjects": .json(200, "[]"), "/subjects/review-due-counts": due]
        }

        private func freshDefaults() -> UserDefaults {
            let name = "review-tree-\(UUID().uuidString)"
            let defaults = UserDefaults(suiteName: name)!
            defaults.removePersistentDomain(forName: name)

            return defaults
        }

        @Test("should flatten only expanded branches and show parent totals including descendants")
        func flattensWithTotals() async {
            let session = FakeServerSession(routes)
            defer { session.end() }
            let model = ReviewSubjectsModel()

            await model.load()

            #expect(model.rows.map(\.id) == ["a"])
            #expect(model.rows.first?.newCount == 5)
            #expect(model.rows.first?.repeatCount == 12)

            model.toggle("a")
            model.toggle("b")

            #expect(model.rows.map(\.id) == ["a", "b", "c"])
            #expect(model.rows.map(\.row.depth) == [0, 1, 2])
            #expect(model.rows.last?.hasNothingDue == true)
        }

        @Test("should read an unseen expansion preference as everything collapsed")
        func emptyByDefault() {
            #expect(ReviewSubjectExpansionStore(defaults: freshDefaults()).load().isEmpty)
        }

        @Test("should restore the expanded subject ids saved earlier")
        func persistsExpansion() {
            let defaults = freshDefaults()

            ReviewSubjectExpansionStore(defaults: defaults).save(["a", "b"])

            #expect(ReviewSubjectExpansionStore(defaults: defaults).load() == ["a", "b"])
        }

        @Test("should describe a row for assistive tech with new and repeat counts")
        func accessibilityLabel() {
            #expect(ReviewSubjectCountsText.accessibilityLabel(name: "Business", new: 5, repeatCount: 12) == "Business, 5 new, 12 to repeat")
        }
    }
}
