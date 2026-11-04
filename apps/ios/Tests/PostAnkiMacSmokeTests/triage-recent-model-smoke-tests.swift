import Foundation
import Testing

extension SmokeTests {
    @MainActor
    @Suite("Recent triage decisions can be searched and given a reason afterwards")
    struct TriageRecentModelSmokeTests {
        private let list = FakeReply.json(200, """
        {"days":7,"mode":"both","meaningUnavailable":true,"decisions":[
          {"id":"ctd_1","verdict":"rejected","reasonCode":null,"front":"What is TTL?","rejectReasonCodes":["too_trivial","other"]},
          {"id":"ctd_2","verdict":"approved","front":"What is a saga?"}]}
        """)

        @Test("should list the week with rejections that still have no reason and tell when meaning search was skipped")
        func loadsWeek() async throws {
            let session = FakeServerSession(["/triage-decisions/recent": list])
            defer { session.end() }
            let model = TriageRecentModel()

            await model.load()

            #expect(model.decisions.map(\.id) == ["ctd_1", "ctd_2"])
            #expect(model.decisions.map(\.needsReason) == [true, false])
            #expect(model.meaningUnavailable)
            #expect(model.hasLoaded)
        }

        @Test("should show the chosen reason on the row once it is saved")
        func savesReason() async throws {
            let session = FakeServerSession([
                "/triage-decisions/recent": list,
                "PATCH /triage-decisions/ctd_1": .json(200, #"{"id":"ctd_1","verdict":"rejected","reasonCode":"too_trivial"}"#),
            ])
            defer { session.end() }
            let model = TriageRecentModel()

            await model.load()

            let error = await model.setReason(try #require(model.decisions.first), reason: "too_trivial")

            #expect(error == nil)
            #expect(model.decisions.first?.reasonCode == "too_trivial")
            #expect(model.decisions.first?.needsReason == false)
            #expect(FakeServer.writes.map(\.path) == ["/triage-decisions/ctd_1"])
        }

        @Test("should keep the row without a reason and explain when saving fails")
        func keepsRowOnFailure() async throws {
            let session = FakeServerSession([
                "/triage-decisions/recent": list,
                "PATCH /triage-decisions/ctd_1": .status(500),
            ])
            defer { session.end() }
            let model = TriageRecentModel()

            await model.load()

            let error = await model.setReason(try #require(model.decisions.first), reason: "other")

            #expect(error != nil)
            #expect(model.saveError != nil)
            #expect(model.decisions.first?.needsReason == true)
        }
    }
}
