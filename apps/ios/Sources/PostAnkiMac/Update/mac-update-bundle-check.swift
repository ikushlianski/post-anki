import Foundation

enum MacUpdateBundleCheck {
    enum Failure: Error, Equatable {
        case missingKeys
        case wrongBundleID
        case notNewer
        case versionMismatch
    }

    static func validate(
        info: [String: Any],
        currentVersion: MacUpdateVersion,
        expectedTag: String,
        bundleID: String
    ) -> Failure? {
        guard let id = info["CFBundleIdentifier"] as? String,
              let versionText = info["CFBundleShortVersionString"] as? String,
              let version = MacUpdateVersion(tag: versionText),
              let expected = MacUpdateVersion(tag: expectedTag)
        else { return .missingKeys }

        if id != bundleID { return .wrongBundleID }

        if version != expected { return .versionMismatch }

        return version > currentVersion ? nil : .notNewer
    }
}
