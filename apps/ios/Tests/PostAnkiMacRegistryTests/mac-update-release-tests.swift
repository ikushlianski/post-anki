import Foundation
import Testing
@testable import PostAnkiMac

struct MacUpdateReleaseTests {
    private func entry(_ tag: String, draft: Bool = false, prerelease: Bool = false, assets: [String] = ["PostAnkiMac-1.zip"]) -> String {
        let list = assets.map {
            #"{"name":"\#($0)","size":42,"browser_download_url":"https://github.com/o/r/releases/download/\#(tag)/\#($0)"}"#
        }.joined(separator: ",")

        return #"{"tag_name":"\#(tag)","draft":\#(draft),"prerelease":\#(prerelease),"assets":[\#(list)]}"#
    }

    private func newest(_ entries: [String]) throws -> MacUpdateRelease? {
        try MacUpdateReleaseFeed.newest(from: Data("[\(entries.joined(separator: ","))]".utf8))
    }

    @Test func shouldReadTheDownloadLinkAndSizeOfTheMacZip() throws {
        let release = try #require(try newest([entry("v0.1.7")]))

        #expect(release.tag == "v0.1.7")
        #expect(release.assetSize == 42)
        #expect(release.assetURL.absoluteString.hasSuffix("/v0.1.7/PostAnkiMac-1.zip"))
    }

    @Test func shouldSkipDraftsAndPrereleases() throws {
        let release = try newest([entry("v0.1.9", draft: true), entry("v0.1.8", prerelease: true), entry("v0.1.7")])

        #expect(release?.tag == "v0.1.7")
    }

    @Test func shouldFallBackToTheOlderReleaseWhenTheNewestHasNoMacZipYet() throws {
        let release = try newest([entry("v0.1.9", assets: []), entry("v0.1.8")])

        #expect(release?.tag == "v0.1.8")
    }

    @Test func shouldIgnoreAssetsThatAreNotTheMacZip() throws {
        #expect(try newest([entry("v0.1.9", assets: ["notes.zip", "PostAnkiMac-9.dmg"])]) == nil)
    }

    @Test func shouldOfferNothingForAnEmptyList() throws {
        #expect(try newest([]) == nil)
    }
}
