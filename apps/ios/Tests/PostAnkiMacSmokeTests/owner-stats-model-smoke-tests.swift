import Foundation
import Testing

extension SmokeTests {
    @MainActor
    @Suite("Statistics screen loads both reports for the chosen range")
    struct OwnerStatsModelSmokeTests {
        private let learning: FakeReply = .fixture("owner-stats-learning")
        private let spend: FakeReply = .fixture("owner-stats-ai-spend")

        @Test("should show learning and spend data with the environment")
        func loadsBoth() async {
            let session = FakeServerSession(["/stats/learning": learning, "/stats/ai-spend": spend])
            defer { session.end() }
            let model = OwnerStatsModel()

            await model.load()

            #expect(model.learning?.daily.count == 3)
            #expect(model.spend?.unpricedCalls == 4)
            #expect(model.env == "development")
            #expect(model.failure == nil)
        }

        @Test("should load reject reasons by subject type and fusion model counts")
        func loadsReasonsAndFusion() async {
            let reasons: FakeReply = .json(200, #"{"total":2,"reasons":[],"bySubjectType":[{"subjectType":"language","total":2,"reasons":[{"reasonCode":"front_unclear_target_phrase","count":2,"share":1}]}]}"#)
            let fusion: FakeReply = .json(200, #"{"env":"development","days":[],"triageByModel":[{"modelId":"m1","kept":3,"rejected":1}]}"#)
            let session = FakeServerSession(["/stats/learning": learning, "/stats/ai-spend": fusion, "/analytics/reject-reasons": reasons])
            defer { session.end() }
            let model = OwnerStatsModel()

            await model.load()

            #expect(model.rejectReasons?.bySubjectType.first?.subjectType == "language")
            #expect(model.spend?.triageByModel.first?.rejected == 1)
        }

        @Test("should keep the screen failure-visible when the server is down")
        func reportsFailure() async {
            let session = FakeServerSession(["/stats/learning": .status(500), "/stats/ai-spend": spend])
            defer { session.end() }
            let model = OwnerStatsModel()

            await model.load()

            #expect(model.learning == nil)
            #expect(model.failure != nil)
        }
    }
}
