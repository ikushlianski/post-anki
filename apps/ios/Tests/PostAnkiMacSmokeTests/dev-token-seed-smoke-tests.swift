import Testing

extension SmokeTests {
    @Suite("The baked dev token never replaces a working saved token")
    struct DevTokenSeedSmokeTests {
        @Test("should seed the baked token only when no token is saved")
        func seedsOnlyWhenEmpty() {
            #expect(DevTokenSeed.seedToken(saved: nil, baked: "baked") == "baked")
            #expect(DevTokenSeed.seedToken(saved: "  ", baked: "baked") == "baked")
            #expect(DevTokenSeed.seedToken(saved: "mine", baked: "baked") == nil)
        }

        @Test("should not seed when no baked token is configured")
        func skipsEmptyBaked() {
            #expect(DevTokenSeed.seedToken(saved: nil, baked: "") == nil)
            #expect(DevTokenSeed.retryToken(rejected: "mine", baked: "") == nil)
        }

        @Test("should retry with the baked token only when it differs from the rejected one")
        func retriesWithDifferentBaked() {
            #expect(DevTokenSeed.retryToken(rejected: "mine", baked: "baked") == "baked")
            #expect(DevTokenSeed.retryToken(rejected: "baked", baked: "baked") == nil)
        }
    }
}
