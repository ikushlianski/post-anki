import Foundation

public struct RejectedSubjectOption: Sendable, Equatable, Identifiable, Hashable {
    public let id: String
    public let label: String
}

public enum RejectedSubjectOptions {
    public static let separator = " › "

    public static func options(from subjects: [Subject]) -> [RejectedSubjectOption] {
        let byId = Dictionary(subjects.map { ($0.id, $0) }, uniquingKeysWith: { first, _ in first })

        return subjects
            .map { RejectedSubjectOption(id: $0.id, label: pathLabel($0, byId: byId)) }
            .sorted { $0.label.localizedCaseInsensitiveCompare($1.label) == .orderedAscending }
    }

    private static func pathLabel(_ subject: Subject, byId: [String: Subject]) -> String {
        var names: [String] = []
        var visited: Set<String> = []
        var cursor: Subject? = subject

        while let current = cursor, visited.insert(current.id).inserted {
            names.insert(current.name, at: 0)
            cursor = current.parentId.flatMap { byId[$0] }
        }

        return names.joined(separator: separator)
    }
}
