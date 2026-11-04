import Foundation
import Testing
@testable import PostAnkiAPI

@Suite("Fusion settings contract")
struct FusionSettingsTests {
    @Test("should decode fusion switch, chosen models and the per-source cost estimate")
    func decodesFusionSettings() throws {
        let json = #"{"testToggle":false,"modelTier":"cheap","fusionEnabled":true,"fusionModelIds":["m1","m2"],"fusionEstimate":{"perModel":[{"modelId":"m1","estimatedCostUsd":0.004},{"modelId":"m2","estimatedCostUsd":0.12}],"totalEstimatedCostUsd":0.124}}"#
        let settings = try JSONDecoder().decode(AdminSettings.self, from: Data(json.utf8))

        #expect(settings.fusionEnabled)
        #expect(settings.fusionModelIds == ["m1", "m2"])
        #expect(settings.fusionEstimate?.costText(for: "m1") == "<$0.01")
        #expect(settings.fusionEstimate?.costText(for: "m2") == "$0.12")
        #expect(settings.fusionEstimate?.totalText == "$0.12")
    }

    @Test("should still decode settings when the fusion estimate is malformed")
    func toleratesBadEstimate() throws {
        let json = #"{"testToggle":false,"modelTier":"cheap","fusionEnabled":true,"fusionModelIds":["m1"],"fusionEstimate":"oops"}"#
        let settings = try JSONDecoder().decode(AdminSettings.self, from: Data(json.utf8))

        #expect(settings.fusionEnabled)
        #expect(settings.fusionEstimate == nil)
    }

    @Test("should send only the fusion fields that changed")
    func encodesFusionUpdate() throws {
        let data = try JSONEncoder().encode(AdminSettingsUpdate(fusionEnabled: true, fusionModelIds: ["a", "b"]))
        let object = try #require(JSONSerialization.jsonObject(with: data) as? [String: Any])

        #expect(Set(object.keys) == ["fusionEnabled", "fusionModelIds"])
        #expect(object["fusionModelIds"] as? [String] == ["a", "b"])
    }

    @Test("should surface the server refusal text from zod-style and plain messages")
    func decodesRefusal() {
        let issues = Data(#"{"error":"invalid_input","message":[{"message":"Fusion mode needs 2 to 5 models","path":["fusionModelIds"]}]}"#.utf8)
        let plain = Data(#"{"error":"invalid_input","message":["Fusion models must be distinct"]}"#.utf8)
        let other = Data(#"{"error":"nope"}"#.utf8)

        #expect(AdminSettingsRefusal.decode(from: issues)?.message == "Fusion mode needs 2 to 5 models")
        #expect(AdminSettingsRefusal.decode(from: plain)?.message == "Fusion models must be distinct")
        #expect(AdminSettingsRefusal.decode(from: other) == nil)
    }
}
