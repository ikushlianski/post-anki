import Foundation
import PostAnkiAPI
import Testing

extension SmokeTests {
    @MainActor
    @Suite("Ask and Topic chats recover from a stale chat model")
    struct ChatModelRecoverySmokeTests {
        private let options = [ChatModelOption(id: "a/cheap", label: "Cheap One", isDefault: true)]

        private func makeDefaults() -> UserDefaults {
            let name = "chat-model-recovery-\(UUID().uuidString)"
            let defaults = UserDefaults(suiteName: name)!
            defaults.removePersistentDomain(forName: name)

            return defaults
        }

        @Test("should reset to the default model, clear the saved choice and keep the question when the server rejects the model")
        func rejectedModelResetsToDefault() async {
            let defaults = makeDefaults()
            ChatModelSelection.select("gone/model", defaults: defaults)

            let catalog = ChatModelCatalog(defaults: defaults, fetch: { [options] in options })
            let chat = StudyChatModel(
                recoverFromStaleModel: {
                    catalog.reset()
                    await catalog.refresh()
                },
                send: { _, _ in throw APIError.badStatus(400, "invalid_input") }
            )
            chat.draft = "What is a monad?"

            await chat.send()

            #expect(catalog.selectedId == nil)
            #expect(ChatModelSelection.selectedId(defaults: defaults) == nil)
            #expect(chat.errorMessage == ChatQueueFailure.invalidModel.message)
            #expect(chat.draft == "What is a monad?")
            #expect(chat.turns.isEmpty)
            #expect(!chat.isSending)
        }

        @Test("should answer the retried question after the model was reset")
        func retryAfterResetSucceeds() async {
            var attempts = 0
            let chat = StudyChatModel(
                recoverFromStaleModel: {},
                send: { _, _ in
                    attempts += 1

                    if attempts == 1 { throw APIError.badStatus(400, "invalid_input") }

                    return StudyChatReply(reply: "A monad is...", matchedCards: [], lookupFailed: false)
                }
            )
            chat.draft = "What is a monad?"

            await chat.send()
            await chat.send()

            #expect(chat.errorMessage == nil)
            #expect(chat.turns.last?.entry.text == "A monad is...")
        }

        @Test("should not touch the model choice for other failures")
        func otherFailuresKeepModel() async {
            var recovered = false
            let chat = StudyChatModel(
                recoverFromStaleModel: { recovered = true },
                send: { _, _ in throw URLError(.notConnectedToInternet) }
            )
            chat.draft = "hello"

            await chat.send()

            #expect(!recovered)
            #expect(chat.errorMessage == "Couldn't connect to the server. Try again.")
        }

        @Test("should keep the saved choice when the model list fails to load")
        func failedFetchKeepsSavedChoice() async {
            let defaults = makeDefaults()
            ChatModelSelection.select("a/cheap", defaults: defaults)

            let catalog = ChatModelCatalog(defaults: defaults, fetch: { throw URLError(.notConnectedToInternet) })

            await catalog.refresh()

            #expect(catalog.selectedId == "a/cheap")
            #expect(ChatModelSelection.selectedId(defaults: defaults) == "a/cheap")
        }

        @Test("should drop a saved choice that the fetched list no longer offers")
        func fetchedListDropsUnknownChoice() async {
            let defaults = makeDefaults()
            ChatModelSelection.select("gone/model", defaults: defaults)

            let catalog = ChatModelCatalog(defaults: defaults, fetch: { [options] in options })

            await catalog.refresh()

            #expect(catalog.selectedId == nil)
        }
    }
}
