import Foundation

public enum ChatQueueCardLimits {
    public static let maxFrontChars = 300
    public static let maxBackChars = 600
}

public struct ChatQueueCardDraft: Sendable, Equatable {
    public let seq: Int
    public var front: String
    public var back: String

    public init(seq: Int, front: String = "", back: String) {
        self.seq = seq
        self.front = front
        self.back = back
    }

    public var trimmedFront: String { front.trimmingCharacters(in: .whitespacesAndNewlines) }

    public var trimmedBack: String { back.trimmingCharacters(in: .whitespacesAndNewlines) }

    public var isSavable: Bool {
        !trimmedFront.isEmpty && !trimmedBack.isEmpty
            && trimmedFront.count <= ChatQueueCardLimits.maxFrontChars
            && trimmedBack.count <= ChatQueueCardLimits.maxBackChars
    }
}

struct CreateChatQueueCardInput: Encodable, Sendable {
    let front: String
    let back: String
}

struct CreateChatQueueCardResult: Decodable, Sendable {
    let id: String
}
