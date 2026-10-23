import Foundation

public struct GlobalSearchItem: Decodable, Sendable, Hashable, Identifiable {
    public let id: String
    public let label: String
}

public struct GlobalSearchTopicItem: Decodable, Sendable, Hashable, Identifiable {
    public let id: String
    public let label: String
    public let curriculumId: String
}

public struct GlobalSearchResponse: Decodable, Sendable {
    public let subjects: [GlobalSearchItem]
    public let curricula: [GlobalSearchItem]
    public let topics: [GlobalSearchTopicItem]

    public var isEmpty: Bool { subjects.isEmpty && curricula.isEmpty && topics.isEmpty }
}

public struct GlobalSearchTag: Decodable, Sendable, Hashable, Identifiable {
    public let id: String
    public let name: String
}

public struct GlobalSearchRankedResult: Decodable, Sendable, Hashable, Identifiable {
    public let id: String
    public let kind: String
    public let title: String
    public let curriculumId: String?
    public let curriculumName: String?
    public let tags: [GlobalSearchTag]

    public var rowId: String { "\(kind)-\(id)" }

    public var iconName: String {
        switch kind {
        case "topic": "book"
        case "module": "square.stack"
        default: "text.alignleft"
        }
    }
}
