import Foundation
import PostAnkiAPI

struct AddKnowledgePiece: Identifiable, Equatable {
    let id: UUID
    var text = ""
    var highlights: [KnowledgeHighlight] = []
    var targetPhrases: [String] = [""]
    var failure: String?
    var canAddAnyway = false

    init(id: UUID = UUID(), text: String = "") {
        self.id = id
        self.text = text
    }

    var isEmpty: Bool { text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }
}

enum AddKnowledgePieceDraft {
    private static let marker = "post-anki-pieces:"

    static func encode(_ texts: [String]) -> String {
        guard texts.count > 1 else { return texts.first ?? "" }

        var limit = AddDraftLimits.maxChars

        while limit > 0 {
            let clipped = texts.map { String($0.prefix(limit)) }

            if let json = try? JSONEncoder().encode(clipped), let text = String(data: json, encoding: .utf8),
               (marker + text).count <= AddDraftLimits.maxChars {
                return marker + text
            }

            limit = limit * 4 / 5 - 1
        }

        return ""
    }

    static func decode(_ draft: String) -> [String] {
        guard draft.hasPrefix(marker) else { return [draft] }

        guard let data = draft.dropFirst(marker.count).data(using: .utf8),
              let texts = try? JSONDecoder().decode([String].self, from: data),
              !texts.isEmpty
        else { return [""] }

        return texts
    }

    static func failedMessage(positions: [Int]) -> String {
        let numbers = positions.map { String($0 + 1) }

        return positions.count == 1
            ? "Piece \(numbers[0]) could not be added. Try again."
            : "Pieces \(numbers.joined(separator: ", ")) could not be added. Try again."
    }
}
