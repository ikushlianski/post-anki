import Foundation
import Testing

extension SmokeTests {
    @MainActor
    @Suite("Knowledge list filters are applied by the server and keep the list consistent")
    struct KnowledgeListFilterSmokeTests {
        @Test("should ask the server for learning and relearning together when Learning is chosen")
        func statusMapping() {
            #expect(KnowledgeStatusFilter.all.states.isEmpty)
            #expect(KnowledgeStatusFilter.suspended.states.isEmpty)
            #expect(KnowledgeStatusFilter.new.states == ["new"])
            #expect(KnowledgeStatusFilter.learning.states == ["learning", "relearning"])
            #expect(KnowledgeStatusFilter.review.states == ["review"])
        }

        @Test("should send one origin value per choice and none for All origins")
        func originMapping() {
            #expect(KnowledgeOriginFilter.all.origins.isEmpty)
            #expect(KnowledgeOriginFilter.allCases.dropFirst().flatMap(\.origins) == ["manual", "ai_web", "pasted", "notion", "article"])
        }

        @Test("should count an origin choice as an active filter")
        func originCountsAsFilter() {
            let model = KnowledgeListModel()

            #expect(!model.hasActiveFilter)

            model.originFilter = .notion

            #expect(model.hasActiveFilter)
        }

        @Test("should reset search, subject, status and origin and fetch the unfiltered list on Clear filters")
        func clearFiltersResetsEverything() async {
            let session = FakeServerSession(["/knowledge-bits/overview": .fixture("knowledge-overview")])
            defer { session.end() }
            let model = KnowledgeListModel()

            model.query = "swift"
            model.subjectId = "s1"
            model.statusFilter = .review
            model.originFilter = .notion

            await model.clearFilters()

            #expect(!model.hasActiveFilter)
            #expect(model.query.isEmpty)
            #expect(model.subjectId == nil)
            #expect(model.statusFilter == .all)
            #expect(model.originFilter == .all)

            let last = FakeServer.requested.last ?? ""

            #expect(last.contains("/knowledge-bits/overview"))
            #expect(!last.contains("subjectId"))
            #expect(!last.contains("origin"))
            #expect(!last.contains("state"))
            #expect(!last.contains("swift"))
        }

        @Test("should drop a row that no longer matches the status filter after it is suspended")
        func suspendedRowLeavesFilteredList() async throws {
            let session = FakeServerSession(["/knowledge-bits/overview": .fixture("knowledge-overview")])
            defer { session.end() }

            let model = KnowledgeListModel()

            model.statusFilter = .review
            await model.reload()
            model.update("kb_20", state: "suspended")

            #expect(!model.items.contains { $0.id == "kb_20" })
        }

        @Test("should keep the row and show its new state when no status filter is active")
        func rowStaysWithoutFilter() async throws {
            let session = FakeServerSession(["/knowledge-bits/overview": .fixture("knowledge-overview")])
            defer { session.end() }

            let model = KnowledgeListModel()

            await model.reload()
            model.update("kb_20", state: "suspended")

            #expect(model.items.first { $0.id == "kb_20" }?.state == "suspended")
        }
    }
}
