import Foundation

public struct DailyPushGap: Decodable, Sendable, Hashable {
    public let id: String
    public let label: String
}

public struct DailyPushPick: Decodable, Sendable, Hashable, Identifiable {
    public let topicId: String
    public let topicTitle: String
    public let curriculumId: String
    public let curriculumName: String
    public let gap: DailyPushGap
    public let reason: String

    public var id: String { "\(topicId)-\(gap.id)" }

    public var reasonLabel: String {
        switch reason {
        case "important": "Marked important"
        case "wanted": "You wanted this"
        case "weakest": "Your weakest spot"
        default: "Due a refresh"
        }
    }
}

public struct DailyPushQuestion: Decodable, Sendable, Hashable {
    public let gapId: String?
    public let gapLabel: String?
    public let kind: String
    public let prompt: String
}

public struct DailyPushResponse: Decodable, Sendable {
    public let push: DailyPushPick?
    public let question: DailyPushQuestion?
}

public struct DueQueueResponse: Decodable, Sendable {
    public let items: [DailyPushPick]
}
