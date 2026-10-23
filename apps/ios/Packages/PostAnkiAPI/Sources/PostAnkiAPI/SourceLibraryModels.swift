import Foundation

public struct SourceLibraryItem: Decodable, Sendable, Hashable, Identifiable {
    public let id: String
    public let curriculumId: String
    public let curriculumName: String
    public let subjectId: String
    public let subjectName: String
    public let kind: String
    public let value: String
    public let title: String?
    public let fetchState: String
    public let lastFetchedAt: String?
    public let lastFetchOutcome: String?
    public let createdAt: String

    public var isLink: Bool { kind == "link" }

    public var displayTitle: String {
        if let title, !title.isEmpty { return title }

        return value
    }

    public var kindLabel: String {
        switch kind {
        case "link": "Link"
        case "text": "Text"
        case "web_research": "Web research"
        case "llms_txt": "llms.txt"
        default: kind.capitalized
        }
    }

    public var groupTitle: String { "\(subjectName) · \(curriculumName)" }
}

public struct SourceLibraryRefetchResult: Decodable, Sendable {
    public let sourceId: String
    public let outcome: String
    public let lastFetchedAt: String?
    public let fetchedTextUpdated: Bool
}

public struct SourceLibraryDeleteResult: Decodable, Sendable {
    public let id: String
    public let deleted: Bool
}

public struct ContentInboxItem: Decodable, Sendable, Hashable, Identifiable {
    public let id: String
    public let body: String
    public let sourceRef: String?
    public let suggestedPlacement: String?
    public let createdAt: String
}
