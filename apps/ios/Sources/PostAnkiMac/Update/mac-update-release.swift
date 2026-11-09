import Foundation

struct MacUpdateRelease: Equatable {
    let tag: String
    let version: MacUpdateVersion
    let assetURL: URL
    let assetSize: Int
}

struct MacUpdateReleaseEntry: Decodable {
    struct Asset: Decodable {
        let name: String
        let size: Int
        let browserDownloadURL: URL

        enum CodingKeys: String, CodingKey {
            case name, size
            case browserDownloadURL = "browser_download_url"
        }
    }

    let tagName: String
    let draft: Bool
    let prerelease: Bool
    let assets: [Asset]

    enum CodingKeys: String, CodingKey {
        case draft, prerelease, assets
        case tagName = "tag_name"
    }
}

enum MacUpdateReleaseFeed {
    static let url = URL(string: "https://api.github.com/repos/ikushlianski/post-anki/releases?per_page=10")!

    static func newest(from data: Data) throws -> MacUpdateRelease? {
        let entries = try JSONDecoder().decode([MacUpdateReleaseEntry].self, from: data)

        return entries.compactMap(release(from:)).max { $0.version < $1.version }
    }

    private static func release(from entry: MacUpdateReleaseEntry) -> MacUpdateRelease? {
        guard !entry.draft, !entry.prerelease, let version = MacUpdateVersion(tag: entry.tagName),
              let asset = entry.assets.first(where: { isMacAsset($0.name) })
        else { return nil }

        return MacUpdateRelease(tag: entry.tagName, version: version, assetURL: asset.browserDownloadURL, assetSize: asset.size)
    }

    private static func isMacAsset(_ name: String) -> Bool {
        name.range(of: #"^PostAnkiMac-.*\.zip$"#, options: .regularExpression) != nil
    }
}
