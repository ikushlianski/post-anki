import Foundation

public struct CardFace: Equatable, Hashable, Sendable {
    public let context: String?
    public let front: String

    public init(context: String?, front: String) {
        self.context = context
        self.front = front
    }

    public static func make(context: String?, prompt: String) -> CardFace {
        if let context {
            return CardFace(context: clean(context), front: prompt)
        }

        let lines = prompt
            .split(whereSeparator: \.isNewline)
            .map { $0.trimmingCharacters(in: .whitespaces) }
            .filter { !$0.isEmpty }

        guard lines.count == 2 else { return CardFace(context: nil, front: prompt) }

        return CardFace(context: lines[1], front: lines[0])
    }

    private static func clean(_ text: String) -> String? {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)

        return trimmed.isEmpty ? nil : trimmed
    }
}
