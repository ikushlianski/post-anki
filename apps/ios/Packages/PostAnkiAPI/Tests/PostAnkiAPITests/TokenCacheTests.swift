import Foundation
import Testing
@testable import PostAnkiAPI

@Suite("Token cache")
struct TokenCacheTests {
    @Test("should read the keychain once and reuse the token for later requests")
    func loadsOnce() {
        let cache = TokenCache()
        var loads = 0
        let load: () -> String? = { loads += 1; return "tok" }

        #expect(cache.read(load: load) == "tok")
        #expect(cache.read(load: load) == "tok")
        #expect(loads == 1)
    }

    @Test("should serve a saved token without another keychain read")
    func saveReplacesCache() {
        let cache = TokenCache()
        var loads = 0
        _ = cache.read { loads += 1; return "old" }

        cache.set("new")

        #expect(cache.read { loads += 1; return "old" } == "new")
        #expect(loads == 1)
    }

    @Test("should report no token after the token is removed")
    func clearEmptiesCache() {
        let cache = TokenCache()
        _ = cache.read { "tok" }

        cache.set(nil)

        #expect(cache.read { "tok" } == nil)
    }
}
