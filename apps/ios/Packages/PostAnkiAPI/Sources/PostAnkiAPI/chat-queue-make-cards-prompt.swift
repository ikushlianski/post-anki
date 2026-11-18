import Foundation

public enum ChatQueueMakeCardsPrompt {
    private static let intro = "Propose flashcards from this part of your answer:\n\"\"\"\n"
    private static let outro = "\n\"\"\""

    public static func message(for selection: String) -> String? {
        let trimmed = selection.trimmingCharacters(in: .whitespacesAndNewlines)

        guard !trimmed.isEmpty else { return nil }

        let room = ChatQueueLimits.maxMessageChars - intro.utf16.count - outro.utf16.count

        return intro + clip(trimmed, toUTF16: room) + outro
    }

    private static func clip(_ text: String, toUTF16 limit: Int) -> String {
        var used = 0
        var result = ""

        for character in text {
            used += character.utf16.count

            if used > limit { break }

            result.append(character)
        }

        return result
    }

    public static func pendingIndexes(in proposals: [ChatQueueProposal]) -> [Int] {
        proposals.filter { $0.status == .pending }.map(\.index)
    }
}
