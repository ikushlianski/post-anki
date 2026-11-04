import Foundation

public enum ChatQueueLimits {
    public static let maxUserTurns = 8
    public static let maxMessageChars = 1_000
    public static let starterPrompts = [
        "Why is this card worth keeping?",
        "Explain this in simpler words",
        "Is the answer fully supported by the source?",
        "How could this question be clearer?"
    ]
}

public struct ChatQueueItem: Decodable, Sendable, Identifiable, Hashable {
    public let id: String
    public let body: String
    public let background: String?
    public let origin: String
    public let subjectId: String?
    public let subjectName: String?
    public let chatAt: String
    public let turnsLeft: Int
    public let snoozedUntil: Date?
    public let sourceTitle: String?
    public let sourceUrl: String?
    public let rejectReasonCodes: [String]?
    public let reviewChat: Bool

    public init(
        id: String,
        body: String,
        background: String? = nil,
        origin: String = "extracted",
        subjectId: String? = nil,
        subjectName: String? = nil,
        chatAt: String,
        turnsLeft: Int,
        snoozedUntil: Date? = nil,
        sourceTitle: String? = nil,
        sourceUrl: String? = nil,
        rejectReasonCodes: [String]? = nil,
        reviewChat: Bool = false
    ) {
        self.reviewChat = reviewChat
        self.rejectReasonCodes = rejectReasonCodes
        self.id = id
        self.body = body
        self.background = background
        self.origin = origin
        self.subjectId = subjectId
        self.subjectName = subjectName
        self.chatAt = chatAt
        self.turnsLeft = turnsLeft
        self.snoozedUntil = snoozedUntil
        self.sourceTitle = sourceTitle
        self.sourceUrl = sourceUrl
    }

    private enum CodingKeys: String, CodingKey {
        case id, body, background, origin, subjectId, subjectName, chatAt, turnsLeft, snoozedUntil, sourceTitle, sourceUrl, rejectReasonCodes, reviewChat
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)

        id = try container.decode(String.self, forKey: .id)
        body = try container.decode(String.self, forKey: .body)
        background = try container.decodeIfPresent(String.self, forKey: .background)
        origin = try container.decode(String.self, forKey: .origin)
        subjectId = (try? container.decodeIfPresent(String.self, forKey: .subjectId)) ?? nil
        subjectName = try container.decodeIfPresent(String.self, forKey: .subjectName)
        chatAt = try container.decode(String.self, forKey: .chatAt)
        turnsLeft = try container.decode(Int.self, forKey: .turnsLeft)
        snoozedUntil = (try? container.decodeIfPresent(String.self, forKey: .snoozedUntil)).flatMap(ChatQueueDate.parse)
        sourceTitle = (try? container.decodeIfPresent(String.self, forKey: .sourceTitle)) ?? nil
        sourceUrl = (try? container.decodeIfPresent(String.self, forKey: .sourceUrl)) ?? nil
        rejectReasonCodes = (try? container.decodeIfPresent([String].self, forKey: .rejectReasonCodes)) ?? nil
        reviewChat = try container.decodeIfPresent(Bool.self, forKey: .reviewChat) ?? false
    }

    public var sourceLink: URL? { ChatQueueSourceLink.safeURL(sourceUrl) }

    public func isSnoozed(at now: Date = Date()) -> Bool {
        guard let snoozedUntil else { return false }

        return snoozedUntil > now
    }
}

public enum ChatQueueSourceLink {
    public static func safeURL(_ raw: String?) -> URL? {
        guard let raw, let url = URL(string: raw.trimmingCharacters(in: .whitespacesAndNewlines)),
              let scheme = url.scheme?.lowercased(), scheme == "http" || scheme == "https",
              url.host?.isEmpty == false
        else { return nil }

        return url
    }
}

enum ChatQueueDate {
    static func parse(_ value: String) -> Date? {
        let fractional = ISO8601DateFormatter()

        fractional.formatOptions = [.withInternetDateTime, .withFractionalSeconds]

        if let date = fractional.date(from: value) { return date }

        return ISO8601DateFormatter().date(from: value)
    }
}

public struct ChatQueueList: Decodable, Sendable, Hashable {
    public let items: [ChatQueueItem]
    public let count: Int
    public let hasMore: Bool?
    public let total: Int?

    public var truncation: ListTruncation? {
        ListTruncation.make(shown: items.count, hasMore: hasMore, total: total)
    }

    public init(items: [ChatQueueItem], count: Int, hasMore: Bool? = nil, total: Int? = nil) {
        self.items = items
        self.count = count
        self.hasMore = hasMore
        self.total = total
    }
}

public enum ChatQueueRole: String, Decodable, Sendable, Hashable {
    case user
    case assistant
}

public struct ChatQueueMessage: Decodable, Sendable, Identifiable, Hashable {
    public let seq: Int
    public let role: ChatQueueRole
    public let text: String
    public let createdAt: String

    public var id: Int { seq }

    public init(seq: Int, role: ChatQueueRole, text: String, createdAt: String) {
        self.seq = seq
        self.role = role
        self.text = text
        self.createdAt = createdAt
    }

    private enum CodingKeys: String, CodingKey {
        case seq, role, text, createdAt
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)

        seq = try container.decode(Int.self, forKey: .seq)
        role = (try? container.decode(ChatQueueRole.self, forKey: .role)) ?? .assistant
        text = try container.decode(String.self, forKey: .text)
        createdAt = try container.decodeIfPresent(String.self, forKey: .createdAt) ?? ""
    }
}

public struct ChatQueueThread: Decodable, Sendable, Hashable {
    public let messages: [ChatQueueMessage]
    public let turnsLeft: Int
    public let capReached: Bool

    public init(messages: [ChatQueueMessage], turnsLeft: Int, capReached: Bool) {
        self.messages = messages
        self.turnsLeft = turnsLeft
        self.capReached = capReached
    }
}

public struct ChatQueueReply: Decodable, Sendable, Hashable {
    public let reply: String
    public let turnsLeft: Int
    public let capReached: Bool

    public init(reply: String, turnsLeft: Int, capReached: Bool) {
        self.reply = reply
        self.turnsLeft = turnsLeft
        self.capReached = capReached
    }
}

public struct DeleteLastChatExchangeResult: Decodable, Sendable, Hashable {
    public let turnsLeft: Int?
    public let capReached: Bool

    public init(turnsLeft: Int?, capReached: Bool) {
        self.turnsLeft = turnsLeft
        self.capReached = capReached
    }

    enum CodingKeys: String, CodingKey { case turnsLeft, capReached }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)

        turnsLeft = try container.decodeIfPresent(Int.self, forKey: .turnsLeft)
        capReached = try container.decodeIfPresent(Bool.self, forKey: .capReached) ?? false
    }
}

struct MoveToChatQueueResult: Decodable, Sendable {
    let chatCount: Int
}

struct SnoozeChatQueueInput: Encodable, Sendable {
    let days: Int
}

struct SnoozeChatQueueResult: Decodable, Sendable {
    let snoozedUntil: String?
}

struct SendChatQueueMessageInput: Encodable, Sendable {
    let clientMessageId: String
    let message: String
}
