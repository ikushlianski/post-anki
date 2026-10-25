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

        @Test("should send only the changed setting when saving one field")
        func encodesOnlyChangedField() throws {
            let data = try JSONEncoder().encode(AdminSettingsUpdate(newCardsPerDay: 40))
            let object = try #require(JSONSerialization.jsonObject(with: data) as? [String: Int])

            #expect(object == ["newCardsPerDay": 40])
        }
    }
}
