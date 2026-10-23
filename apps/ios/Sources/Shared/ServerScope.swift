import Foundation
import PostAnkiAPI

enum ServerScope {
    static var current: String {
        normalize(APIClient.baseURLString)
    }

    static func normalize(_ address: String) -> String {
        var value = address.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()

        while value.hasSuffix("/") {
            value.removeLast()
        }

        return value
    }

    static func matches(_ stored: String?) -> Bool {
        guard let stored else { return true }

        return stored == current
    }
}
