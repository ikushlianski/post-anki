import Foundation
import Testing
@testable import PostAnkiAPI

@Suite("ChatModelSelection")
struct ChatModelSelectionTests {
    private let options = [
        ChatModelOption(id: "a/cheap", label: "Cheap One", costTier: .cheap, isDefault: true),
        ChatModelOption(id: "b/premium", label: "Premium One", costTier: .premium)
    ]

    private func freshDefaults() -> UserDefaults {
        UserDefaults(suiteName: "chat-model-selection-\(UUID().uuidString)")!
    }

    @Test("a learner's pick survives while the server still offers that model")
    func keepsListedPick() {
        let defaults = freshDefaults()

        ChatModelSelection.select("b/premium", defaults: defaults)

        #expect(ChatModelSelection.validate(against: options, defaults: defaults) == "b/premium")
        #expect(ChatModelSelection.selectedId(defaults: defaults) == "b/premium")
    }

    @Test("a model the server no longer offers falls back to the server default")
    func dropsStalePick() {
        let defaults = freshDefaults()

        ChatModelSelection.select("gone/model", defaults: defaults)

        #expect(ChatModelSelection.validate(against: options, defaults: defaults) == nil)
        #expect(ChatModelSelection.selectedId(defaults: defaults) == nil)
    }

    @Test("the pick is stored under the same key the web app uses")
    func sharedKey() {
        let defaults = freshDefaults()

        ChatModelSelection.select("a/cheap", defaults: defaults)

        #expect(defaults.string(forKey: "post-anki.chat-model-id") == "a/cheap")
    }

    @Test("choosing Default clears the stored pick")
    func resetClears() {
        let defaults = freshDefaults()

        ChatModelSelection.select("a/cheap", defaults: defaults)
        ChatModelSelection.select(nil, defaults: defaults)

        #expect(ChatModelSelection.selectedId(defaults: defaults) == nil)
    }

    @Test("the label falls back to Default, then the listed name, then the short id")
    func labels() {
        #expect(ChatModelSelection.label(for: nil, in: options) == "Default")
        #expect(ChatModelSelection.label(for: "a/cheap", in: options) == "Cheap One")
        #expect(ChatModelSelection.label(for: "x/old-model", in: options) == "old-model")
    }

    @Test("the model list from the server decodes, with an unknown cost tier tolerated")
    func decodesList() throws {
        let json = """
        [{"id":"a/cheap","label":"Cheap One","costTier":"cheap","note":"fast","expiresOn":null,"isDefault":true},
         {"id":"b/new","label":"New","costTier":"ultra","note":"","expiresOn":"2027-01-01","isDefault":false}]
        """

        let decoded = try JSONDecoder().decode([ChatModelOption].self, from: Data(json.utf8))

        #expect(decoded.count == 2)
        #expect(decoded[0].costTier == .cheap)
        #expect(decoded[0].isDefault)
        #expect(decoded[1].costTier == .unknown)
        #expect(decoded[1].expiresOn == "2027-01-01")
    }

    @Test("a send request carries modelId only when a model is chosen")
    func encodesModelIdOnlyWhenSet() throws {
        let with = try JSONEncoder().encode(SendChatQueueMessageInput(clientMessageId: "c", message: "hi", modelId: "a/cheap"))
        let without = try JSONEncoder().encode(SendChatQueueMessageInput(clientMessageId: "c", message: "hi", modelId: nil))

        #expect(String(decoding: with, as: UTF8.self).contains("\"modelId\":\"a\\/cheap\""))
        #expect(!String(decoding: without, as: UTF8.self).contains("modelId"))
    }

    @Test("assistant messages expose which model answered, when known")
    func decodesMessageModel() throws {
        let known = #"{"seq":2,"role":"assistant","text":"x","modelId":"a/cheap"}"#
        let missing = #"{"seq":3,"role":"assistant","text":"x"}"#

        #expect(try JSONDecoder().decode(ChatQueueMessage.self, from: Data(known.utf8)).modelId == "a/cheap")
        #expect(try JSONDecoder().decode(ChatQueueMessage.self, from: Data(missing.utf8)).modelId == nil)
    }

    @Test("a 400 invalid_input on send is recognised as a stale model")
    func staleModelFailure() {
        #expect(ChatQueueFailure.failure(for: APIError.badStatus(400, "invalid_input")) == .invalidModel)
    }
}
