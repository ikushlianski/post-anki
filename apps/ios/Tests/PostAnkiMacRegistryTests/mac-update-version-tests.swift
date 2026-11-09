import Testing
@testable import PostAnkiMac

struct MacUpdateVersionTests {
    @Test func shouldCompareReleaseNumbersNumericallyNotAlphabetically() throws {
        #expect(try #require(MacUpdateVersion(tag: "v0.1.9")) < #require(MacUpdateVersion(tag: "v0.1.10")))
    }

    @Test func shouldNotTreatTheSameVersionAsNewer() throws {
        let tag = try #require(MacUpdateVersion(tag: "v0.1.5"))
        let installed = try #require(MacUpdateVersion(tag: "0.1.5"))

        #expect(!(tag > installed))
    }

    @Test func shouldRejectTagsThatAreNotThreeNumbers() {
        for tag in ["latest", "v1", "v0.1.x", "v0.1", "v0.1.2.3", ""] {
            #expect(MacUpdateVersion(tag: tag) == nil)
        }
    }

    @Test func shouldOfferATagNewerThanTheShippedMarketingVersion() throws {
        #expect(try #require(MacUpdateVersion(tag: "v0.1.1")) > #require(MacUpdateVersion(tag: "0.1.0")))
    }
}
