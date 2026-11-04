import Foundation

public struct MoveToInboxResult: Decodable, Sendable, Equatable {
    public let ok: Bool
    public let inboxCount: Int
}

public struct InboxNoteSource: Decodable, Sendable, Hashable {
    public let variantId: String
    public let mode: String
    public let text: String

    public init(variantId: String, mode: String, text: String) {
        self.variantId = variantId
        self.mode = mode
        self.text = text
    }

    public var kind: NoteEditKind { mode == "cloze" ? .cloze : .list }
}

public struct InboxKnowledgeBit: Decodable, Sendable, Identifiable, Hashable {
    public let id: String
    public let body: String
    public let background: String?
    public let exampleAiGeneratedAt: String?
    public let origin: String
    public let subjectName: String?
    public let cardCount: Int
    public let inboxAt: String
    public let note: InboxNoteSource?

    public init(
        id: String,
        body: String,
        background: String?,
        exampleAiGeneratedAt: String?,
        origin: String,
        subjectName: String?,
        cardCount: Int,
        inboxAt: String,
        note: InboxNoteSource? = nil
    ) {
        self.id = id
        self.body = body
        self.background = background
        self.exampleAiGeneratedAt = exampleAiGeneratedAt
        self.origin = origin
        self.subjectName = subjectName
        self.cardCount = cardCount
        self.inboxAt = inboxAt
        self.note = note
    }

    public func withExample(_ background: String?, aiGeneratedAt: String?) -> InboxKnowledgeBit {
        InboxKnowledgeBit(
            id: id,
            body: body,
            background: background,
            exampleAiGeneratedAt: aiGeneratedAt,
            origin: origin,
            subjectName: subjectName,
            cardCount: cardCount,
            inboxAt: inboxAt,
            note: note
        )
    }

    public var hasHumanExample: Bool {
        let text = background?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""

        return !text.isEmpty && exampleAiGeneratedAt == nil
    }
}

public struct InboxKnowledgeBitList: Decodable, Sendable {
    public let items: [InboxKnowledgeBit]
    public let count: Int
    public let hasMore: Bool?
    public let total: Int?

    public var truncation: ListTruncation? {
        ListTruncation.make(shown: items.count, hasMore: hasMore, total: total)
    }
}

public struct GenerateKnowledgeBitExampleInput: Encodable, Sendable {
    public let overwrite: Bool?

    public init(overwrite: Bool? = nil) {
        self.overwrite = overwrite
    }
}

public struct GenerateKnowledgeBitExampleResult: Decodable, Sendable, Equatable {
    public let knowledgeBitId: String
    public let example: String
    public let exampleAiGeneratedAt: String
    public let previousExample: String?
    public let generationsLeft: Int
}

public enum KnowledgeBitExampleLimits {
    public static let maxGenerations = 5
}
