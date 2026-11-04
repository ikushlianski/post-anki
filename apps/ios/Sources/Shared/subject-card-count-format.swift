import Foundation

enum SubjectCardCountFormat {
    static func text(_ count: Int?) -> String? {
        guard let count else { return nil }

        return "\(count) \(count == 1 ? "card" : "cards")"
    }
}
