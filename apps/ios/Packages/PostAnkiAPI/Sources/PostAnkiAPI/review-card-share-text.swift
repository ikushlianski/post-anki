import Foundation

public extension ReviewCard {
    var shareText: String {
        let question = Self.withoutHints(prompt).trimmingCharacters(in: .whitespacesAndNewlines)
        let answerText = shareAnswer.trimmingCharacters(in: .whitespacesAndNewlines)

        return "Q: \(question)\nA: \(answerText)"
    }

    private var shareAnswer: String {
        guard CardKind.isBlank(kind) else { return answer }

        let pieces = Self.withoutHints(prompt).components(separatedBy: CardKind.blank)
        let answers = answer.components(separatedBy: " / ")

        guard pieces.count >= 2, answers.count == pieces.count - 1 else { return answer }

        return pieces.enumerated().map { index, piece in
            index < answers.count ? piece + answers[index] : piece
        }.joined()
    }

    private static func withoutHints(_ text: String) -> String {
        text.replacingOccurrences(of: #" \(hint: [^)]*\)"#, with: "", options: .regularExpression)
    }
}
