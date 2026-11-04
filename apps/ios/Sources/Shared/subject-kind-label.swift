import Foundation

enum SubjectKindLabel {
    static let defaultKind = "architecture-mentor"

    static func badge(for kind: String) -> String? {
        guard kind != defaultKind else { return nil }

        switch kind {
        case "language-practice": return "Language practice"
        default:
            let words = kind.replacingOccurrences(of: "-", with: " ").replacingOccurrences(of: "_", with: " ")

            return words.isEmpty ? nil : words.prefix(1).uppercased() + words.dropFirst()
        }
    }
}
