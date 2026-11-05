import Foundation
import PostAnkiAPI
import Testing

extension SmokeTests {
    @Suite("Admin settings decode and encode")
    struct AdminSettingsSmokeTests {
        @Test("should decode every admin setting the server returns, including new cards per day")
        func decodesAllSettings() throws {
            let json = """
            {"testToggle":true,"modelTier":"premium","knowledgeItemModelId":"openrouter/openai/gpt-5-mini","newCardsPerDay":35}
            """
            let settings = try JSONDecoder().decode(AdminSettings.self, from: Data(json.utf8))

            #expect(settings.testToggle)
            #expect(settings.modelTier == "premium")
            #expect(settings.knowledgeItemModelId == "openrouter/openai/gpt-5-mini")
            #expect(settings.newCardsPerDay == 35)
        }

        @Test("should decode and send reviews per day, where 0 means unlimited")
        func reviewsPerDay() throws {
            let json = #"{"testToggle":true,"modelTier":"cheap","maxReviewsPerDay":0}"#
            let settings = try JSONDecoder().decode(AdminSettings.self, from: Data(json.utf8))
            let data = try JSONEncoder().encode(AdminSettingsUpdate(maxReviewsPerDay: 150))
            let object = try #require(JSONSerialization.jsonObject(with: data) as? [String: Int])

            #expect(settings.maxReviewsPerDay == 0)
            #expect(object == ["maxReviewsPerDay": 150])
        }

        @Test("should default mixing new cards to on when the server omits it and send a change")
        func mixNewWithDue() throws {
            let missing = try JSONDecoder().decode(AdminSettings.self, from: Data(#"{"testToggle":true,"modelTier":"cheap"}"#.utf8))
            let off = try JSONDecoder().decode(AdminSettings.self, from: Data(#"{"testToggle":true,"modelTier":"cheap","mixNewWithDue":false}"#.utf8))
            let data = try JSONEncoder().encode(AdminSettingsUpdate(mixNewWithDue: false))
            let object = try #require(JSONSerialization.jsonObject(with: data) as? [String: Bool])

            #expect(missing.mixNewWithDue == nil)
            #expect(off.mixNewWithDue == false)
            #expect(object == ["mixNewWithDue": false])
        }

        @Test("should keep fusion off and empty when the server omits fusion settings")
        func fusionDefaultsOff() throws {
            let json = #"{"testToggle":false,"modelTier":"cheap"}"#
            let settings = try JSONDecoder().decode(AdminSettings.self, from: Data(json.utf8))

            #expect(!settings.fusionEnabled)
            #expect(settings.fusionModelIds.isEmpty)
            #expect(settings.fusionEstimate == nil)
        }

        @Test("should cap fusion at 5 models and hint when fewer than 2 are chosen while on")
        func fusionSelectionRules() {
            let five = ["a", "b", "c", "d", "e"]

            #expect(FusionSelection.toggled(five, id: "f") == five)
            #expect(FusionSelection.toggled(five, id: "a") == ["b", "c", "d", "e"])
            #expect(FusionSelection.hint(enabled: true, count: 1) != nil)
            #expect(FusionSelection.hint(enabled: false, count: 1) == nil)
            #expect(FusionSelection.hint(enabled: true, count: 2) == nil)
        }

        @Test("should send only the changed setting when saving one field")
        func encodesOnlyChangedField() throws {
            let data = try JSONEncoder().encode(AdminSettingsUpdate(newCardsPerDay: 40))
            let object = try #require(JSONSerialization.jsonObject(with: data) as? [String: Int])

            #expect(object == ["newCardsPerDay": 40])
        }
    }
}
